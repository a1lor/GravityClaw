import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface LogEntry {
  id: number
  level: 'log' | 'warn' | 'err'
  message: string
  created_at: string
}

const LEVEL_STYLES: Record<LogEntry['level'], { color: string; label: string }> = {
  log:  { color: '#94a3b8', label: 'LOG'  },
  warn: { color: '#fbbf24', label: 'WARN' },
  err:  { color: '#f87171', label: 'ERR'  },
}

function useLogs(level: string) {
  return useQuery({
    queryKey: ['logs', level],
    queryFn: () => api.get<LogEntry[]>(`/api/logs?limit=100${level ? `&level=${level}` : ''}`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

function formatTime(raw: string): string {
  return new Date(raw).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function LogsTab() {
  const [level, setLevel] = useState('')
  const { data, isLoading, isError, refetch } = useLogs(level)
  const logs = data ?? []

  const filters: { value: string; label: string; color: string }[] = [
    { value: '',     label: 'All',  color: '#94a3b8' },
    { value: 'warn', label: 'Warn', color: '#fbbf24' },
    { value: 'err',  label: 'Err',  color: '#f87171' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: '#4b5563', marginRight: 4 }}>Filter:</span>
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setLevel(f.value)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              border: level === f.value ? `1px solid ${f.color}60` : '1px solid rgba(255,255,255,0.08)',
              background: level === f.value ? `${f.color}15` : 'transparent',
              color: level === f.value ? f.color : '#64748b',
            }}
          >
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => refetch()} style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12,
          background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', cursor: 'pointer',
        }}>
          Refresh
        </button>
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace' }}>
        {isLoading && (
          <div style={{ padding: 32, textAlign: 'center', color: '#4b5563' }}>Loading…</div>
        )}
        {isError && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ color: '#f87171', marginBottom: 12 }}>Failed to load logs</div>
            <button onClick={() => refetch()} style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.08)',
              border: 'none', borderRadius: 8, color: '#94a3b8', cursor: 'pointer',
            }}>Retry</button>
          </div>
        )}
        {!isLoading && !isError && logs.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontFamily: 'sans-serif' }}>
            No logs
          </div>
        )}
        {!isLoading && !isError && logs.map(log => {
          const { color, label } = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.log
          return (
            <div key={log.id} style={{
              display: 'flex', gap: 10, padding: '6px 16px', fontSize: 12,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              alignItems: 'flex-start',
            }}>
              <span style={{ color: '#4b5563', flexShrink: 0, minWidth: 72 }}>
                {formatTime(log.created_at)}
              </span>
              <span style={{ color, flexShrink: 0, fontWeight: 700, minWidth: 32 }}>{label}</span>
              <span style={{ color: '#94a3b8', wordBreak: 'break-word', flex: 1 }}>
                {log.message}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
