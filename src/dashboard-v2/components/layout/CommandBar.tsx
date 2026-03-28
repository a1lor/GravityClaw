import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  LayoutDashboard,
  Briefcase,
  Mail,
  Bot,
  Settings,
  FileText,
  BookOpen,
  Brain,
} from 'lucide-react'
import { useSearchAll } from '@/hooks/useSearchAll'
import { CommandSection } from '@/components/command/CommandSection'
import { SettingsPanel } from '@/components/command/SettingsPanel'
import { LogsPanel } from '@/components/command/LogsPanel'
import { CvManagerPanel } from '@/components/command/CvManagerPanel'
import { SoulPanel } from '@/components/command/SoulPanel'

type ActivePanel = 'settings' | 'logs' | 'cvs' | 'soul' | null

interface FlatResult {
  type: 'job' | 'memory' | 'email'
  primary: string
  secondary?: string
}

export function CommandBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const { jobs, memories, emails } = useSearchAll(query)

  // Flat results for keyboard nav
  const jobResults = jobs.map((j) => ({ type: 'job' as const, primary: j.title, secondary: j.company }))
  const memoryResults = memories.map((m) => ({ type: 'memory' as const, primary: m.content, secondary: m.category }))
  const emailResults = emails.map((e) => ({
    type: 'email' as const,
    primary: e.subject,
    secondary: e.from_addr,
  }))
  const flatResults: FlatResult[] = [...jobResults, ...memoryResults, ...emailResults]
  const totalResults = flatResults.length

  function activateResult(result: FlatResult) {
    if (result.type === 'job') navigate('/pipeline')
    else if (result.type === 'memory') navigate('/agent')
    else if (result.type === 'email') navigate('/inbox')
    closeModal()
  }

  function closeModal() {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
    setActivePanel(null)
  }

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Open/close toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }

      if (!open) return

      if (e.key === 'Escape') {
        e.preventDefault()
        if (activePanel !== null) {
          setActivePanel(null)
        } else {
          closeModal()
        }
        return
      }

      if (activePanel !== null) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, totalResults - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && totalResults > 0) {
        e.preventDefault()
        activateResult(flatResults[selectedIndex])
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, activePanel, totalResults, flatResults, selectedIndex]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Listen for gc:open-settings custom event
  useEffect(() => {
    function handleOpenSettings() {
      setOpen(true)
      setActivePanel('settings')
    }
    window.addEventListener('gc:open-settings', handleOpenSettings)
    return () => window.removeEventListener('gc:open-settings', handleOpenSettings)
  }, [])

  // Quick nav actions
  const NAV_ACTIONS = [
    { label: 'Home', icon: LayoutDashboard, to: '/' },
    { label: 'Pipeline', icon: Briefcase, to: '/pipeline' },
    { label: 'Inbox', icon: Mail, to: '/inbox' },
    { label: 'Agent', icon: Bot, to: '/agent' },
  ]

  const PANEL_ACTIONS = [
    { label: 'Settings', icon: Settings, panel: 'settings' as ActivePanel },
    { label: 'Logs', icon: FileText, panel: 'logs' as ActivePanel },
    { label: 'CV Manager', icon: BookOpen, panel: 'cvs' as ActivePanel },
    { label: 'AI Soul', icon: Brain, panel: 'soul' as ActivePanel },
  ]

  if (!open) return null

  return (
    <div
      data-testid="commandbar-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
        }}
        onClick={closeModal}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command bar"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          background: '#1e2433',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 480,
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <Search size={16} color="#4b5563" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            placeholder="Search jobs, memories, or type a command…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f1f5f9',
              fontSize: 14,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: '#4b5563',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            Esc
          </span>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activePanel === 'settings' && (
            <SettingsPanel onBack={() => setActivePanel(null)} />
          )}
          {activePanel === 'logs' && (
            <LogsPanel onBack={() => setActivePanel(null)} />
          )}
          {activePanel === 'cvs' && (
            <CvManagerPanel onBack={() => setActivePanel(null)} />
          )}
          {activePanel === 'soul' && (
            <SoulPanel onBack={() => setActivePanel(null)} />
          )}

          {activePanel === null && query === '' && (
            <>
              {/* Navigate group */}
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 11,
                  color: '#4b5563',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Navigate
              </div>
              {NAV_ACTIONS.map(({ label, icon: Icon, to }) => (
                <div
                  key={to}
                  onClick={() => { navigate(to); closeModal() }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    color: '#f1f5f9',
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <Icon size={16} color="#4b5563" aria-hidden />
                  {label}
                </div>
              ))}

              {/* Open group */}
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 11,
                  color: '#4b5563',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Open
              </div>
              {PANEL_ACTIONS.map(({ label, icon: Icon, panel }) => (
                <div
                  key={label}
                  onClick={() => setActivePanel(panel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    color: '#f1f5f9',
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <Icon size={16} color="#4b5563" aria-hidden />
                  {label}
                </div>
              ))}
            </>
          )}

          {activePanel === null && query.length >= 2 && (
            <>
              <CommandSection
                label="Jobs"
                results={jobResults}
                icon={Briefcase}
                selectedOffset={0}
                selectedIndex={selectedIndex}
                onActivate={(i) => activateResult(flatResults[i])}
              />
              <CommandSection
                label="Memories"
                results={memoryResults}
                icon={Brain}
                selectedOffset={jobResults.length}
                selectedIndex={selectedIndex}
                onActivate={(i) => activateResult(flatResults[i])}
              />
              <CommandSection
                label="Emails"
                results={emailResults}
                icon={Mail}
                selectedOffset={jobResults.length + memoryResults.length}
                selectedIndex={selectedIndex}
                onActivate={(i) => activateResult(flatResults[i])}
              />
              {totalResults === 0 && (
                <div style={{ padding: '16px', color: '#4b5563', fontSize: 13 }}>
                  No results for "{query}"
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
