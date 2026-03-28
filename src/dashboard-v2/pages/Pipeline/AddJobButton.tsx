import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

interface TaskStatus {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  lastMessage?: string
  error?: string
}

export function AddJobButton() {
  const [url, setUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!taskId) return

    let timer: number
    const poll = async () => {
      try {
        const t = await api.get<TaskStatus>(`/api/tasks/${taskId}`)
        setStatus(t)
        if (t.status === 'done' || t.status === 'error' || t.status === 'cancelled') {
          setTaskId(null)
          if (t.status === 'done') {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
            setTimeout(() => {
              setStatus(null)
              setUrl('')
              setIsAdding(false)
            }, 3000)
          }
        } else {
          timer = window.setTimeout(poll, 1500)
        }
      } catch {
        setTaskId(null)
        setIsAdding(false)
      }
    }

    poll()
    return () => clearTimeout(timer)
  }, [taskId, queryClient])

  async function handleAdd() {
    if (!url.trim() || isAdding) return
    setIsAdding(true)
    setStatus(null)
    try {
      const res = await api.post<{ taskId: string | null; jobId?: string; message?: string }>('/api/jobs', { url })
      if (res.taskId) {
        setTaskId(res.taskId)
      } else {
        setIsAdding(false)
        if (res.message) {
          alert(res.message)
        }
      }
    } catch (err: any) {
      setIsAdding(false)
      alert(err.message || 'Failed to add job')
    }
  }

  if (isAdding) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(255,255,255,0.05)', padding: '6px 12px',
        borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          width: 14, height: 14, border: '2px solid #a78bfa',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          {status?.lastMessage || 'Starting…'}
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="text"
        placeholder="Paste job URL…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        style={{
          background: '#080a10', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#f1f5f9',
          width: 180, outline: 'none',
        }}
      />
      <button
        onClick={handleAdd}
        disabled={!url.trim()}
        style={{
          background: '#a78bfa', color: '#000', border: 'none',
          borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600,
          cursor: url.trim() ? 'pointer' : 'default', opacity: url.trim() ? 1 : 0.5,
        }}
      >
        Add
      </button>
    </div>
  )
}
