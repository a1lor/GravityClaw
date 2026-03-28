import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface Dialogue {
  id: number
  title: string
  model: string
  created_at: string
  updated_at: string
}

export interface DialogueMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

function requestLong<T>(path: string, body: unknown): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90_000)
  const token = localStorage.getItem('gc_token') ?? ''
  const sep = path.includes('?') ? '&' : '?'
  return fetch(`${path}${token ? sep + 'token=' + token : ''}`, {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => {
    clearTimeout(timer)
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json() as Promise<T>
  })
}

export function useDialogues() {
  const query = useQuery({
    queryKey: queryKeys.dialogues,
    queryFn: () => api.get<Dialogue[]>('/api/dialogues'),
    staleTime: 30_000,
  })
  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useDialogueMessages(id: number | null) {
  const query = useQuery({
    queryKey: ['dialogues', id, 'messages'],
    queryFn: () => api.get<DialogueMessage[]>(`/api/dialogues/${id}/messages`),
    enabled: !!id,
  })
  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

export function useCreateDialogue() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { title: string; model: string }) =>
      api.post<Dialogue>('/api/dialogues', vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dialogues })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function usePatchDialogue() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { id: number; title?: string; model?: string }) => {
      const { id, ...body } = vars
      return api.patch<Dialogue>(`/api/dialogues/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dialogues })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function useDeleteDialogue() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => api.del<{ ok: boolean }>(`/api/dialogues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dialogues })
    },
  })
  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
  }
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (vars: { id: number; message: string }) =>
      requestLong<{ userMessage: DialogueMessage; assistantMessage: DialogueMessage }>(
        `/api/dialogues/${vars.id}/messages`,
        { message: vars.message }
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['dialogues', vars.id, 'messages'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.dialogues })
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  }
}
