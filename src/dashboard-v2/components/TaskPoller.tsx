import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTask } from '@/hooks/useTasks'
import { api } from '@/lib/api'

interface TaskPollerProps {
  taskId: string | null
  onDone?: () => void
  onError?: (msg: string) => void
}

export function TaskPoller({ taskId, onDone, onError }: TaskPollerProps) {
  const { data } = useTask(taskId)

  useEffect(() => {
    if (!data) return
    if (data.status === 'done') {
      onDone?.()
    } else if (data.status === 'error') {
      onError?.(data.lastMessage ?? 'An error occurred')
    }
  }, [data?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!taskId) return null

  const isTerminal = data?.status === 'done' || data?.status === 'cancelled'
  if (isTerminal) return null

  const isError = data?.status === 'error'
  const isActive = !data || data.status === 'queued' || data.status === 'running'

  function handleCancel() {
    if (taskId) {
      api.post(`/api/tasks/${taskId}/cancel`, {})
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 20,
        background: isError ? 'rgba(248,113,113,0.12)' : 'rgba(167,139,250,0.12)',
        border: `1px solid ${isError ? 'rgba(248,113,113,0.3)' : 'rgba(167,139,250,0.3)'}`,
        fontSize: 13,
        color: isError ? '#f87171' : '#a78bfa',
      }}
    >
      {isActive && (
        <Loader2
          size={14}
          style={{
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
      <span>{data?.lastMessage ?? (isActive ? 'Processing...' : '')}</span>
      {isActive && (
        <button
          onClick={handleCancel}
          aria-label="Cancel"
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 12,
            padding: '0 4px',
            opacity: 0.7,
          }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}
