import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface Email {
  id: number
  from_addr: string
  subject: string
  snippet: string
  status: 'positive' | 'negative' | 'neutral'
  email_date: string | null
  created_at: string
  action_needed: number
  stage: string | null
}

export function useEmails() {
  const q = useQuery({
    queryKey: queryKeys.emails,
    queryFn: () => api.get<Email[]>('/api/emails?limit=100'),
    staleTime: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}
