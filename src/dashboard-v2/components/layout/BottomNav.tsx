import { NavLink } from 'react-router-dom'
import { NAV } from '@/lib/nav'

export function BottomNav() {
  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#080a10',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV.map(({ to, label, icon: Icon, accent }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={{
            textDecoration: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            flex: 1,
            padding: '8px 0',
            minHeight: 56,
            justifyContent: 'center',
          }}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} stroke={isActive ? accent : '#4b5563'} aria-hidden />
              <span style={{ fontSize: 10, color: isActive ? accent : '#4b5563', letterSpacing: 0.3 }}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
