import { useNavigate } from 'react-router-dom'
import type { TodayData } from '@/hooks/useToday'

export function TodayPanel({ data, loading }: { data?: TodayData; loading?: boolean }) {
  const navigate = useNavigate()

  const QUICK_ACTIONS = [
    { label: 'Add Job',       icon: '💼', onClick: () => {
      const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
      window.dispatchEvent(e);
    }},
    { label: 'Inbox',         icon: '📬', onClick: () => navigate('/inbox') },
    { label: 'Cover Letter',  icon: '✉️',  onClick: () => navigate('/pipeline?tab=studio') },
    { label: 'Ask Agent',     icon: '🤖', onClick: () => navigate('/agent') },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Schedule */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase',
                       letterSpacing: 1 }}>Today's Focus</div>
        {loading ? (
          <div style={{ fontSize: 12, color: '#334155' }}>Analysing schedule…</div>
        ) : !data?.events.length && !data?.workout ? (
          <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>No events discovered for today.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data?.workout && (
              <div style={{ fontSize: 13, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🏋️</span> {data.workout.name}
              </div>
            )}
            {data?.events.map(e => {
              const fmt = (iso: string) => { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) } catch { return '' } }
              const timeStr = e.start ? `${fmt(e.start)}${e.end ? ` – ${fmt(e.end)}` : ''}` : ''
              return (
                <div key={e.id} style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📅</span>
                  <span>
                    {timeStr && <span style={{ color: '#64748b', fontSize: 11, marginRight: 6 }}>{timeStr}</span>}
                    {e.title}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase',
                       letterSpacing: 1, marginBottom: 10, marginLeft: 4 }}>Quick Access</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {QUICK_ACTIONS.map(({ label, icon, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '12px 10px',
                color: '#e2e8f0', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 8, transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <span style={{ fontSize: 20 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
