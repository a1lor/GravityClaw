import { useQuery } from '@tanstack/react-query'
import { useJobs } from '@/hooks/useJobs'
import { useEmails } from '@/hooks/useEmails'
import { api } from '@/lib/api'

interface Memory {
  id: number
  content: string
  category: string
  tags?: string
}

export function useSearchAll(query: string) {
  const { data: jobs = [] } = useJobs()
  const { data: emails = [] } = useEmails()

  const memoriesQ = useQuery({
    queryKey: ['memories', 'search', query],
    queryFn: () =>
      api.get<Memory[]>(`/api/memories/search?q=${encodeURIComponent(query)}&limit=5`),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })

  const q = query.toLowerCase()
  const active = query.length >= 2

  return {
    jobs: active
      ? jobs
          .filter(
            (j) =>
              j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
          )
          .slice(0, 5)
      : [],
    emails: active
      ? emails
          .filter(
            (e) =>
              e.subject.toLowerCase().includes(q) ||
              e.from_addr.toLowerCase().includes(q)
          )
          .slice(0, 5)
      : [],
    memories: memoriesQ.data ?? [],
    isSearching: memoriesQ.isFetching,
  }
}
