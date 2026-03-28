import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface StudioFile {
  kind: string
  name: string
}

export interface StudioOutput {
  job: { title: string; company: string }
  files: StudioFile[]
  updated_at: string
}

export function useLastStudio() {
  const q = useQuery({
    queryKey: ['studio', 'last'],
    queryFn: () => api.get<StudioOutput>('/api/studio/last'),
    staleTime: 30_000,
  })
  return { data: q.data ?? null, isLoading: q.isLoading, isError: q.isError }
}

export function useGenerateCoverLetter() {
  const mutation = useMutation({
    mutationFn: (vars: { url?: string; text?: string }) =>
      api.post<{ taskId: string }>('/api/studio/coverletter', vars),
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  }
}
