import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface Kpis {
  messages: number
  memories: number
  jobsTracked: number
  pipeline: number
}

export function useKpis() {
  return useQuery({
    queryKey: queryKeys.kpis,
    queryFn: () => api.get<Kpis>('/api/kpis'),
    staleTime: 60_000,
  })
}
