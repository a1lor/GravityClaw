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
  const emails = useQuery({
    queryKey: queryKeys.emails,
    queryFn: () => api.get<Email[]>('/api/emails?limit=100'),
    staleTime: 30_000,
  })

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
        <TodayPanel data={today.data} loading={today.isLoading} />
      </div>
    </div>
  )
}
