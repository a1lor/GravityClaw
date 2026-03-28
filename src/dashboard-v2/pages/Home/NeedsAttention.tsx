import { useNavigate } from 'react-router-dom'

export interface AttentionItem {
  id: string
  type: 'follow-up' | 'job-match' | 'interview' | 'draft-ready'
  label: string
  urgency: 'high' | 'normal'
  metadata?: {
    jobId?: string;
    threadId?: string;
  }
}

const TYPE_ICONS: Record<AttentionItem['type'], string> = {
  'follow-up': '📨',
  'job-match': '⭐',
  'interview': '📅',
  'draft-ready': '✉️',
}

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate()

  if (items.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)', color: '#475569', fontSize: 13 }}>
        All clear — nothing needs attention right now.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => (
        <div 
          key={item.id} 
          style={{ 
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(255,255,255,0.03)', 
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '12px 16px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
          }}
        >
          <div style={{ 
            width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 
          }}>
            {TYPE_ICONS[item.type]}
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              {item.type === 'job-match' ? 'Priority Opportunity' : item.type === 'follow-up' ? 'Response Required' : 'Action Item'}
            </div>
          </div>

          <button
            onClick={() => {
              if (item.type === 'job-match') navigate('/pipeline')
              else if (item.type === 'follow-up') navigate('/inbox')
            }}
            style={{ 
              background: item.urgency === 'high' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${item.urgency === 'high' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
              color: item.urgency === 'high' ? '#F59E0B' : '#94a3b8', cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {item.type === 'job-match' ? 'View' : 'Reply'}
          </button>
        </div>
      ))}
    </div>
  )
}
