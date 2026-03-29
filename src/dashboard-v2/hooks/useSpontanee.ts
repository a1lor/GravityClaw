import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface Target {
  id: number
  company: string
  title: string
  email: string
  status: string
  notes: string
  email_subject: string
  sent_letter: string
  created_at: string
}

export interface DiscoverTargetSuggestion {
  company: string
  hr_email: string
  industry: string
  reason: string
}

export interface SpontaneeStats {
  byStatus: Record<string, number>
  sent: number
  replied: number
  sentToday: number
}

export function useTargets(status: string) {
  const q = useQuery({
    queryKey: ['spontanee', 'targets', status],
    queryFn: () =>
      api
        .get<any[]>(`/api/spontanee/targets?status=${encodeURIComponent(status)}&limit=200`)
        .then((rows) =>
          (rows ?? []).map((r) => ({
            ...r,
            email: String(r.email ?? r.hr_email ?? ''),
            title: String(r.title ?? r.industry ?? r.hr_name ?? ''),
            notes: String(r.notes ?? ''),
            email_subject: String(r.email_subject ?? ''),
            sent_letter: String(r.sent_letter ?? ''),
          })),
        ) as Promise<Target[]>,
    staleTime: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, refetch: q.refetch }
}

export function useSpontaneeStats() {
  const q = useQuery({
    queryKey: queryKeys.spontanee,
    queryFn: () => api.get<SpontaneeStats>('/api/spontanee/stats'),
    staleTime: 30_000,
  })
  return { data: q.data ?? null, isLoading: q.isLoading, isError: q.isError }
}

export function useMoveTarget() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { id: number; status?: string; notes?: string }) =>
      api.patch<Target>(`/api/spontanee/targets/${vars.id}`, {
        ...(vars.status !== undefined ? { status: vars.status } : {}),
        ...(vars.notes !== undefined ? { notes: vars.notes } : {}),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['spontanee', 'targets'] })
      return { vars }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['spontanee', 'targets'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.spontanee })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function useGenerateTarget() {
  const mutation = useMutation({
    mutationFn: (id: number) =>
      api.post<{ taskId: string }>(`/api/spontanee/targets/${id}/generate`, {}),
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function useBatchGenerate() {
  const mutation = useMutation({
    mutationFn: (limit: number) =>
      api.post<{ taskId: string }>('/api/spontanee/batch/start', { limit }),
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function useDiscoverTargets() {
  const mutation = useMutation({
    mutationFn: (vars: { count?: number; industry?: string }) =>
      api.post<DiscoverTargetSuggestion[]>('/api/spontanee/discover', vars),
  })

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  }
}


export function useSendOutreach() {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) =>
      api.post<{ taskId: string }>(`/api/spontanee/targets/${id}/send`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['targets'] }),
  })
  return {
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}
