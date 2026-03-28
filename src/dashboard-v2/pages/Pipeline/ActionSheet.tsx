import { useState, useEffect, useCallback } from 'react'
import { PIPELINE_STAGES, STAGE_LABELS } from '@/lib/pipeline-status'
import type { PipelineStatus } from '@/lib/pipeline-status'
import type { Job } from '@/hooks/useJobs'
import { api } from '@/lib/api'
import { useTasks } from '@/lib/TaskContext'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { useDeleteJob, useEditJob } from '@/hooks/useJobs'

interface ActionSheetProps {
  job: Job
  onMove: (newStatus: PipelineStatus) => void
  onClose: () => void
  isPending: boolean
  errorMessage: string
}

interface LinkedEmail {
  id: number
  from_addr: string
  subject: string
  snippet: string
  status: 'positive' | 'negative' | 'neutral'
  stage: string | null
  action_needed: string
  email_date: string | null
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  positive: '#4ade80',
  negative: '#f87171',
  neutral: '#94a3b8',
}

const STAGE_COLOR: Record<string, string> = {
  interview: '#4ade80',
  offer: '#a78bfa',
  test: '#fbbf24',
  rejection: '#f87171',
  acknowledgment: '#94a3b8',
  pending: '#38bdf8',
  'follow-up': '#fb923c',
}

function parseSenderName(from: string): string {
  const m = from.match(/^"?([^"<]+)"?\s*</)
  return m ? m[1].trim() : from.split('@')[0]
}

