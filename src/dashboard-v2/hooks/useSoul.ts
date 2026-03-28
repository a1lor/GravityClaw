import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export function useSoul() {
  return useQuery({
    queryKey: queryKeys.soul,
    queryFn: () => api.get<{ content: string }>('/api/soul'),
    staleTime: 0,
  })
}

export function useSaveSoul() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => api.put<{ ok: boolean }>('/api/soul', { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.soul })
    },
  })
}
