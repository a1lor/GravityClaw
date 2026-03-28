import { useIsMobile } from '@/hooks/useIsMobile'

interface KpiCardProps {
  label: string
  value?: number
  color: string
  loading?: boolean
}

function KpiCard({ label, value, color, loading }: KpiCardProps) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
        {label}
      </div>
      {loading ? (
        <div role="status" style={{ marginTop: 6, height: 24, width: 40, background: 'rgba(255,255,255,0.08)',
                                     borderRadius: 4 }} aria-label="Loading" />
      ) : (
        <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 4 }}>{value ?? 0}</div>
      )}
    </div>
  )
}

interface KpiRowProps {
  messages?: number
  memories?: number
  jobsTracked?: number
  pipeline?: number
  loading?: boolean
}

export function KpiRow({ messages, memories, jobsTracked, pipeline, loading }: KpiRowProps) {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8 }}>
      <KpiCard label="Messages"     value={messages}    color="#94a3b8" loading={loading} />
      <KpiCard label="Memories"     value={memories}    color="#F59E0B" loading={loading} />
      <KpiCard label="Jobs Tracked" value={jobsTracked} color="#a78bfa" loading={loading} />
      <KpiCard label="Pipeline"     value={pipeline}    color="#4ade80" loading={loading} />
    </div>
  )
}
