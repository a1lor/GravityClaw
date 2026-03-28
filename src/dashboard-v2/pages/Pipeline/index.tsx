import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { JobsTab } from './JobsTab'
import { KanbanTab } from './KanbanTab'
import { StudioTab } from './StudioTab'
import { OutreachTab } from './OutreachTab'

type PipelineTab = 'jobs' | 'kanban' | 'studio' | 'outreach'

const TABS: { id: PipelineTab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'studio', label: 'Studio' },
  { id: 'outreach', label: 'Outreach' },
]

const ACCENT = '#a78bfa'

export default function PipelinePage() {
  const [activeTab, setActiveTab] = useState<PipelineTab>('jobs')
  const [searchParams] = useSearchParams()
  const openJobId = searchParams.get('jobId')

  // Auto-switch to Jobs tab if a jobId is passed via URL
  useEffect(() => {
    if (openJobId) setActiveTab('jobs')
  }, [openJobId])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '12px 16px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
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
                background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
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

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'jobs' && <JobsTab openJobId={openJobId} />}
        {activeTab === 'kanban' && <KanbanTab />}
        {activeTab === 'studio' && <StudioTab />}
        {activeTab === 'outreach' && <OutreachTab />}
      </div>
    </div>
  )
}
