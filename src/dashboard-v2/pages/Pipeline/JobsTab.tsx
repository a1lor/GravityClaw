import { useState, useEffect } from 'react'
import { Plus, Search, Layers } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useJobs } from '@/hooks/useJobs'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { JobCard } from './JobCard'
import { TaskPoller } from '@/components/TaskPoller'
import { PIPELINE_STAGES, STAGE_LABELS } from '@/lib/pipeline-status'
import type { PipelineStatus } from '@/lib/pipeline-status'

const ACCENT = '#a78bfa'

function SkeletonCard() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        padding: '12px 16px',
        background: '#0f1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          height: 16, width: '60%',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4, marginBottom: 6,
        }}
      />
      <div
        style={{
          height: 12, width: '40%',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 4,
        }}
      />
    </div>
  )
}

export function JobsTab({ openJobId }: { openJobId?: string | null }) {
  const [activeStage, setActiveStage] = useState<PipelineStatus>('applied')
  const [showAddUrl, setShowAddUrl] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [groupByCompany, setGroupByCompany] = useState(false)

  const { data: jobs, isLoading, isError, refetch } = useJobs()

  // Auto-switch stage to show the job targeted by URL param
  useEffect(() => {
    if (!openJobId || !jobs.length) return
    const target = jobs.find(j => j.id === openJobId)
    if (target) setActiveStage(target.pipeline_status as PipelineStatus)
  }, [openJobId, jobs])
  const queryClient = useQueryClient()

  const countByStage = PIPELINE_STAGES.reduce<Record<PipelineStatus, number>>(
    (acc, s) => ({ ...acc, [s]: jobs.filter((j) => j.pipeline_status === s).length }),
    {} as Record<PipelineStatus, number>
  )

  const activeJobs = jobs.filter((j) => j.pipeline_status === activeStage)

  // Search filter
  const filteredJobs = activeJobs.filter((j) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      j.company?.toLowerCase().includes(q) ||
      j.title?.toLowerCase().includes(q)
    )
  })

  // Group by company
  type JobGroup = { company: string; jobs: typeof filteredJobs }
  const groupedJobs: JobGroup[] | null = groupByCompany
    ? Object.entries(
        filteredJobs.reduce<Record<string, typeof filteredJobs>>((acc, j) => {
          const key = j.company || '(unknown)'
          if (!acc[key]) acc[key] = []
          acc[key].push(j)
          return acc
        }, {})
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([company, jobs]) => ({ company, jobs }))
    : null

  async function handleAddJob() {
    if (!urlInput.trim()) return
    setIsSubmitting(true)
    try {
      const res = await api.post<{ taskId?: string; jobId?: string; message?: string }>(
        '/api/jobs',
        { url: urlInput.trim() }
      )
      setUrlInput('')
      if (res.taskId) {
        setTaskId(res.taskId)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stage tabs + Add Job button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '12px 16px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            gap: 4,
            scrollbarWidth: 'none',
            flex: 1,
          }}
        >
          {PIPELINE_STAGES.map((stage) => {
            const isActive = stage === activeStage
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: 13,
                  background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                  color: isActive ? ACCENT : '#64748b',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: isActive ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {STAGE_LABELS[stage]}
                <span
                  style={{
                    fontSize: 11, padding: '1px 5px', borderRadius: 10,
                    background: isActive ? ACCENT : 'rgba(255,255,255,0.08)',
                    color: isActive ? '#000' : '#64748b',
                  }}
                >
                  {(countByStage as Record<string, number>)[stage] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setShowAddUrl((v) => !v)}
          aria-label="Add Job"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            borderRadius: 8,
            background: showAddUrl ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.1)',
            border: '1px solid rgba(167,139,250,0.3)',
            color: ACCENT,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            marginBottom: 2,
          }}
        >
          <Plus size={14} />
          Add Job
        </button>
      </div>

      {/* URL input bar */}
      {showAddUrl && (
        <div
          style={{
            padding: '10px 16px',
            background: '#0f1117',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: taskId ? 8 : 0 }}>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddJob()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#1e2433',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              onClick={handleAddJob}
              disabled={isSubmitting || !urlInput.trim()}
              aria-label="Add"
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: ACCENT,
                color: '#000',
                border: 'none',
                cursor: isSubmitting || !urlInput.trim() ? 'default' : 'pointer',
                opacity: isSubmitting || !urlInput.trim() ? 0.6 : 1,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Add
            </button>
          </div>
          {taskId && (
            <TaskPoller
              taskId={taskId}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
                setTaskId(null)
              }}
              onError={() => setTaskId(null)}
            />
          )}
        </div>
      )}

      {/* Search + group toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          alignItems: 'center',
        }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          <Search
            size={13}
            style={{
              position: 'absolute', left: 9, top: '50%',
              transform: 'translateY(-50%)', color: '#4b5563', pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or role…"
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              background: '#0f1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 7,
              color: '#f1f5f9',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={() => setGroupByCompany((v) => !v)}
          title="Group by company"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px',
            borderRadius: 7,
            background: groupByCompany ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${groupByCompany ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: groupByCompany ? ACCENT : '#64748b',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: groupByCompany ? 600 : 400,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <Layers size={13} />
          Group
        </button>
      </div>

      {/* Job list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {isError && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ color: '#f87171', marginBottom: 12 }}>Failed to load jobs</div>
            <button
              onClick={() => refetch()}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.08)',
                border: 'none', borderRadius: 8,
                color: '#94a3b8', cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && filteredJobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#4b5563' }}>
            {search ? 'No jobs match your search' : 'No jobs in this stage'}
          </div>
        )}

        {/* Grouped view */}
        {!isLoading && !isError && groupedJobs && groupedJobs.map(({ company, jobs: groupJobs }) => (
          <div key={company} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                color: '#64748b', textTransform: 'uppercase',
                padding: '4px 2px 6px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{company}</span>
              <span
                style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 10,
                  background: 'rgba(167,139,250,0.12)', color: ACCENT,
                }}
              >
                {groupJobs.length}
              </span>
            </div>
            {groupJobs.map((job) => (
              <JobCard key={job.id} job={job} forceOpen={job.id === openJobId} />
            ))}
          </div>
        ))}

        {/* Flat view */}
        {!isLoading && !isError && !groupedJobs && filteredJobs.map((job) => (
          <JobCard key={job.id} job={job} forceOpen={job.id === openJobId} />
        ))}
      </div>
    </div>
  )
}
