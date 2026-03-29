import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useTargets,
  useSpontaneeStats,
  useBatchGenerate,
  useDiscoverTargets,
} from '@/hooks/useSpontanee'
import { TaskPoller } from '@/components/TaskPoller'
import { TargetCard } from './TargetCard'
import { TargetSheet } from './TargetSheet'
import type { Target } from '@/hooks/useSpontanee'
import type { DiscoverTargetSuggestion } from '@/hooks/useSpontanee'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

type StatusFilter = 'all' | 'pending' | 'draft' | 'sent' | 'replied'

const FILTERS: StatusFilter[] = ['all', 'pending', 'draft', 'sent', 'replied']

const STAT_CARDS = [
  { key: 'pending', label: 'Pending', color: '#94a3b8' },
  { key: 'draft', label: 'Draft', color: '#F59E0B' },
  { key: 'sent', label: 'Sent', color: '#38bdf8' },
  { key: 'replied', label: 'Replied', color: '#4ade80' },
]

// RFC 5322-ish email validation for HR email field.
// This is intentionally strict enough for hallucination filtering.
const RFC5322_EMAIL_REGEX =
  /^(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(?:\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-zA-Z-]*[a-zA-Z0-9]:?)\]))$/;

export function OutreachTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { data: targets, isLoading, isError } = useTargets(statusFilter)
  const { data: stats } = useSpontaneeStats()
  const { mutateAsync: batchGenerate, isPending: isBatchPending } = useBatchGenerate()

  const { mutateAsync: discoverTargets, isPending: isDiscoverPending } = useDiscoverTargets()

  const [showAddForm, setShowAddForm] = useState(false)
  const [addCompany, setAddCompany] = useState('')
  const [addHrEmail, setAddHrEmail] = useState('')
  const [addIndustry, setAddIndustry] = useState('')
  const [addError, setAddError] = useState('')

  const [discoverIndustryHint, setDiscoverIndustryHint] = useState('')
  const [discoverSuggestions, setDiscoverSuggestions] = useState<DiscoverTargetSuggestion[]>([])
  const [discoverError, setDiscoverError] = useState('')

  const addTargetMutation = useMutation({
    mutationFn: (body: { company: string; hr_email: string; industry: string }) =>
      api.post('/api/spontanee', body),
    onSuccess: async () => {
      setStatusFilter('pending')
      setShowAddForm(false)
      setAddCompany('')
      setAddHrEmail('')
      setAddIndustry('')
      setAddError('')
      setDiscoverSuggestions([])
      setDiscoverError('')

      await queryClient.invalidateQueries({ queryKey: ['spontanee', 'targets'] })
      await queryClient.invalidateQueries({ queryKey: queryKeys.spontanee })
    },
  })

  async function handleBatchGenerate() {
    try {
      const res = await batchGenerate(5)
      if (res.taskId) setBatchTaskId(res.taskId)
    } catch {
      // handled by hook
    }
  }

  const ACCENT = '#a78bfa'

  async function handleAddTargetSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')

    const company = addCompany.trim()
    const hr_email = addHrEmail.trim()
    const industry = addIndustry.trim()

    if (!company) return setAddError('Company name is required')
    if (!RFC5322_EMAIL_REGEX.test(hr_email)) return setAddError('HR email must be valid')

    await addTargetMutation.mutateAsync({ company, hr_email, industry })
  }

  async function handleDiscover() {
    setDiscoverError('')
    try {
      const suggestions = await discoverTargets({
        count: 10,
        industry: discoverIndustryHint.trim() || undefined,
      })
      setDiscoverSuggestions(suggestions)
    } catch (err: any) {
      setDiscoverError(err?.message || 'Discovery failed')
    }
  }

  async function handleAddSuggestion(s: DiscoverTargetSuggestion) {
    // If the backend returned an invalid/unknown HR email, force the user to fill it in.
    if (!s.hr_email || !RFC5322_EMAIL_REGEX.test(s.hr_email)) {
      setAddCompany(s.company)
      setAddIndustry(s.industry || '')
      setAddHrEmail('')
      setAddError('HR email is required to add this company')
      setShowAddForm(true)
      return
    }

    await addTargetMutation.mutateAsync({
      company: s.company,
      hr_email: s.hr_email,
      industry: s.industry || '',
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Add Target + Discover */}
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setShowAddForm((v) => !v)}
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              background: 'rgba(167,139,250,0.12)',
              border: '1px solid rgba(167,139,250,0.25)',
              color: '#a78bfa',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {showAddForm ? 'Close' : 'Add Target'}
          </button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={discoverIndustryHint}
              onChange={(e) => setDiscoverIndustryHint(e.target.value)}
              placeholder="Industry hint (optional)"
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                outline: 'none',
                fontSize: 12,
                minWidth: 220,
              }}
            />
            <button
              onClick={handleDiscover}
              disabled={isDiscoverPending}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 10,
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.20)',
                color: '#F59E0B',
                cursor: isDiscoverPending ? 'default' : 'pointer',
                opacity: isDiscoverPending ? 0.7 : 1,
                fontSize: 12,
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              {isDiscoverPending ? 'Discovering…' : 'Discover Companies'}
            </button>
          </div>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddTargetSubmit} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={addCompany}
                onChange={(e) => setAddCompany(e.target.value)}
                placeholder="Company name"
                style={{
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 10,
                  background: '#0f1117',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#f1f5f9',
                  outline: 'none',
                  fontSize: 13,
                  flex: '1 1 220px',
                }}
              />
              <input
                value={addHrEmail}
                onChange={(e) => setAddHrEmail(e.target.value)}
                placeholder="HR email"
                style={{
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 10,
                  background: '#0f1117',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#f1f5f9',
                  outline: 'none',
                  fontSize: 13,
                  flex: '1 1 240px',
                }}
              />
              <input
                value={addIndustry}
                onChange={(e) => setAddIndustry(e.target.value)}
                placeholder="Industry (optional)"
                style={{
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 10,
                  background: '#0f1117',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#f1f5f9',
                  outline: 'none',
                  fontSize: 13,
                  flex: '1 1 220px',
                }}
              />
            </div>

            {addError && (
              <div style={{ marginTop: 8, color: '#f87171', fontSize: 12 }}>
                {addError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="submit"
                disabled={addTargetMutation.isPending}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(167,139,250,0.15)',
                  border: '1px solid rgba(167,139,250,0.35)',
                  color: '#a78bfa',
                  cursor: addTargetMutation.isPending ? 'default' : 'pointer',
                  opacity: addTargetMutation.isPending ? 0.7 : 1,
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                {addTargetMutation.isPending ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={addTargetMutation.isPending}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#94a3b8',
                  cursor: addTargetMutation.isPending ? 'default' : 'pointer',
                  opacity: addTargetMutation.isPending ? 0.7 : 1,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {discoverError && (
          <div style={{ marginTop: 12, color: '#f87171', fontSize: 12 }}>
            {discoverError}
          </div>
        )}

        {discoverSuggestions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Suggestions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {discoverSuggestions.map((s) => (
                <div
                  key={`${s.company}-${s.hr_email || 'unknown'}`}
                  style={{
                    background: '#0f1117',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#f1f5f9', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.company}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
                    {s.industry || 'Industry not specified'}
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 8 }}>
                    {s.reason}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11, marginBottom: 10 }}>
                    {s.hr_email ? `HR: ${s.hr_email}` : 'HR email: (unknown)'}
                  </div>
                  <button
                    onClick={() => handleAddSuggestion(s)}
                    disabled={addTargetMutation.isPending}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(167,139,250,0.15)',
                      border: '1px solid rgba(167,139,250,0.35)',
                      color: '#a78bfa',
                      cursor: addTargetMutation.isPending ? 'default' : 'pointer',
                      opacity: addTargetMutation.isPending ? 0.7 : 1,
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px 0',
          flexShrink: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {STAT_CARDS.map(({ key, label, color }) => (
          <div
            key={key}
            style={{
              flex: '0 0 auto',
              background: '#0f1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '8px 14px',
              minWidth: 70,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color,
              }}
            >
              {stats?.byStatus?.[key] ?? 0}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + Batch Generate */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {FILTERS.map((filter) => {
            const isActive = filter === statusFilter
            return (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                  color: isActive ? ACCENT : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  textTransform: 'capitalize',
                }}
              >
                {filter}
              </button>
            )
          })}
        </div>
        <button
          onClick={handleBatchGenerate}
          disabled={isBatchPending}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(167,139,250,0.12)',
            border: '1px solid rgba(167,139,250,0.25)',
            color: ACCENT,
            cursor: isBatchPending ? 'default' : 'pointer',
            opacity: isBatchPending ? 0.6 : 1,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          Batch Generate 5
        </button>
      </div>

      {/* Batch task poller */}
      {batchTaskId && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <TaskPoller
            taskId={batchTaskId}
            onDone={() => setBatchTaskId(null)}
            onError={() => setBatchTaskId(null)}
          />
        </div>
      )}

      {/* Targets list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
            Loading targets...
          </div>
        )}
        {isError && (
          <div style={{ textAlign: 'center', padding: 32, color: '#f87171' }}>
            Failed to load targets
          </div>
        )}
        {!isLoading && !isError && targets.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#4b5563' }}>
            No targets for this status
          </div>
        )}
        {!isLoading && !isError && targets.map((target) => (
          <TargetCard
            key={target.id}
            target={target}
            onOpen={() => setSelectedTarget(target)}
          />
        ))}
      </div>

      {selectedTarget && (
        <TargetSheet
          target={selectedTarget}
          onClose={() => setSelectedTarget(null)}
        />
      )}
    </div>
  )
}
