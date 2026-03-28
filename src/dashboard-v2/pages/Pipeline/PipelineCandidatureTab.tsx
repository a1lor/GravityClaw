import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface TaskInfo {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  lastMessage?: string
  progress?: number
  error?: string
}

interface SpontaneousTarget {
  id: number
  company: string
  hr_name: string
  hr_email: string
  industry: string
  notes: string
  status: string
  sent_at: string | null
  email_subject: string
  sent_letter: string
}

async function pollTask(taskId: string): Promise<TaskInfo> {
  while (true) {
    const t = await api.get<TaskInfo>(`/api/tasks/${taskId}`)
    if (t.status === 'done' || t.status === 'error' || t.status === 'cancelled') return t
    await new Promise((r) => setTimeout(r, 1100))
  }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'rgba(245,158,11,0.15)',
    draft: 'rgba(167,139,250,0.15)',
    sent: 'rgba(59,130,246,0.15)',
    replied: 'rgba(16,185,129,0.15)',
    failed: 'rgba(248,113,113,0.15)',
  }
  const bg = map[status] ?? 'rgba(255,255,255,0.03)'
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 900,
      padding: '2px 8px',
      borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.08)',
      background: bg,
      color: '#e2e8f0',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function TargetCard({
  target,
  onStartGenerate,
  onPatch,
  busy,
}: {
  target: SpontaneousTarget
  onStartGenerate: () => void
  onPatch: (nextStatus: string, nextNotes: string) => void
  busy: boolean
}) {
  const [status, setStatus] = useState(target.status)
  const [notes, setNotes] = useState(target.notes || '')

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {target.company}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {target.hr_name} · {target.hr_email}
          </div>
        </div>
        <StatusPill status={target.status} />
      </div>

      <div style={{ fontSize: 12, color: '#e2e8f0' }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
          Notes
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 10,
            color: '#e2e8f0',
            outline: 'none',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            flex: 1,
            height: 38,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '0 12px',
            color: '#e2e8f0',
            outline: 'none',
          }}
        >
          {['pending', 'draft', 'sent', 'replied', 'failed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button
          onClick={() => onPatch(status, notes)}
          style={{
            height: 38,
            padding: '0 14px',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 12,
            color: '#93c5fd',
            fontSize: 12,
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>

      <button
        onClick={onStartGenerate}
        disabled={busy}
        style={{
          height: 42,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.18)',
          borderRadius: 12,
          color: '#F59E0B',
          fontSize: 13,
          fontWeight: 900,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Generating…' : 'Generate Draft'}
      </button>
    </div>
  )
}

export function PipelineCandidatureTab() {
  const qc = useQueryClient()

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'draft' | 'sent' | 'replied'>('pending')
  const [busyId, setBusyId] = useState<number | null>(null)

  const { data: stats } = useQuery({
    queryKey: ['spontanee-stats'],
    queryFn: () => api.get('/api/spontanee/stats'),
    staleTime: 30_000,
  })

  const { data: targets, refetch } = useQuery<SpontaneousTarget[]>({
    queryKey: ['spontanee-targets', filterStatus],
    queryFn: () => api.get<SpontaneousTarget[]>(`/api/spontanee/targets?status=${filterStatus}&limit=200`),
    staleTime: 10_000,
  })

  const batchMutation = useMutation({
    mutationFn: (limit: number) => api.post<{ taskId: string }>('/api/spontanee/batch/start', { limit }),
    onSuccess: async () => {
      await refetch()
    },
  })

  async function startGenerate(id: number) {
    if (busyId === id) return
    setBusyId(id)
    try {
      const { taskId } = await api.post<{ taskId: string }>(`/api/spontanee/targets/${id}/generate`, {})
      await pollTask(taskId)
      await qc.invalidateQueries({ queryKey: ['spontanee-targets'] })
    } catch (err: any) {
      alert(err?.message || 'Failed to generate')
    } finally {
      setBusyId(null)
    }
  }

  async function patchTarget(id: number, nextStatus: string, nextNotes: string) {
    try {
      await api.patch(`/api/spontanee/targets/${id}`, { status: nextStatus, notes: nextNotes })
      await qc.invalidateQueries({ queryKey: ['spontanee-targets'] })
    } catch (err: any) {
      alert(err?.message || 'Failed to save')
    }
  }

  const count = useMemo(() => {
    if (!stats) return 0
    if (filterStatus === 'pending') return (stats.byStatus?.pending ?? 0) + (stats.byStatus?.draft ?? 0)
    return stats.byStatus?.[filterStatus] ?? 0
  }, [stats, filterStatus])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '16px 16px 8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Candidature</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Spontaneous outreach drafts</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{
              height: 38,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '0 12px',
              color: '#e2e8f0',
              outline: 'none',
              fontSize: 12,
            }}
          >
            {['pending', 'draft', 'sent', 'replied', 'all'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            onClick={async () => {
              try {
                const { taskId } = await batchMutation.mutateAsync(5)
                await pollTask(taskId)
                await qc.invalidateQueries({ queryKey: ['spontanee-targets'] })
              } catch (err: any) {
                alert(err?.message || 'Batch generation failed')
              }
            }}
            style={{
              height: 38,
              padding: '0 14px',
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.20)',
              borderRadius: 12,
              color: '#F59E0B',
              fontSize: 12,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Batch (5)
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {targets && targets.length === 0 && (
          <div style={{ textAlign: 'center', color: '#4b5563', padding: 32 }}>
            No targets for this filter ({filterStatus}).
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {targets?.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              busy={busyId === t.id}
              onStartGenerate={() => startGenerate(t.id)}
              onPatch={(nextStatus, nextNotes) => patchTarget(t.id, nextStatus, nextNotes)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
