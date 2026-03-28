import { useState } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface LogEntry {
  id: number
  level: 'log' | 'warn' | 'err'
  message: string
  created_at: string
}

type LevelFilter = '' | 'warn' | 'err'

interface LogsPanelProps {
  onBack: () => void
}

const LEVEL_COLORS: Record<string, string> = {
  log: '#94a3b8',
  warn: '#fbbf24',
  err: '#f87171',
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

export function LogsPanel({ onBack }: LogsPanelProps) {
  const [level, setLevel] = useState<LevelFilter>('')

  const { data: logs = [], isFetching, refetch } = useQuery({
    queryKey: ['logs', level],
    queryFn: () =>
      api.get<LogEntry[]>(`/api/logs?limit=100${level ? '&level=' + level : ''}`),
    staleTime: 15_000,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#94a3b8',
            fontSize: 13,
            padding: '2px 4px',
          }}
        >
          <ChevronLeft size={16} aria-hidden />
          Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: 1 }}>Logs</span>
        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['', 'warn', 'err'] as LevelFilter[]).map((l) => (
            <button
              key={l || 'all'}
              onClick={() => setLevel(l)}
              aria-pressed={level === l}
              style={{
                background: level === l ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                color: l === 'warn' ? '#fbbf24' : l === 'err' ? '#f87171' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: level === l ? 700 : 400,
              }}
            >
              {l === '' ? 'All' : l === 'warn' ? 'Warn' : 'Err'}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          aria-label="Refresh"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#4b5563',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RefreshCw size={14} aria-hidden style={{ opacity: isFetching ? 0.5 : 1 }} />
        </button>
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
        {logs.length === 0 && !isFetching && (
          <div style={{ padding: 16, color: '#4b5563', fontSize: 12 }}>No logs.</div>
        )}
        {logs.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '5px 16px',
              fontSize: 12,
              fontFamily: 'monospace',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ color: '#4b5563', minWidth: 60, flexShrink: 0 }}>
              {formatTime(entry.created_at)}
            </span>
            <span
              style={{
                color: LEVEL_COLORS[entry.level] ?? '#94a3b8',
                minWidth: 28,
                flexShrink: 0,
                fontWeight: 700,
                fontSize: 10,
                textTransform: 'uppercase',
              }}
            >
              {entry.level}
            </span>
            <span style={{ color: '#94a3b8', wordBreak: 'break-all' }}>
              {entry.message.length > 80 ? entry.message.slice(0, 80) + '…' : entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
