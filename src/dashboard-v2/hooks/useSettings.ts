import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.get<Record<string, unknown>>('/api/settings'),
    staleTime: 60_000,
  })
}

export function usePatchSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<{ ok: boolean; settings: Record<string, unknown> }>('/api/settings', body),
    onSuccess: (data) => {
      if (data.settings) qc.setQueryData(queryKeys.settings, data.settings)
    },
  })
}