export function ActionSheet({ job, onMove, onClose, isPending, errorMessage }: ActionSheetProps) {
  const { tasks } = useTasks()
  const queryClient = useQueryClient()
  const { mutate: deleteJob, isPending: isDeleting } = useDeleteJob()
  const { mutate: editJob, isPending: isEditing } = useEditJob()

  const [isSyncing, setIsSyncing] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [isEditingLetter, setIsEditingLetter] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [scoreTaskId, setScoreTaskId] = useState<string | null>(null)
  const [scoreLabel, setScoreLabel] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Editable title/company
  const [editTitle, setEditTitle] = useState(job.title)
  const [editCompany, setEditCompany] = useState(job.company)
  const [titleSaved, setTitleSaved] = useState(false)

  // Linked emails
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmail[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<LinkedEmail[]>(`/api/jobs/${encodeURIComponent(job.id)}/emails`)
      .then(data => { if (!cancelled) setLinkedEmails(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEmailsLoading(false) })
    return () => { cancelled = true }
  }, [job.id])

  function handleSaveTitleCompany() {
    if (isEditing) return
    editJob(
      { id: job.id, title: editTitle, company: editCompany },
      {
        onSuccess: () => {
          setTitleSaved(true)
          setTimeout(() => setTitleSaved(false), 2000)
        }
      }
    )
  }

  function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    deleteJob(job.id, { onSuccess: onClose })
  }

  // Find if there's an active task for this job
  const activeTask = tasks.find(t =>
    t.id === currentTaskId ||
    ((t.status === 'running' || t.status === 'queued') && t.lastMessage?.includes(job.url))
  )

  useEffect(() => {
    const checkLast = async () => {
      try {
        const last = await api.get<{ text: string, job: { url: string } }>('/api/studio/last')
        if (last && last.text && last.job?.url === job.url) {
          setEditedText(last.text)
          setIsEditingLetter(true)
        }
      } catch { /* ignore */ }
    }
    if (!isEditingLetter && !activeTask && job.url) checkLast()
  }, [activeTask?.status, job.url])

  async function handleGenerate() {
    if (!job.url || activeTask) return
    try {
      const { taskId } = await api.post<{ taskId: string }>('/api/studio/coverletter', { url: job.url })
      setCurrentTaskId(taskId)
    } catch (err: any) {
      alert(err.message || 'Failed to start generation')
    }
  }

  async function handleFinalSave() {
    if (!editedText || isSyncing) return
    setIsSyncing(true)
    try {
      await api.post('/api/studio/coverletter', { text: editedText, url: job.url })
      setTimeout(() => { setIsSyncing(false); onClose() }, 1500)
    } catch (err: any) {
      setIsSyncing(false)
      alert(err.message || 'Failed to save letter')
    }
  }

  const scoreTask = scoreTaskId ? tasks.find(t => t.id === scoreTaskId) : null
  const isScoring = !!scoreTask && (scoreTask.status === 'running' || scoreTask.status === 'queued')

  const handleScore = useCallback(async () => {
    if (isScoring) return
    setScoreLabel(null)
    try {
      const { taskId } = await api.post<{ taskId: string }>(`/api/jobs/${job.id}/score`, {})
      setScoreTaskId(taskId)
    } catch (err: any) {
      alert(err?.message || 'Failed to start scoring')
    }
  }, [job.id, isScoring])

  useEffect(() => {
    if (scoreTask && (scoreTask.status === 'done' || scoreTask.status === 'error')) {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
      setScoreTaskId(null)
      if (scoreTask.status === 'done') setScoreLabel('✓ Scored!')
    }
  }, [scoreTask?.status])

  const progress = activeTask?.progress ?? 0
  const isGenerating = !!activeTask

  const titleChanged = editTitle !== job.title || editCompany !== job.company

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: '#0f1117',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px 12px 0 0',
          padding: 20,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Editable header */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={editCompany}
            onChange={e => setEditCompany(e.target.value)}
            placeholder="Company"
            style={{
              width: '100%', background: 'transparent', border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              color: '#f1f5f9', fontSize: 16, fontWeight: 600,
              padding: '2px 0', marginBottom: 6, outline: 'none',
            }}
          />
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Job title"
            style={{
              width: '100%', background: 'transparent', border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', fontSize: 14,
              padding: '2px 0', outline: 'none',
            }}
          />
          {titleChanged && (
            <button
              onClick={handleSaveTitleCompany}
              disabled={isEditing}
              style={{
                marginTop: 8, padding: '5px 12px',
                background: 'rgba(167,139,250,0.15)',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: 6, color: '#a78bfa',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {titleSaved ? '✓ Saved' : isEditing ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>

        {errorMessage && (
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{errorMessage}</div>
        )}

        {/* Cover Letter Section */}
        <div style={{ marginBottom: 20 }}>
          {!isEditingLetter ? (
            <button
              disabled={!job.url || isGenerating}
              onClick={handleGenerate}
              style={{
                width: '100%', padding: '12px',
                background: isGenerating ? 'rgba(167,139,250,0.05)' : 'rgba(167,139,250,0.1)',
                border: '1px solid rgba(167,139,250,0.2)',
                borderRadius: 10, color: '#a78bfa', fontSize: 14, fontWeight: 600,
                cursor: !job.url || isGenerating ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                opacity: !job.url ? 0.5 : 1, position: 'relative', overflow: 'hidden',
              }}
            >
              {isGenerating && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${progress}%`, background: 'rgba(167,139,250,0.1)',
                  transition: 'width 0.4s ease-out',
                }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                {isGenerating ? (
                  <><div className="spinner" /><span>{activeTask.lastMessage || 'Processing…'} ({progress}%)</span></>
                ) : '✨ Generate Cover Letter'}
              </div>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', letterSpacing: 0.5 }}>EDIT DRAFT</div>
              <textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                style={{
                  width: '100%', height: 200, padding: 12,
                  background: '#080a10', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#e2e8f0', fontSize: 13, lineHeight: 1.5,
                  resize: 'none', outline: 'none',
                }}
              />
              <button
                onClick={handleFinalSave}
                disabled={isSyncing}
                style={{
                  width: '100%', padding: '10px', background: '#a78bfa', color: '#000',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {isSyncing ? 'Exporting to Disk…' : 'Finalize & Save to Aivancity folder'}
              </button>
            </div>
          )}
          {!job.url && !isEditingLetter && (
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4, textAlign: 'center' }}>
              No URL available for this job
            </div>
          )}
        </div>

        {/* Score button */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={handleScore}
            disabled={isScoring}
            style={{
              width: '100%', padding: '11px',
              background: isScoring ? 'rgba(56,189,248,0.05)' : 'rgba(56,189,248,0.08)',
              border: '1px solid rgba(56,189,248,0.2)',
              borderRadius: 10, color: isScoring ? '#334155' : '#38bdf8',
              fontSize: 14, fontWeight: 600,
              cursor: isScoring ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              position: 'relative', overflow: 'hidden',
            }}
          >
            {isScoring && (
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${scoreTask?.progress ?? 0}%`,
                background: 'rgba(56,189,248,0.08)', transition: 'width 0.4s ease-out',
              }} />
            )}
            <span style={{ position: 'relative' }}>
              {isScoring
                ? `🤖 Scoring… (${scoreTask?.progress ?? 0}%)`
                : scoreLabel ?? (job.job_score != null
                  ? `⭐ Re-score (current: ${job.job_score}/100)`
                  : '⭐ Score vs Profile')}
            </span>
          </button>
          {job.job_score != null && job.job_score_reason && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, fontSize: 11, color: '#64748b', lineHeight: 1.5,
            }}>
              {job.job_score_reason.split('\n').filter(Boolean).map((line, i) => (
                <div key={i}>• {line.replace(/^[-•]\s*/, '')}</div>
              ))}
            </div>
          )}
        </div>

        {/* Linked emails */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: 0.5, marginBottom: 8 }}>
            INBOX EMAILS
          </div>
          {emailsLoading ? (
            <div style={{ fontSize: 12, color: '#374151' }}>Loading…</div>
          ) : linkedEmails.length === 0 ? (
            <div style={{ fontSize: 12, color: '#374151' }}>No linked emails yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {linkedEmails.map(e => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 6,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: STATUS_COLOR[e.status] ?? '#94a3b8',
                  }} />
                  <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parseSenderName(e.from_addr)} — {e.subject}
                  </span>
                  {e.stage && e.stage !== 'NO' && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, flexShrink: 0,
                      color: STAGE_COLOR[e.stage] ?? '#94a3b8',
                      background: `${STAGE_COLOR[e.stage] ?? '#94a3b8'}15`,
                      padding: '1px 6px', borderRadius: 4,
                    }}>
                      {e.stage}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stage buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {PIPELINE_STAGES.map(stage => {
            const isCurrent = stage === job.pipeline_status
            return (
              <button
                key={stage}
                disabled={isCurrent || isPending}
                onClick={() => onMove(stage)}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13,
                  cursor: isCurrent || isPending ? 'default' : 'pointer',
                  background: isCurrent ? '#a78bfa' : 'rgba(255,255,255,0.06)',
                  color: isCurrent ? '#000' : '#94a3b8',
                  border: 'none', opacity: isPending && !isCurrent ? 0.5 : 1,
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                {STAGE_LABELS[stage]}
              </button>
            )
          })}
        </div>

        {/* Close + Delete */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: 10,
              background: 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: 8,
              color: '#94a3b8', cursor: 'pointer', fontSize: 14,
            }}
          >
            Close
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              padding: '10px 16px',
              background: deleteConfirm ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.04)',
              border: deleteConfirm ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              color: deleteConfirm ? '#f87171' : '#4b5563',
              cursor: isDeleting ? 'default' : 'pointer',
              fontSize: 13, fontWeight: deleteConfirm ? 700 : 400,
              transition: 'all 0.2s',
            }}
          >
            {isDeleting ? 'Deleting…' : deleteConfirm ? '⚠ Confirm delete' : '🗑 Delete'}
          </button>
        </div>

        <style>{`
          .spinner {
            width: 14px; height: 14px; border: 2px solid #a78bfa;
            border-top-color: transparent; border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </>
  )
}
