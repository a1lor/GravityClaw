import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface Application {
  id: string
  company: string
  position: string
  status: string
  outcome: string
  url: string
  cover_letter_path: string | null
}

export function useApplications() {
  const q = useQuery({
    queryKey: queryKeys.applications,
    queryFn: () => api.get<Application[]>('/api/applications?limit=200'),
    staleTime: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, refetch: q.refetch }
}
