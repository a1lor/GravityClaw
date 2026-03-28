import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface TaskInfo {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  lastMessage?: string
  progress?: number
  error?: string
}

interface StudioLastOutput {
  job?: { title: string; company: string; url: string }
  text?: string
  files?: Array<{ kind: string; name: string }>
  updated_at?: string
}

function withToken(path: string): string {
  const token = localStorage.getItem('gc_token') ?? ''
  const u = new URL(path, window.location.origin)
  if (token) u.searchParams.set('token', token)
  return u.toString()
}

async function pollTask(taskId: string): Promise<TaskInfo> {
  // Poll until we hit a terminal state.
  // Keep it simple and UI-friendly.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const t = await api.get<TaskInfo>(`/api/tasks/${taskId}`)
    if (t.status === 'done' || t.status === 'error' || t.status === 'cancelled') return t
    await new Promise((r) => setTimeout(r, 1100))
  }
}

export function PipelineStudioTab() {
  const qc = useQueryClient()

  const { data: last } = useQuery<StudioLastOutput | null>({
    queryKey: ['studio-last'],
    queryFn: () => api.get<StudioLastOutput | null>('/api/studio/last'),
    staleTime: 30_000,
  })

  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<null | { taskId: string; label: string }>(null)

  useEffect(() => {
    if (last?.job?.url) setUrl(last.job.url)
    if (typeof last?.text === 'string') setText(last.text)
  }, [last?.updated_at])

  const pdfFile = useMemo(() => last?.files?.find((f) => f.kind === 'pdf') ?? null, [last])
  const txtFile = useMemo(() => last?.files?.find((f) => f.kind === 'txt') ?? null, [last])

  async function generate() {
    const clean = url.trim()
    if (!clean) return alert('Paste a job offer URL first')

    setBusy({ taskId: 'pending', label: 'Generating cover letter…' })
    try {
      const { taskId } = await api.post<{ taskId: string }>('/api/studio/coverletter', { url: clean })
      setBusy({ taskId, label: 'Generating cover letter…' })
      await pollTask(taskId)
      await qc.invalidateQueries({ queryKey: ['studio-last'] })
    } catch (err: any) {
      alert(err?.message || 'Failed to start generation')
    } finally {
      setBusy(null)
    }
  }

  async function exportEdited() {
    const clean = text.trim()
    if (!clean) return alert('Nothing to export')

    setBusy({ taskId: 'pending', label: 'Syncing…' })
    try {
      const { taskId } = await api.post<{ taskId: string }>('/api/studio/coverletter', { text: clean })
      setBusy({ taskId, label: 'Syncing…' })
      await pollTask(taskId)
      await qc.invalidateQueries({ queryKey: ['studio-last'] })
    } catch (err: any) {
      alert(err?.message || 'Failed to export')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '16px 16px 8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Studio</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Generate / edit cover letters</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 16, padding: 16, minHeight: 0 }}>
        {/* Left: generator */}
        <div style={{ width: 380, flexShrink: 0, background: '#0a0d14', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Generate from URL
          </div>

          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste job offer link…"
            style={{
              width: '100%',
              height: 42,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '0 12px',
              color: '#e2e8f0',
              outline: 'none',
              fontSize: 13,
            }}
          />

          <button
            onClick={generate}
            disabled={!!busy}
            style={{
              width: '100%',
              marginTop: 12,
              height: 44,
              background: 'rgba(167,139,250,0.12)',
              border: '1px solid rgba(167,139,250,0.28)',
              borderRadius: 12,
              color: '#a78bfa',
              fontSize: 14,
              fontWeight: 900,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? busy.label : '✨ Generate'}
          </button>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              Last generated
            </div>

            <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 800, marginBottom: 6 }}>
              {last?.job?.title ? `${last.job.title}` : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
              {last?.job?.company ? `${last.job.company}` : ''}
            </div>

            <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
              {pdfFile ? 'Exports are available in EXPORT & SYNC.' : 'Generate a letter to unlock exports.'}
            </div>
          </div>
        </div>

        {/* Right: editor */}
        <div style={{ flex: 1, minWidth: 0, background: '#080a10', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: 16, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#475569', letterSpacing: 1, textTransform: 'uppercase' }}>Editor</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Edit the draft below</div>
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your cover letter will appear here…"
            style={{
              width: '100%',
              minHeight: 420,
              background: 'rgba(0,0,0,0.15)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: 12,
              color: '#e2e8f0',
              fontSize: 13,
              lineHeight: 1.6,
              outline: 'none',
              resize: 'vertical',
            }}
          />

          {/* Export & Sync */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: '#71717a', marginBottom: 12, textTransform: 'uppercase' }}>
              EXPORT & SYNC
            </div>

            <button
              onClick={exportEdited}
              disabled={!text.trim() || !!busy}
              style={{
                width: '100%',
                height: 44,
                background: '#3B82F620',
                border: '1px solid #3B82F660',
                borderRadius: 12,
                color: '#3b82f6',
                fontSize: 13,
                fontWeight: 800,
                cursor: !text.trim() || !!busy ? 'not-allowed' : 'pointer',
                opacity: !text.trim() || !!busy ? 0.6 : 1,
              }}
            >
              {busy ? busy.label : 'Sync to Desktop'}
            </button>

            <div style={{ fontSize: 9, color: '#52525b', textAlign: 'center', marginTop: 8 }}>
              ~/Desktop/GravityClaw-Exports/cover-letters
            </div>

            <div style={{ marginTop: 10 }}>
              {pdfFile ? (
                <a
                  href={withToken(`/api/studio/files/${encodeURIComponent(pdfFile.name)}`)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    width: '100%',
                    height: 44,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    color: '#e4e4e7',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Download as PDF
                </a>
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: 44,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    color: '#52525b',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Download as PDF
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
