import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Application {
  id: number
  position: string
  company: string
  status: string
  pipeline_status: string
  location: string | null
  last_update: string | null
  outcome: string | null
  url: string | null
  application_folder: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'new',       label: 'DRAFT',     color: '#64748b' },
  { key: 'applied',   label: 'APPLIED',   color: '#3b82f6' },
  { key: 'interview', label: 'INTERVIEW', color: '#f59e0b' },
  { key: 'offer',     label: 'OFFER',     color: '#22c55e' },
  { key: 'rejected',  label: 'REJECTED',  color: '#f87171' },
]

function getStatus(a: Application): string {
  return (a.status || a.pipeline_status || 'new').toLowerCase()
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const APP_PAGE_SIZE = 50

function useApplications(limit: number) {
  return useQuery({
    queryKey: ['applications', limit],
    queryFn: () => api.get<Application[]>(`/api/applications?limit=${limit}`),
    staleTime: 30_000,
  })
}

// ─── Card ────────────────────────────────────────────────────────────────────

function AppCard({ app, isSelected, onClick }: { app: Application; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#0f1117',
        border: `1px solid ${isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
        transition: 'border-color 0.1s',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#93c5fd' : '#e2e8f0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {app.position || app.company || 'Untitled'}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {app.company}{app.location ? ` · ${app.location}` : ''}
      </div>
      {app.last_update && (
        <div style={{ fontSize: 10, color: '#374151', marginTop: 6 }}>{app.last_update}</div>
      )}
    </div>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ app, onSaved }: { app: Application; onSaved: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState(getStatus(app))
  const [outcome, setOutcome] = useState(app.outcome ?? '')

  const save = useMutation({
    mutationFn: () => api.patch(`/api/applications/${app.id}`, { pipeline_status: status, outcome }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      onSaved()
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{app.position || app.company}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
          {app.company} · <span style={{ textTransform: 'capitalize' }}>{status}</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: 1, marginBottom: 6 }}>STATUS</div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{
            width: '100%', height: 36, background: '#151b2b',
            border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0',
            borderRadius: 8, padding: '0 12px', fontSize: 12,
          }}
        >
          {COLUMNS.map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: 1, marginBottom: 6 }}>OUTCOME / NOTES</div>
        <textarea
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          rows={4}
          style={{
            width: '100%', background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0',
            borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.5,
            outline: 'none', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block', textAlign: 'center', padding: '9px 0',
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 10, color: '#93c5fd', fontSize: 13, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open posting ↗
          </a>
        )}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{
            height: 36, background: '#2563eb', border: 'none',
            borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: save.isPending ? 'not-allowed' : 'pointer',
            opacity: save.isPending ? 0.6 : 1,
          }}
        >
          {save.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AppsPage() {
  const [appLimit, setAppLimit] = useState(APP_PAGE_SIZE)
  const { data: apps = [], isLoading } = useApplications(appLimit)
  const hasMoreApps = apps.length === appLimit && appLimit < 500
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const grouped = Object.fromEntries(COLUMNS.map(c => [c.key, [] as Application[]]))
  apps.forEach(a => {
    const s = getStatus(a)
    ;(grouped[s] ?? grouped['new']).push(a)
  })

  const selected = apps.find(a => a.id === selectedId) ?? null

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

      {/* Kanban board */}
      <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden' }}>
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13 }}>
            Loading…
          </div>
        ) : COLUMNS.map(col => (
          <div
            key={col.key}
            style={{
              flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column',
              borderRight: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden',
            }}
          >
            {/* Column header */}
            <div style={{ padding: '14px 14px 8px', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: col.color, letterSpacing: 0.5 }}>
                {col.label}
              </span>
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 10,
                background: `${col.color}20`, color: col.color,
              }}>
                {grouped[col.key].length}
              </span>
            </div>
            {/* Cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px' }}>
              {(grouped[col.key] ?? []).map(a => (
                <AppCard
                  key={a.id}
                  app={a}
                  isSelected={a.id === selectedId}
                  onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
                />
              ))}
              {grouped[col.key].length === 0 && (
                <div style={{ fontSize: 11, color: '#374151', padding: '4px 4px', textAlign: 'center' }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Load more bar */}
      {!isLoading && hasMoreApps && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: selected ? 300 : 0, padding: '8px 16px', background: 'rgba(8,10,16,0.9)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setAppLimit(l => Math.min(l + APP_PAGE_SIZE, 500))}
            style={{
              padding: '6px 24px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div style={{
          width: 300, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: 1 }}>INTELLIGENCE</span>
            <button
              onClick={() => setSelectedId(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <DetailPanel app={selected} onSaved={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
