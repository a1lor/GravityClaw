import { useState } from 'react'
import ChatTab from './ChatTab'
import GraphTab from './GraphTab'
import MemoriesTab from './MemoriesTab'
import LogsTab from './LogsTab'
import { ErrorBoundary } from '@/components/ErrorBoundary'

type AgentTab = 'chat' | 'graph' | 'memories' | 'logs'

const TABS: { id: AgentTab; label: string }[] = [
  { id: 'chat',     label: 'Chat'     },
  { id: 'graph',    label: 'Graph'    },
  { id: 'memories', label: 'Memories' },
  { id: 'logs',     label: 'Logs'     },
]

const ACCENT = '#F59E0B'

export default function AgentPage() {
  const [activeTab, setActiveTab] = useState<AgentTab>('chat')

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '12px 16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(({ id, label }) => {
          const isActive = id === activeTab
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px 8px 0 0',
                fontSize: 13,
                background: isActive ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: isActive ? ACCENT : '#64748b',
                border: 'none',
                borderBottom: isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab content — position:relative so each tab can absolute-fill it */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {activeTab === 'chat' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary label="Chat tab"><ChatTab /></ErrorBoundary>
          </div>
        )}
        {activeTab === 'graph' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary label="Graph tab"><GraphTab /></ErrorBoundary>
          </div>
        )}
        {activeTab === 'memories' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary label="Memories tab"><MemoriesTab /></ErrorBoundary>
          </div>
        )}
        {activeTab === 'logs' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary label="Logs tab"><LogsTab /></ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  )
}
