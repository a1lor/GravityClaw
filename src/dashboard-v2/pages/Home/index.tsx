import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useKpis } from '@/hooks/useKpis'
import { useToday } from '@/hooks/useToday'
import { useJobs } from '@/hooks/useJobs'
import { useIsMobile } from '@/hooks/useIsMobile'
import { queryKeys } from '@/lib/query-keys'
import { KpiRow } from './KpiRow'
import { NeedsAttention } from './NeedsAttention'
import { TodayPanel } from './TodayPanel'
import type { AttentionItem } from './NeedsAttention'
import { useSSE } from '@/hooks/useSSE'

interface Email {
  id: number
  from_addr: string
  subject: string
  action_needed: number
  status: string
}

export default function HomePage() {
  const isMobile = useIsMobile()
  const kpis = useKpis()
  const today = useToday()
  const jobs = useJobs()
  const { status: sseStatus, events } = useSSE(20)
  const [action, setAction] = useState<null | { kind: ActionKind; taskId: string; startedAt: number }>(null)
  const emails = useQuery({
    queryKey: queryKeys.emails,
    queryFn: () => api.get<Email[]>('/api/emails?limit=100'),
    staleTime: 30_000,
  })

  // Resolve the action loading state from SSE completion.
  useEffect(() => {
    if (!action) return
    const timeout = window.setTimeout(() => setAction(null), 30_000)
    return () => window.clearTimeout(timeout)
  }, [action?.taskId])

  useEffect(() => {
    if (!action) return
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev?.type === 'task_completed' && ev?.payload?.taskId === action.taskId) {
        setAction(null)
        break
      }
    }
  }, [events, action?.taskId])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const nowMs = now.getTime()

  const attentionItems: AttentionItem[] = []

  // Jobs in interview stage
  for (const job of jobs.data) {
    if (job.pipeline_status === 'interview') {
      attentionItems.push({
        id: `interview-${job.id}`,
        type: 'interview',
        label: `Interview: ${job.title} at ${job.company}`,
        urgency: 'high',
      })
    }
  }

  // Jobs with past follow-up date
  for (const job of jobs.data) {
    if (job.followup_at && new Date(job.followup_at).getTime() < nowMs && job.pipeline_status === 'applied') {
      attentionItems.push({
        id: `followup-${job.id}`,
        type: 'follow-up',
        label: `Follow up: ${job.title} at ${job.company}`,
        urgency: 'normal',
      })
    }
  }

  // Emails needing action
  for (const email of emails.data ?? []) {
    if (email.action_needed) {
      const sender = email.from_addr.replace(/<.*>/, '').trim() || email.from_addr
      attentionItems.push({
        id: `email-${email.id}`,
        type: 'draft-ready',
        label: `Reply needed: ${email.subject || sender}`,
        urgency: email.status === 'positive' ? 'high' : 'normal',
      })
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '16px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#f1f5f9' }}>{greeting}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{dateStr}</div>
        </div>
        {!isMobile && (
          <button
            onClick={() => {
              const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
              window.dispatchEvent(e)
            }}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                     borderRadius: 8, padding: '6px 12px', color: '#475569', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
          >
            ⌘K
          </button>
        )}
      </div>

      {/* KPI row */}
      <KpiRow
        messages={kpis.data?.messages}
        memories={kpis.data?.memories}
        jobsTracked={kpis.data?.jobsTracked}
        pipeline={kpis.data?.pipeline}
        loading={kpis.isLoading}
      />

      {/* Main + side panel — stacks on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 20, flex: 1, minHeight: 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase',
                         letterSpacing: 1, marginBottom: 10 }}>Needs Attention</div>
          <NeedsAttention items={attentionItems} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <TodayPanel data={today.data} loading={today.isLoading} />
          <ActivityFeed
            status={sseStatus}
            events={events}
            action={action}
            onTriggerAction={async (kind) => {
              if (action) return
              const r = await api.post<{ ok: boolean; taskId: string }>(`/api/actions/${kind}`, {})
              setAction({ kind, taskId: r.taskId, startedAt: Date.now() })
            }}
          />
        </div>
      </div>
    </div>
  )
}

type ActionKind = 'send_briefing' | 'scan_emails' | 'outreach_batch'

function ActivityFeed({
  status,
  events,
  action,
  onTriggerAction,
}: {
  status: string
  events: any[]
  action: null | { kind: ActionKind; taskId: string; startedAt: number }
  onTriggerAction: (kind: ActionKind) => Promise<void>
}) {
  const ICONS: Record<string, string> = {
    briefing_sent: '☀️',
    email_scanned: '🔎',
    outreach_sent: '📨',
    outreach_replied: '💬',
    job_found: '🧾',
    reminder_fired: '⏰',
    agent_response: '🤖',
    task_started: '▶️',
    task_completed: '✅',
  }

  const formatTime = (iso?: string) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const isActionLoading = (kind: ActionKind) => action?.kind === kind

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
        Activity
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            disabled={!!action}
            onClick={() => void onTriggerAction('send_briefing')}
            style={{
              background: isActionLoading('send_briefing') ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isActionLoading('send_briefing') ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
              padding: '8px 10px',
              color: isActionLoading('send_briefing') ? '#F59E0B' : '#e2e8f0',
              fontSize: 11,
              fontWeight: 700,
              cursor: action ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isActionLoading('send_briefing') ? 'Sending…' : 'Send Briefing'}
          </button>

          <button
            disabled={!!action}
            onClick={() => void onTriggerAction('scan_emails')}
            style={{
              background: isActionLoading('scan_emails') ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isActionLoading('scan_emails') ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
              padding: '8px 10px',
              color: isActionLoading('scan_emails') ? '#38bdf8' : '#e2e8f0',
              fontSize: 11,
              fontWeight: 700,
              cursor: action ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isActionLoading('scan_emails') ? 'Scanning…' : 'Scan Emails'}
          </button>

          <button
            disabled={!!action}
            onClick={() => void onTriggerAction('outreach_batch')}
            style={{
              background: isActionLoading('outreach_batch') ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isActionLoading('outreach_batch') ? 'rgba(34, 197, 94, 0.25)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
              padding: '8px 10px',
              color: isActionLoading('outreach_batch') ? '#22c55e' : '#e2e8f0',
              fontSize: 11,
              fontWeight: 700,
              cursor: action ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isActionLoading('outreach_batch') ? 'Working…' : 'Outreach Batch'}
          </button>
        </div>

        {action && (
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Waiting for completion… (timeout safety: 30s)
          </div>
        )}
      </div>

      {events.length === 0 && status !== 'connected' && (
        <div style={{ fontSize: 12, color: '#64748b' }}>connecting…</div>
      )}

      <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
        {events.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>No recent events yet.</div>
        ) : (
          events
            .slice()
            .reverse()
            .map((ev, idx) => {
              const icon = ICONS[String(ev.type)] ?? '•'
              return (
                <div
                  key={`${ev.type}-${ev.created_at ?? idx}`}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '8px 8px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.03)',
                    background: 'rgba(255,255,255,0.01)',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 16, width: 22, textAlign: 'center', color: '#e2e8f0' }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 650, lineHeight: 1.2 }}>
                      {ev.message}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                      {formatTime(ev.created_at)}
                    </div>
                  </div>
                </div>
              )
            })
        )}
      </div>
    </div>
  )
}
