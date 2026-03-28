import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface SearchResult {
  type: 'job' | 'email' | 'memory'
  id: string | number
  title: string
  subtitle: string
  url?: string
}

interface LogEntry {
  id: number
  level: 'log' | 'warn' | 'err'
  message: string
  created_at: string
}

interface Status {
  telegramConnected: boolean
  gmailConnected: boolean
  env: string
  uptime?: number
  memoryCount?: number
  jobCount?: number
}

interface CommandBarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

type Mode = 'search' | 'settings' | 'logs' | 'cv'

export function CommandBar({ open, setOpen }: CommandBarProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('search')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setMode('search')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // Search Logic
  useEffect(() => {
        if (mode !== 'search' || !query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
                const data = await api.get<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`)
                setResults(data)
        setSelectedIndex(0)
      } catch (err) {
              }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, mode])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % (results.length || 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + (results.length || 1)) % (results.length || 1))
      } else if (e.key === 'Enter') {
        if (mode === 'search' && results[selectedIndex]) {
          handleSelect(results[selectedIndex])
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
                setMode('settings')
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault()
        setMode('cv')
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault()
                setMode('logs')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, results, selectedIndex, mode])

  const handleSelect = (res: SearchResult) => {
    if (res.type === 'job') {
      navigate(`/pipeline`)
    } else if (res.type === 'email') {
      navigate(`/inbox`)
      if (res.url) window.open(res.url, '_blank')
    } else if (res.type === 'memory') {
      navigate(`/agent?tab=memories&memoryId=${res.id}`)
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        transition: 'all 0.2s ease-in-out',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: '640px',
          maxHeight: '70vh',
          background: 'rgba(15, 17, 23, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(245, 158, 11, 0.1)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'scaleIn 0.2s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input Area */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, color: '#F59E0B' }}>
            {mode === 'search' ? '🔍' : mode === 'settings' ? '⚙️' : mode === 'cv' ? '🗃️' : '📜'}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              mode === 'search' ? 'Search jobs, emails, memories...' :
              mode === 'settings' ? 'Settings mode' : mode === 'cv' ? 'CV Manager' : 'Logs viewer'
            }
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#f1f5f9', fontSize: 16, fontWeight: 400,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
             <Kbd label="ESC" />
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {mode === 'search' && (
            <>
              {results.length === 0 && query.trim() && (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                  No results found for "{query}"
                </div>
              )}
              {results.length === 0 && !query.trim() && (
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Suggestions</div>
                  <Suggestion label="Home" icon="🏠" onClick={() => navigate('/')} />
                  <Suggestion label="Pipeline" icon="💼" onClick={() => navigate('/pipeline')} />
                  <Suggestion label="Inbox" icon="📧" onClick={() => navigate('/inbox')} />
                  <Suggestion label="Agent" icon="🤖" onClick={() => navigate('/agent')} />
                  <Suggestion label="CV Manager" icon="🗃️" onClick={() => setMode('cv')} />
                  <Suggestion label="AI Soul Directives" icon="🧬" onClick={() => setMode('settings')} />
                  <Suggestion label="System Logs" icon="📜" onClick={() => setMode('logs')} />
                </div>
              )}
              {results.map((res, i) => (
                <ResultItem
                  key={`${res.type}-${res.id}`}
                  res={res}
                  active={i === selectedIndex}
                  onClick={() => handleSelect(res)}
                />
              ))}
            </>
          )}

          {mode === 'settings' && <EmbeddedSettings />}
          {mode === 'cv' && <EmbeddedCVManager />}
          {mode === 'logs' && <EmbeddedLogs />}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', background: 'rgba(255,255,255,0.02)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <FooterAction label="Search" kbd="⌘S" active={mode === 'search'} onClick={() => setMode('search')} />
            <FooterAction label="Settings" kbd="⌘," active={mode === 'settings'} onClick={() => setMode('settings')} />
            <FooterAction label="CV Manager" kbd="⌘M" active={mode === 'cv'} onClick={() => setMode('cv')} />
            <FooterAction label="Logs" kbd="⌘L" active={mode === 'logs'} onClick={() => setMode('logs')} />
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>GravityClaw V2.1</div>
        </div>
      </div>
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.98) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

function Kbd({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px',
      background: 'rgba(255,255,255,0.1)', color: '#94a3b8',
      borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)',
    }}>{label}</span>
  )
}

function Suggestion({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer', transition: 'background 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, color: '#e2e8f0' }}>{label}</span>
    </div>
  )
}

function ResultItem({ res, active, onClick }: { res: SearchResult; active: boolean; onClick: () => void }) {
  const icon = res.type === 'job' ? '💼' : res.type === 'email' ? '📬' : '🧠'
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16,
        cursor: 'pointer', background: active ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
        borderLeft: `3px solid ${active ? '#F59E0B' : 'transparent'}`,
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: active ? '#F59E0B' : '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.title}</div>
        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.subtitle}</div>
      </div>
      {active && <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>ENTER ↵</span>}
    </div>
  )
}

function FooterAction({ label, kbd, active, onClick }: { label: string; kbd: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: active ? 1 : 0.5 }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#F59E0B' : '#94a3b8' }}>{label}</span>
      <Kbd label={kbd} />
    </div>
  )
}

// ─── Embedded Tools ─────────────────────────────────────────────────────────

function EmbeddedSettings() {
  const { data: st } = useQuery<Status>({ queryKey: ['status'], queryFn: () => api.get<Status>('/api/status') })
  const { data: soul } = useQuery({ queryKey: ['soul'], queryFn: () => api.get<{ content: string }>('/api/soul') })
  const [token, setToken] = useState(() => localStorage.getItem('gc_token') ?? '')

  const [saved, setSaved] = useState(false)
  const updateSoul = useMutation({
    mutationFn: (content: string) => api.put('/api/soul', { content }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  })

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Connection Status */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Connectivity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatusPill label="Telegram" ok={st?.telegramConnected} />
            <StatusPill label="Gmail" ok={st?.gmailConnected} />
          </div>
        </section>

        {/* Soul Preview */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>AI Soul Directives</div>
            {updateSoul.isPending ? <span style={{ fontSize: 10, color: '#F59E0B' }}>Saving...</span> : saved ? <span style={{ fontSize: 10, color: '#22c55e' }}>Saved ✓</span> : null}
          </div>
          <textarea
            defaultValue={soul?.content}
            onBlur={e => updateSoul.mutate(e.target.value)}
            style={{
              width: '100%', height: '120px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '12px', fontSize: 12, color: '#F59E0B', fontFamily: 'monospace', outline: 'none'
            }}
          />
        </section>

        {/* Token */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Dashboard Token</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f1f5f9', outline: 'none' }}
            />
            <button
              onClick={() => { localStorage.setItem('gc_token', token); window.location.reload() }}
              style={{ background: '#F59E0B', color: '#000', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Update
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatusPill({ label, ok }: { label: string, ok?: boolean }) {
  return (
    <div style={{
      padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: ok ? '#22c55e' : '#f87171' }} />
    </div>
  )
}

function EmbeddedLogs() {
  const { data: logs, isLoading } = useQuery<LogEntry[]>({
    queryKey: ['logs'],
    queryFn: () => api.get<LogEntry[]>('/api/logs?limit=50'),
    refetchInterval: 5000
  })

  if (isLoading) return <div style={{ padding: 20, textAlign: 'center', color: '#475569' }}>Loading logs...</div>

  return (
    <div style={{ padding: '0 10px 10px', maxHeight: '400px' }}>
      {logs?.map(log => (
        <div key={log.id} style={{
          padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)',
          fontFamily: 'monospace', fontSize: 11, display: 'flex', gap: 12
        }}>
          <span style={{ color: '#475569', flexShrink: 0 }}>{new Date(log.created_at).toLocaleTimeString()}</span>
          <span style={{ color: log.level === 'err' ? '#f87171' : log.level === 'warn' ? '#fbbf24' : '#64748b', fontWeight: 600, width: 35 }}>
            {log.level.toUpperCase()}
          </span>
          <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{log.message}</span>
        </div>
      ))}
    </div>
  )
}


interface CvRow {
  id: number
  job_type: string
  language: string
  file_name: string
  updated_at: string
}

function withToken(path: string): string {
  const token = localStorage.getItem('gc_token') ?? ''
  const u = new URL(path, window.location.origin)
  if (token) u.searchParams.set('token', token)
  return u.toString()
}

function EmbeddedCVManager() {
  const qc = useQueryClient()
  const { data: cvs, isLoading } = useQuery<CvRow[]>({
    queryKey: ['cvs'],
    queryFn: () => api.get<CvRow[]>('/api/cvs'),
    staleTime: 30_000,
  })

  const [jobType, setJobType] = useState('general')
  const [language, setLanguage] = useState('fr')
  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.del(`/api/cvs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cvs'] })
    },
  })

  async function uploadCv() {
    if (!file) return alert('Choose a PDF file first')

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('job_type', jobType)
      formData.append('language', language)
      formData.append('label', label.trim() ? label.trim() : file.name)

      const url = new URL('/api/cvs/upload', window.location.origin)
      const token = localStorage.getItem('gc_token') ?? ''
      if (token) url.searchParams.set('token', token)

      const res = await fetch(url.toString(), { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      qc.invalidateQueries({ queryKey: ['cvs'] })
      setFile(null)
      setLabel('')
    } catch (err: any) {
      alert(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#f1f5f9' }}>CV Manager</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>Upload / Download / Delete</div>
      </div>

      {/* Upload */}
      <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 800 }}>PDF</span>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
              }}
              style={{ fontSize: 12, color: '#e2e8f0' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 240 }}>
            <input
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              placeholder="job_type (e.g. general)"
              style={{
                flex: 1,
                height: 38,
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '0 12px',
                color: '#e2e8f0',
                outline: 'none',
                fontSize: 12,
              }}
            />
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="language (e.g. fr / en)"
              style={{
                flex: 1,
                height: 38,
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '0 12px',
                color: '#e2e8f0',
                outline: 'none',
                fontSize: 12,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label (defaults to file name)"
            style={{
              flex: 1,
              height: 38,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '0 12px',
              color: '#e2e8f0',
              outline: 'none',
              fontSize: 12,
            }}
          />
          <button
            onClick={uploadCv}
            disabled={uploading}
            style={{
              height: 38,
              padding: '0 16px',
              background: '#2563eb',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 13,
              fontWeight: 900,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading ? (
          <div style={{ color: '#64748b', fontSize: 12, padding: 10 }}>Loading CVs…</div>
        ) : (cvs?.length ? (
          cvs.map((c) => (
            <div
              key={c.id}
              style={{
                padding: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.file_name}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {c.job_type} · {c.language}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a
                  href={withToken(`/api/cvs/${c.id}/download`)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    height: 34,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 12px',
                    background: 'rgba(59,130,246,0.12)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: 10,
                    color: '#93c5fd',
                    fontSize: 12,
                    fontWeight: 900,
                    textDecoration: 'none',
                  }}
                >
                  Download
                </a>
                <button
                  onClick={() => {
                    if (!confirm('Delete this CV?')) return
                    deleteMutation.mutate(c.id)
                  }}
                  disabled={deleteMutation.isPending}
                  style={{
                    height: 34,
                    background: 'rgba(248,113,113,0.12)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 10,
                    color: '#f87171',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                    opacity: deleteMutation.isPending ? 0.6 : 1,
                    padding: '0 12px',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: '#64748b', padding: 10 }}>No CVs uploaded yet.</div>
        ))}
      </div>
    </div>
  )
}
