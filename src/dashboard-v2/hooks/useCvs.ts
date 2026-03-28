import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface CV {
  id: number
  job_type: string
  language: string
  file_name: string
  updated_at: string
}

export function useCvs() {
  return useQuery({
    queryKey: queryKeys.cvs,
    queryFn: () => api.get<CV[]>('/api/cvs'),
    staleTime: 60_000,
  })
}

export function useDeleteCv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<{ ok: boolean }>(`/api/cvs/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.cvs })
      const previousCvs = qc.getQueryData<CV[]>(queryKeys.cvs)
      qc.setQueryData<CV[]>(queryKeys.cvs, (old) => (old ?? []).filter((cv) => cv.id !== id))
      return { previousCvs }
    },
    onError: (_err, _id, context) => {
      if (context?.previousCvs !== undefined) {
        qc.setQueryData(queryKeys.cvs, context.previousCvs)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cvs })
    },
  })
}
