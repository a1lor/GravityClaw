import type { Target } from '@/hooks/useSpontanee'

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  draft: '#F59E0B',
  sent: '#38bdf8',
  replied: '#4ade80',
}

interface TargetCardProps {
  target: Target
  onOpen: () => void
}

export function TargetCard({ target, onOpen }: TargetCardProps) {
  const statusColor = STATUS_COLORS[target.status] ?? '#94a3b8'

  const dateStr = target.created_at
    ? new Date(target.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#0f1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: '#f1f5f9',
              fontSize: 14,
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {target.company}
          </div>
          <div
            style={{
              color: '#94a3b8',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {target.email}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: `${statusColor}20`,
              color: statusColor,
              border: `1px solid ${statusColor}40`,
              fontWeight: 500,
              textTransform: 'capitalize',
            }}
          >
            {target.status}
          </span>
          {dateStr && (
            <span style={{ fontSize: 11, color: '#4b5563' }}>{dateStr}</span>
          )}
        </div>
      </div>
    </div>
  )
}
