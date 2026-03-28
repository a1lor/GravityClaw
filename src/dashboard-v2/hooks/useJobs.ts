import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { PipelineStatus } from '@/lib/pipeline-status'

export interface Job {
  id: string
  source: string
  title: string
  company: string
  location: string
  url: string           // empty string means no URL
  found_at: string | null
  applied_at: string | null
  pipeline_status: PipelineStatus
  job_type: string
  outcome: string
  followup_at: string | null
  job_score: number | null
  job_score_reason: string  // not rendered in UI
}

export function useJobs(limit = 50) {
  const query = useQuery({
    queryKey: [...queryKeys.jobs, limit],
    queryFn: () => api.get<Job[]>(`/api/jobs?limit=${limit}`),
    staleTime: 30_000,
  })
  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useMoveJob() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { id: string; newStatus: PipelineStatus }) =>
      api.patch<{ ok: boolean }>(
        `/api/jobs/${encodeURIComponent(vars.id)}`,
        { pipeline_status: vars.newStatus }
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.jobs })
      const previousJobs = queryClient.getQueryData<Job[]>(queryKeys.jobs)
      queryClient.setQueryData<Job[]>(queryKeys.jobs, (old) =>
        (old ?? []).map((j) =>
          j.id === vars.id ? { ...j, pipeline_status: vars.newStatus } : j
        )
      )
      return { previousJobs }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousJobs !== undefined) {
        queryClient.setQueryData(queryKeys.jobs, context.previousJobs)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
    },
  })
  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
  }
}

export function useDeleteJob() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: boolean }>(`/api/jobs/${encodeURIComponent(id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
    },
  })
  return { mutate: mutation.mutate, isPending: mutation.isPending }
}

export function useEditJob() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { id: string; title?: string; company?: string }) =>
      api.patch<{ ok: boolean }>(
        `/api/jobs/${encodeURIComponent(vars.id)}`,
        { title: vars.title, company: vars.company }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs })
    },
  })
  return { mutate: mutation.mutate, isPending: mutation.isPending }
}
