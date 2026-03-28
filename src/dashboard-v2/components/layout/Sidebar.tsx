import { NavLink } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useTasks } from '@/lib/TaskContext'

export function Sidebar() {
  const { tasks } = useTasks()
  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'queued')
  const mainTask = activeTasks[0]

  return (
    <nav
      aria-label="GravityClaw"
      style={{ width: 64, background: '#080a10', borderRight: '1px solid rgba(255,255,255,0.06)',
               display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}
    >
      {/* Logo */}
      <div
        style={{ width: 32, height: 32, background: '#F59E0B', borderRadius: 8, display: 'flex',
                 alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}
      >
        <Zap size={16} stroke="#000" strokeWidth={2.5} fill="#000" />
      </div>

      {/* Nav items — Settings is included via NAV so no separate button needed */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map(({ to, label, icon: Icon, accent }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            style={({ isActive }) => ({
              width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center',
              justifyContent: 'center', textDecoration: 'none',
              background: isActive ? `${accent}15` : 'transparent',
              border: isActive ? `1px solid ${accent}40` : '1px solid transparent',
            })}
          >
            {({ isActive }) => (
              <Icon size={18} stroke={isActive ? accent : '#4b5563'} aria-hidden />
            )}
          </NavLink>
        ))}
      </div>

      {/* Task Progress */}
      {mainTask && (
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: 'rgba(167,139,250,0.1)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(167,139,250,0.2)', marginBottom: 4,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa' }}>
            {mainTask.progress ?? 0}%
          </div>
          <div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.1)', marginTop: 2, borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ width: `${mainTask.progress ?? 0}%`, height: '100%', background: '#a78bfa', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
    </nav>
  )
}
