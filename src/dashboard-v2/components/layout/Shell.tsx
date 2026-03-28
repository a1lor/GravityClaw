import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { useIsMobile } from '@/hooks/useIsMobile'

export function Shell() {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', flex: 1 }}>
      {!isMobile && <Sidebar />}
      <main
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: isMobile ? 56 : 0,
        }}
      >
        <Outlet />
      </main>
      {isMobile && <BottomNav />}
    </div>
  )
}
