import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface Memory {
  id: number
  content: string
  category: string
  tags: string
  is_archived: boolean
  created_at: string
}

export function useMemories() {
  const query = useQuery({
    queryKey: queryKeys.memories,
    queryFn: () => api.get<Memory[]>('/api/memories?limit=200'),
    staleTime: 60_000,
  })
  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSearchMemories(q: string) {
  const query = useQuery({
    queryKey: ['memories', 'search', q],
    queryFn: () => api.get<Memory[]>(`/api/memories/search?q=${encodeURIComponent(q)}&limit=20`),
    enabled: q.length >= 2,
  })
  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateMemory() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { content: string; tags?: string; category?: string }) =>
      api.post<Memory>('/api/memories', vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memories })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function usePatchMemory() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { id: number; content?: string; tags?: string; category?: string }) => {
      const { id, ...body } = vars
      return api.patch<Memory>(`/api/memories/${id}`, body)
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.memories })
      const previousMemories = queryClient.getQueryData<Memory[]>(queryKeys.memories)
      queryClient.setQueryData<Memory[]>(queryKeys.memories, (old) =>
        (old ?? []).map((m) =>
          m.id === vars.id ? { ...m, ...vars } : m
        )
      )
      return { previousMemories }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousMemories !== undefined) {
        queryClient.setQueryData(queryKeys.memories, context.previousMemories)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memories })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function useDeleteMemory() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) =>
      api.del<{ ok: boolean }>(`/api/memories/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.memories })
      const previousMemories = queryClient.getQueryData<Memory[]>(queryKeys.memories)
      queryClient.setQueryData<Memory[]>(queryKeys.memories, (old) =>
        (old ?? []).filter((m) => m.id !== id)
      )
      return { previousMemories }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousMemories !== undefined) {
        queryClient.setQueryData(queryKeys.memories, context.previousMemories)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memories })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}
