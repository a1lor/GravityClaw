import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface CuratedModel {
  id: string
  label: string
}

export function useModels() {
  const query = useQuery({
    queryKey: queryKeys.models,
    queryFn: () => api.get<CuratedModel[]>('/api/models'),
    staleTime: 5 * 60_000,
  })
  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
