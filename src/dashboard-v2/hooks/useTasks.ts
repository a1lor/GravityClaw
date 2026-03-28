import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface TaskResult {
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  lastMessage?: string
  result?: unknown
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => api.get<TaskResult>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
    staleTime: 0,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      if (!s || s === 'done' || s === 'error' || s === 'cancelled') return false
      return 2000
    },
  })
}
