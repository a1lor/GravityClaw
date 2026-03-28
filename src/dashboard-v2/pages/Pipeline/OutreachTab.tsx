import { useState } from 'react'
import {
  useTargets,
  useSpontaneeStats,
  useBatchGenerate,
} from '@/hooks/useSpontanee'
import { TaskPoller } from '@/components/TaskPoller'
import { TargetCard } from './TargetCard'
import { TargetSheet } from './TargetSheet'
import type { Target } from '@/hooks/useSpontanee'

type StatusFilter = 'all' | 'pending' | 'draft' | 'sent' | 'replied'

const FILTERS: StatusFilter[] = ['all', 'pending', 'draft', 'sent', 'replied']

const STAT_CARDS = [
  { key: 'pending', label: 'Pending', color: '#94a3b8' },
  { key: 'draft', label: 'Draft', color: '#F59E0B' },
  { key: 'sent', label: 'Sent', color: '#38bdf8' },
  { key: 'replied', label: 'Replied', color: '#4ade80' },
]

export function OutreachTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null)

  const { data: targets, isLoading, isError } = useTargets(statusFilter)
  const { data: stats } = useSpontaneeStats()
  const { mutateAsync: batchGenerate, isPending: isBatchPending } = useBatchGenerate()

  async function handleBatchGenerate() {
    try {
      const res = await batchGenerate(5)
      if (res.taskId) setBatchTaskId(res.taskId)
    } catch {
      // handled by hook
    }
  }

  const ACCENT = '#a78bfa'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
