import { useState, useEffect } from 'react'
import { useMoveJob } from '@/hooks/useJobs'
import { ActionSheet } from './ActionSheet'
import type { Job } from '@/hooks/useJobs'
import type { PipelineStatus } from '@/lib/pipeline-status'

const APPLIED_STATUSES: PipelineStatus[] = ['applied', 'interview', 'offer']

function formatDate(job: Job): string {
  const useApplied = APPLIED_STATUSES.includes(job.pipeline_status) && job.applied_at != null
  const raw = useApplied ? job.applied_at : job.found_at
  if (!raw) return ''
  return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#f87171'
  return (
    <span
      style={{
        padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
        background: `${color}20`, color, border: `1px solid ${color}40`,
      }}
    >
      {score}
    </span>
  )
}

export function JobCard({ job, forceOpen }: { job: Job; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { mutate, isPending } = useMoveJob()

  // Auto-open when navigated from inbox via ?jobId= URL param
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  useEffect(() => {
    if (!errorMessage) return
    const t = setTimeout(() => setErrorMessage(''), 3000)
    return () => clearTimeout(t)
  }, [errorMessage])

  function handleMove(newStatus: PipelineStatus) {
    mutate(
      { id: job.id, newStatus },
      {
        onSuccess: () => setOpen(false),
        onError: () => setErrorMessage('Move failed'),
      }
    )
  }

  const dateStr = formatDate(job)

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          padding: '12px 16px',
          background: '#0f1117',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600, color: '#f1f5f9', fontSize: 15, marginBottom: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {job.company}
            </div>
            <div
              style={{
                color: '#94a3b8', fontSize: 13,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {job.title}
            </div>
          </div>
          <div
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'flex-end', gap: 4, flexShrink: 0,
            }}
          >
            {job.job_score != null && <ScoreBadge score={job.job_score} />}
            <span
              style={{
                fontSize: 11, color: '#4b5563',
                background: 'rgba(255,255,255,0.05)',
                padding: '1px 5px', borderRadius: 3,
              }}
            >
              {job.source}
            </span>
          </div>
        </div>
        {dateStr && (
          <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6 }}>{dateStr}</div>
        )}
      </div>
      {open && (
        <ActionSheet
          job={job}
          onMove={handleMove}
          onClose={() => setOpen(false)}
          isPending={isPending}
          errorMessage={errorMessage}
        />
      )}
    </>
  )
}
