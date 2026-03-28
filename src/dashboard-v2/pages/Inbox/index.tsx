import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useIsMobile } from '@/hooks/useIsMobile'

interface Email {
  id: number
  from_addr: string
  subject: string
  snippet: string
  status: 'positive' | 'negative' | 'neutral'
  email_date: string | null
  created_at: string
  action_needed: string
  stage: string | null
  gmail_message_id: string | null
  gmail_thread_id: string | null
  linked_job_id: string | null
  followup_subject: string | null
  followup_body: string | null
  followup_created_at: string | null
}

interface Job {
  id: string
  title: string
  company: string
  pipeline_status: string
}

const EMAIL_PAGE_SIZE = 50

function useEmails(limit: number) {
  return useQuery({
    queryKey: [...queryKeys.emails, limit],
    queryFn: () => api.get<Email[]>(`/api/emails?limit=${limit}`),
    staleTime: 30_000,
  })
}

function useJobs() {
  return useQuery({
    queryKey: ['jobs-for-inbox'],
    queryFn: () => api.get<Job[]>(`/api/jobs?limit=200`),
    staleTime: 60_000,
  })
}

// ── Helpers ────────────────────────────────────────────

function formatDate(raw: string | null, fallback: string): string {
  const src = raw || fallback
  if (!src) return ''
  const d = new Date(src)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFullDate(raw: string | null, fallback: string): string {
  const src = raw || fallback
  if (!src) return ''
  return new Date(src).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Strip all HTML artifacts and normalize whitespace */
function cleanBodyText(str: string): string {
  if (!str) return ''
  return str
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|p|div|li|h[1-6]|tr|td)[^>]*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseSender(from_addr: string): { name: string; email: string } {
  const m = from_addr.match(/^(.*?)\s*<(.+?)>$/)
  if (m) return { name: m[1].replace(/^["']|["']$/g, '').trim() || m[2], email: m[2] }
  return { name: from_addr, email: from_addr }
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

// ── Status Badge ───────────────────────────────────────

function StatusBadge({ status }: { status: Email['status'] }) {
  const map = {
    positive: { color: '#4ade80', label: 'Positive' },
    negative: { color: '#f87171', label: 'Negative' },
    neutral:  { color: '#94a3b8', label: 'Unread' },
  }
  const { color, label } = map[status] ?? map.neutral
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: `${color}20`, color, border: `1px solid ${color}40`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Thread List Item ───────────────────────────────────

function ThreadListItem({
  thread, isActive, onClick,
}: {
  thread: { id: string; emails: Email[]; latest: Email }
  isActive: boolean
  onClick: () => void
}) {
  const { latest, emails } = thread
  const { name } = parseSender(latest.from_addr)
  const date = formatDate(latest.email_date, latest.created_at)
  const hasAction = emails.some(e => e.action_needed === 'reply' || e.action_needed === 'test')
  const FOLLOWUP_THRESHOLD_MS = 17.5 * 24 * 60 * 60 * 1000 // 2.5 weeks
  const needsFollowup = emails.some(e => {
    if (!['pending', 'acknowledgment'].includes(e.stage ?? '')) return false
    if (e.followup_body) return false
    const sentAt = e.email_date ? new Date(e.email_date).getTime() : new Date(e.created_at).getTime()
    return Date.now() - sentAt >= FOLLOWUP_THRESHOLD_MS
  })

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: isActive ? 'rgba(56,189,248,0.07)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderLeft: isActive ? '3px solid #38bdf8' : '3px solid transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#38bdf8' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
          {name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasAction && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
          {needsFollowup && <span title="Follow-up recommended" style={{ fontSize: 11, lineHeight: 1 }}>❄️</span>}
          <span style={{ fontSize: 11, color: '#4b5563' }}>{date}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
        {latest.subject || '(no subject)'}
        {emails.length > 1 && <span style={{ fontSize: 10, color: '#4b5563', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 8 }}>{emails.length}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cleanBodyText(latest.snippet)}
        </span>
        <StatusBadge status={latest.status} />
      </div>
    </div>
  )
}

// ── Email Message Card (right side) ───────────────────

function EmailMessage({
  email,
  onHidden,
  onRejectionMarked,
}: {
  email: Email
  onHidden: (id: number) => void
  onRejectionMarked: (id: number) => void
}) {
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [hiding, setHiding] = useState(false)
  const [markingRejection, setMarkingRejection] = useState(false)
  const [isRejection, setIsRejection] = useState(email.stage === 'rejection')

  const [followupBusy, setFollowupBusy] = useState(false)
  const [followupSubject, setFollowupSubject] = useState<string>(email.followup_subject ?? '')
  const [followupBody, setFollowupBody] = useState<string>(email.followup_body ?? '')
  const [creatingJob, setCreatingJob] = useState(false)
  const [linkedJobId, setLinkedJobId] = useState<string | null>(email.linked_job_id)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { name, email: emailAddr } = parseSender(email.from_addr)
  const date = formatFullDate(email.email_date, email.created_at)

  useEffect(() => {
    setLinkedJobId(email.linked_job_id)
  }, [email.linked_job_id])

  useEffect(() => {
    let active = true
    setFollowupSubject(email.followup_subject ?? '')
    setFollowupBody(email.followup_body ?? '')

    async function load() {
      setLoading(true)
      try {
        const res = await api.get<{ body: string }>(`/api/emails/${email.id}/body`)
        if (active) setBody(res.body ?? null)
      } catch {
        if (active) setBody(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [email.id, email.followup_subject, email.followup_body])

  async function generateFollowup() {
    if (followupBusy) return
    setFollowupBusy(true)
    try {
      const { taskId } = await api.post<{ taskId: string }>(`/api/emails/${email.id}/followup`, {})
      while (true) {
        const t = await api.get<any>(`/api/tasks/${taskId}`)
        if (t.status === 'done' || t.status === 'error' || t.status === 'cancelled') break
        await new Promise(r => setTimeout(r, 1100))
      }
      const updated = await api.get<any>(`/api/emails/${email.id}`)
      setFollowupSubject(String(updated.followup_subject ?? ''))
      setFollowupBody(String(updated.followup_body ?? ''))
    } catch (err: any) {
      alert(err?.message || 'Failed to generate follow-up')
    } finally {
      setFollowupBusy(false)
    }
  }

  async function markNotJobRelated() {
    if (hiding) return
    setHiding(true)
    try {
      await api.patch(`/api/emails/${email.id}`, { hidden: 1 })
      onHidden(email.id)
    } catch (err: any) {
      alert(err?.message || 'Failed to hide email')
      setHiding(false)
    }
  }

  async function markAsRejection() {
    if (markingRejection || isRejection) return
    setMarkingRejection(true)
    try {
      await api.patch(`/api/emails/${email.id}`, { status: 'negative', stage: 'rejection', action_needed: 'none' })
      setIsRejection(true)
      onRejectionMarked(email.id)
    } catch (err: any) {
      alert(err?.message || 'Failed to mark as rejection')
    } finally {
      setMarkingRejection(false)
    }
  }

  const cleanBody = body ? cleanBodyText(body) : null

  return (
    <div style={{
      marginBottom: 12,
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      overflow: 'hidden',
      background: '#0c0f18',
    }}>
      {/* Message header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #1e3a5f, #0f2040)',
            border: '1px solid rgba(56,189,248,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#38bdf8',
          }}>
            {initials(name)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{name}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{emailAddr}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#475569' }}>{date}</div>
            {email.gmail_message_id && (
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${email.gmail_message_id}`}
                target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, color: '#38bdf8', textDecoration: 'none' }}
              >
                Open in Gmail ↗
              </a>
            )}
          </div>
          {/* Mark as rejection button */}
          {!isRejection && (
            <button
              onClick={e => { e.stopPropagation(); markAsRejection() }}
              disabled={markingRejection}
              title="Mark this email as a rejection"
              style={{
                height: 26, padding: '0 10px',
                background: 'transparent',
                border: '1px solid rgba(248,113,113,0.25)',
                borderRadius: 6, color: '#f87171',
                fontSize: 10, fontWeight: 700, cursor: markingRejection ? 'not-allowed' : 'pointer',
                opacity: markingRejection ? 0.4 : 1, transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {markingRejection ? '…' : '👎 Rejection'}
            </button>
          )}
          {isRejection && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', padding: '0 6px', opacity: 0.6 }}>❌ Rejected</span>
          )}
          {/* Not job-related button */}
          <button
            onClick={e => { e.stopPropagation(); markNotJobRelated() }}
            disabled={hiding}
            title="Mark as not job-related (hide from inbox)"
            style={{
              height: 26, padding: '0 10px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, color: '#475569',
              fontSize: 10, fontWeight: 700, cursor: hiding ? 'not-allowed' : 'pointer',
              opacity: hiding ? 0.4 : 1, transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (!hiding) { (e.target as HTMLButtonElement).style.borderColor = 'rgba(248,113,113,0.4)'; (e.target as HTMLButtonElement).style.color = '#f87171' } }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.target as HTMLButtonElement).style.color = '#475569' }}
          >
            {hiding ? '…' : '✕ Not job-related'}
          </button>
          <span style={{ color: '#334155', fontSize: 14 }}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '20px 24px' }}>
          {loading ? (
            <div style={{ color: '#334155', fontSize: 13, fontStyle: 'italic' }}>Loading…</div>
          ) : cleanBody ? (
            <div style={{
              fontSize: 14, lineHeight: 1.75, color: '#cbd5e1',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
            }}>
              {cleanBody}
            </div>
          ) : (
            <div style={{ color: '#334155', fontSize: 13, fontStyle: 'italic' }}>(No body)</div>
          )}

          {/* Job card section */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
            {linkedJobId ? (
              <button
                onClick={() => navigate(`/pipeline?jobId=${encodeURIComponent(linkedJobId)}`)}
                style={{
                  height: 32, padding: '0 16px',
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.25)',
                  borderRadius: 8, color: '#38bdf8',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                💼 View Job →
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (creatingJob) return
                  setCreatingJob(true)
                  try {
                    const res = await api.post<{ ok: boolean; jobId: string }>(`/api/emails/${email.id}/create-job`, {})
                    if (res.ok) {
                      setLinkedJobId(res.jobId)
                      queryClient.invalidateQueries({ queryKey: queryKeys.emails })
                      queryClient.invalidateQueries({ queryKey: ['jobs-for-inbox'] })
                    }
                  } catch (err: any) {
                    alert(err?.message || 'Failed to create job card')
                  } finally {
                    setCreatingJob(false)
                  }
                }}
                disabled={creatingJob}
                style={{
                  height: 32, padding: '0 16px',
                  background: 'rgba(74,222,128,0.08)',
                  border: '1px solid rgba(74,222,128,0.2)',
                  borderRadius: 8, color: '#4ade80',
                  fontSize: 11, fontWeight: 700, cursor: creatingJob ? 'not-allowed' : 'pointer',
                  opacity: creatingJob ? 0.5 : 1, transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {creatingJob ? 'Creating…' : '+ Create Job Card'}
              </button>
            )}
          </div>

          {/* Follow-up section */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Follow-up draft</div>
            {followupBody ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#475569' }}>
                  Subject: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{followupSubject || '(none)'}</span>
                </div>
                <div style={{
                  fontSize: 13, lineHeight: 1.7, color: '#94a3b8',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  padding: '12px 14px', background: 'rgba(255,255,255,0.02)',
                  borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  {cleanBodyText(followupBody)}
                </div>
                <button
                  onClick={async () => {
                    if (savingDraft) return
                    setSavingDraft(true)
                    setDraftSaved(false)
                    try {
                      await api.post(`/api/emails/${email.id}/gmail-draft`, {})
                      setDraftSaved(true)
                      setTimeout(() => setDraftSaved(false), 4000)
                    } catch (err: any) {
                      alert(err?.message || 'Failed to save Gmail draft')
                    } finally {
                      setSavingDraft(false)
                    }
                  }}
                  disabled={savingDraft}
                  style={{
                    alignSelf: 'flex-start',
                    height: 32, padding: '0 14px',
                    background: draftSaved ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.04)',
                    border: draftSaved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    color: draftSaved ? '#4ade80' : '#94a3b8',
                    fontSize: 11, fontWeight: 700,
                    cursor: savingDraft ? 'not-allowed' : 'pointer',
                    opacity: savingDraft ? 0.5 : 1, transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {savingDraft ? 'Saving…' : draftSaved ? '✓ Saved to Gmail Drafts' : '📤 Save to Gmail Drafts'}
                </button>
              </div>
            ) : (
              <button
                onClick={generateFollowup}
                disabled={followupBusy}
                style={{
                  height: 36, padding: '0 20px',
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 10, color: '#f59e0b',
                  fontSize: 12, fontWeight: 700, cursor: followupBusy ? 'not-allowed' : 'pointer',
                  opacity: followupBusy ? 0.5 : 1, transition: 'opacity 0.2s',
                }}
              >
                {followupBusy ? 'Generating…' : '✍ Generate follow-up'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Scan Progress ─────────────────────────────────────

interface ScanProgress {
  running: boolean
  phase: 'idle' | 'fetching' | 'metadata' | 'classifying' | 'done' | 'error'
  totalEmails: number
  processed: number
  matched: number
  error?: string
  lastScanAt?: string
}

const SCAN_PRESETS = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ScanButton({ onDone }: { onDone: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [days, setDays] = useState(7)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch progress once on mount to show lastScanAt
  useEffect(() => {
    api.get<ScanProgress>('/api/emails/scan/progress').then(p => setProgress(p)).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (fadeTimer1Ref.current) clearTimeout(fadeTimer1Ref.current)
      if (fadeTimer2Ref.current) clearTimeout(fadeTimer2Ref.current)
    }
  }, [])

  async function startScan() {
    if (scanning) return
    setScanning(true)
    setProgress(null)
    try {
      await api.post('/api/emails/scan', { days })
      const interval = setInterval(async () => {
        try {
          const p = await api.get<ScanProgress>('/api/emails/scan/progress')
          setProgress(p)
          if (!p.running || p.phase === 'done' || p.phase === 'error') {
            clearInterval(interval)
            setScanning(false)
            if (p.phase === 'done') { onDone(); setShowDone(true); setFadingOut(false); fadeTimer1Ref.current = setTimeout(() => setFadingOut(true), 3000); fadeTimer2Ref.current = setTimeout(() => setShowDone(false), 3500) }
          }
        } catch {
          clearInterval(interval)
          setScanning(false)
        }
      }, 1000)
      intervalRef.current = interval
    } catch (err: any) {
      setScanning(false)
      alert(err?.message || 'Scan failed to start')
    }
  }

  const phaseLabel: Record<string, string> = {
    idle: 'Starting…',
    fetching: 'Fetching emails…',
    metadata: 'Reading headers…',
    classifying: 'Classifying emails…',
    done: '✓ Done',
    error: '❌ Error',
  }
  // progress.processed is already a 0–100 integer maintained by the backend.
  // Do NOT divide by totalEmails — that produces wrong values.
  const pct = progress ? progress.processed : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {scanning && progress ? (
        <div style={{
          background: 'rgba(56,189,248,0.07)',
          border: '1px solid rgba(56,189,248,0.20)',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
              {phaseLabel[progress.phase] ?? progress.phase}
            </span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#38bdf8', lineHeight: 1 }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#38bdf8', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>
            {progress.totalEmails > 0 ? `${progress.totalEmails} emails` : 'Loading…'} · {progress.matched} matched
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap' }}>Period:</span>
            {SCAN_PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                style={{
                  height: 22, padding: '0 8px',
                  background: days === p.days ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
                  border: days === p.days ? '1px solid rgba(56,189,248,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 5,
                  color: days === p.days ? '#38bdf8' : '#64748b',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={startScan} disabled={scanning}
            style={{
              height: 32, padding: '0 14px',
              background: 'rgba(56,189,248,0.10)',
              border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8,
              color: '#38bdf8',
              fontSize: 11, fontWeight: 900, cursor: 'pointer',
              letterSpacing: 0.5, transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}
          >
            ⟳ SCAN EMAILS
          </button>
        </div>
      )}
      {showDone && (
        <div style={{ fontSize: 10, color: '#4ade80', textAlign: 'center', opacity: fadingOut ? 0 : 1, transition: 'opacity 0.5s ease' }}>
          ✓ {progress?.matched ?? 0} new emails found
        </div>
      )}
      {!scanning && !showDone && progress?.lastScanAt && (
        <div style={{ fontSize: 10, color: '#334155', textAlign: 'center' }}>
          Last scan: {formatTimeAgo(progress.lastScanAt)}
        </div>
      )}
    </div>
  )
}

// ── Job Filter Dropdown ────────────────────────────────

function JobFilterDropdown({
  jobs,
  emails,
  selectedJobId,
  onChange,
}: {
  jobs: Job[]
  emails: Email[]
  selectedJobId: string | null
  onChange: (id: string | null) => void
}) {
  // Only show jobs that have at least one linked email
  const linkedJobIds = useMemo(() => new Set(emails.map(e => e.linked_job_id).filter(Boolean)), [emails])
  const filteredJobs = useMemo(() => jobs.filter(j => linkedJobIds.has(j.id)), [jobs, linkedJobIds])

  if (filteredJobs.length === 0) return null

  return (
    <div style={{ marginBottom: 10 }}>
      <select
        value={selectedJobId ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: '#0d1017',
          border: selectedJobId
            ? '1px solid rgba(56,189,248,0.4)'
            : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          color: selectedJobId ? '#38bdf8' : '#64748b',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          paddingRight: 28,
        }}
      >
        <option value=''>All jobs ({emails.length})</option>
        {filteredJobs.map(j => {
          const count = emails.filter(e => e.linked_job_id === j.id).length
          return (
            <option key={j.id} value={j.id}>
              {j.company} — {j.title} ({count})
            </option>
          )
        })}
      </select>
    </div>
  )
}

// ── Link Job Selector ─────────────────────────────────

function LinkJobSelector({
  emails,
  jobs,
  onLinked,
}: {
  emails: Email[]
  jobs: Job[]
  onLinked: () => void
}) {
  const [linking, setLinking] = useState(false)

  // Use the first email's linked_job_id as the current value for the thread
  const currentLinkedJobId = emails[0]?.linked_job_id ?? null

  async function handleChange(jobId: string) {
    if (linking) return
    setLinking(true)
    try {
      const newJobId = jobId || null
      // Update all emails in the thread
      await Promise.all(
        emails.map(e => api.patch(`/api/emails/${e.id}`, { linked_job_id: newJobId }))
      )
      onLinked()
    } catch (err: any) {
      alert(err?.message || 'Failed to link job')
    } finally {
      setLinking(false)
    }
  }

  return (
    <select
      value={currentLinkedJobId ?? ''}
      disabled={linking}
      onChange={e => handleChange(e.target.value)}
      title="Link this thread to a job"
      style={{
        padding: '3px 8px',
        background: currentLinkedJobId ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.04)',
        border: currentLinkedJobId ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        color: currentLinkedJobId ? '#a78bfa' : '#475569',
        fontSize: 10,
        fontWeight: 600,
        cursor: linking ? 'not-allowed' : 'pointer',
        outline: 'none',
        maxWidth: 160,
      }}
    >
      <option value=''>🔗 Link to job…</option>
      {jobs.map(j => (
        <option key={j.id} value={j.id}>
          {j.company} — {j.title.slice(0, 28)}
        </option>
      ))}
    </select>
  )
}

// ── Main Page ─────────────────────────────────────────

export default function InboxPage() {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [emailLimit, setEmailLimit] = useState(EMAIL_PAGE_SIZE)
  const { data, isLoading, refetch } = useEmails(emailLimit)
  const { data: jobsData } = useJobs()
  const hasMoreEmails = (data?.length ?? 0) === emailLimit && emailLimit < 500
  const [filterStatus, setFilterStatus] = useState<Email['status'] | null>(null)
  const [filterJobId, setFilterJobId] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  // Tracks whether the user manually went back — prevents auto-reselect from fighting the back button
  const userWentBack = useRef(false)

  const emails = data ?? []
  const jobs = jobsData ?? []

  // Group by thread
  const threads = useMemo(() => {
    const groups: Record<string, Email[]> = {}
    emails.forEach(e => {
      const tid = e.gmail_thread_id || `subject:${e.subject.toLowerCase().replace(/^re:\s*/i, '').replace(/^fwd?:\s*/i, '')}`
      if (!groups[tid]) groups[tid] = []
      groups[tid].push(e)
    })

    return Object.entries(groups)
      .map(([id, threadEmails]) => {
        const sorted = [...threadEmails].sort((a, b) =>
          new Date(b.email_date || b.created_at).getTime() - new Date(a.email_date || a.created_at).getTime()
        )
        return { id, emails: threadEmails, latest: sorted[0] }
      })
      .filter(t => !filterStatus || t.latest.status === filterStatus)
      .filter(t => !filterJobId || t.emails.some(e => e.linked_job_id === filterJobId))
      .sort((a, b) => {
        const da = new Date(a.latest.email_date || a.latest.created_at).getTime()
        const db = new Date(b.latest.email_date || b.latest.created_at).getTime()
        return sortOrder === 'desc' ? db - da : da - db
      })
  }, [emails, filterStatus, filterJobId, sortOrder])

  const selectedThread = useMemo(() =>
    threads.find(t => t.id === selectedThreadId),
    [threads, selectedThreadId]
  )

  // Auto-select first thread on desktop only, and only if the user hasn't manually gone back
  useEffect(() => {
    if (!isMobile && !selectedThreadId && threads.length > 0 && !userWentBack.current) {
      setSelectedThreadId(threads[0].id)
    }
  }, [threads, selectedThreadId, isMobile])

  // If the selected thread disappears (e.g. all emails hidden), clear the selection
  useEffect(() => {
    if (selectedThreadId && !threads.find(t => t.id === selectedThreadId)) {
      setSelectedThreadId(null)
    }
  }, [threads, selectedThreadId])

  // When an email is hidden, remove it from local cache immediately
  function handleEmailHidden(emailId: number) {
    queryClient.setQueryData([...queryKeys.emails, emailLimit], (old: Email[] | undefined) =>
      old ? old.filter(e => e.id !== emailId) : old
    )
  }

  // When manually marked as rejection, update status in local cache
  function handleRejectionMarked(emailId: number) {
    queryClient.setQueryData([...queryKeys.emails, emailLimit], (old: Email[] | undefined) =>
      old ? old.map(e => e.id === emailId ? { ...e, status: 'negative' as const, stage: 'rejection', action_needed: 'none' } : e) : old
    )
  }

  const showList = !isMobile || !selectedThreadId
  const showDetail = !isMobile || !!selectedThreadId

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', background: '#080a10' }}>

      {/* ── Left: Thread List ── */}
      <div style={{
        width: isMobile ? '100%' : 340,
        display: showList ? 'flex' : 'none',
        flexDirection: 'column', flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
        background: '#090c14',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>

          {/* Job filter dropdown */}
          <JobFilterDropdown
            jobs={jobs}
            emails={emails}
            selectedJobId={filterJobId}
            onChange={id => { setFilterJobId(id); setSelectedThreadId(null) }}
          />

          {/* Status filter pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {([
              { label: 'All', key: null, color: '#94a3b8' },
              { label: 'Positive', key: 'positive' as const, color: '#4ade80' },
              { label: 'Negative', key: 'negative' as const, color: '#f87171' },
              { label: 'Unread', key: 'neutral' as const, color: '#a78bfa' },
            ] as const).map(({ label, key, color }) => (
              <button
                key={label}
                onClick={() => { setFilterStatus(key); setSelectedThreadId(null) }}
                style={{
                  flex: 1, padding: '5px 2px', fontSize: 9, fontWeight: 700,
                  borderRadius: 6, border: filterStatus === key ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.05)',
                  background: filterStatus === key ? `${color}15` : 'transparent',
                  color: filterStatus === key ? color : '#4b5563',
                  cursor: 'pointer', transition: 'all 0.2s', letterSpacing: 0.3,
                }}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Row 2: count + sort + scan */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: 0.5 }}>{threads.length} THREADS</span>
              <button
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 10, fontWeight: 700, cursor: 'pointer', marginLeft: 10 }}
              >
                {sortOrder === 'desc' ? '↓ Newest' : '↑ Oldest'}
              </button>
            </div>
            <ScanButton onDone={() => refetch()} />
          </div>
        </div>

        {/* Thread list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 12 }}>Loading inbox…</div>}
          {!isLoading && threads.map(t => (
            <ThreadListItem
              key={t.id}
              thread={t}
              isActive={selectedThreadId === t.id}
              onClick={() => { userWentBack.current = false; setSelectedThreadId(t.id) }}
            />
          ))}
          {!isLoading && threads.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: '#4b5563', fontSize: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
              <div style={{ marginBottom: 6 }}>No threads found</div>
              <div style={{ fontSize: 11, color: '#334155' }}>Tap ⟳ SCAN EMAILS above to load your inbox</div>
            </div>
          )}
          {!isLoading && hasMoreEmails && (
            <button
              onClick={() => setEmailLimit(l => Math.min(l + EMAIL_PAGE_SIZE, 500))}
              style={{
                display: 'block', width: '100%', padding: '12px',
                background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)',
                color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Load more
            </button>
          )}
        </div>
      </div>

      {/* ── Right: Reading Pane ── */}
      <div style={{ flex: 1, display: showDetail ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', width: isMobile ? '100%' : undefined }}>
        {/* Mobile back button — always visible so you're never stuck */}
        {isMobile && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#090c14', flexShrink: 0 }}>
            <button
              onClick={() => { userWentBack.current = true; setSelectedThreadId(null) }}
              style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              ← Back
            </button>
          </div>
        )}
        {selectedThread ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {/* Reading pane header */}
            <div style={{
              padding: isMobile ? '14px 16px' : '20px 28px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: '#090c14', flexShrink: 0,
            }}>
              <div style={{ fontSize: isMobile ? 16 : 19, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3, marginBottom: 10 }}>
                {selectedThread.latest.subject || '(No Subject)'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <StatusBadge status={selectedThread.latest.status} />
                {(selectedThread.latest.action_needed === 'reply' || selectedThread.latest.action_needed === 'test') ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.2)' }}>
                    ACTION NEEDED
                  </span>
                ) : null}
                <span style={{ fontSize: 11, color: '#334155' }}>
                  {selectedThread.emails.length === 1 ? '1 message' : `${selectedThread.emails.length} messages`}
                </span>
                {/* Link to job selector */}
                <LinkJobSelector
                  emails={selectedThread.emails}
                  jobs={jobs}
                  onLinked={() => refetch()}
                />
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '20px 28px 40px' }}>
              {[...selectedThread.emails]
                .sort((a, b) =>
                  new Date(a.email_date || a.created_at).getTime() -
                  new Date(b.email_date || b.created_at).getTime()
                )
                .map(email => (
                  <EmailMessage
                    key={email.id}
                    email={email}
                    onHidden={handleEmailHidden}
                    onRejectionMarked={handleRejectionMarked}
                  />
                ))}
            </div>

          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>📩</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>Select a thread to read</div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
