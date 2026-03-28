import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './layout/Sidebar'
import { BottomNav } from './layout/BottomNav'
import { useIsMobile } from '@/hooks/useIsMobile'
import { CommandBar } from './CommandBar'

export function Layout() {
  const isMobile = useIsMobile()
  const [commandBarOpen, setCommandBarOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandBarOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', width: '100%' }}>
      {!isMobile && <Sidebar />}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: isMobile ? 56 : 0,
        }}
      >
        <Outlet />
      </main>
      {isMobile && <BottomNav />}
      <CommandBar open={commandBarOpen} setOpen={setCommandBarOpen} />
    </div>
  )
}
