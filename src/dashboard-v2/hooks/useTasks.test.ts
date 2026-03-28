import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/lib/api'

describe('useTask', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('does not fetch when taskId is null', async () => {
    const { useTask } = await import('./useTasks')
    const { result } = renderHook(() => useTask(null), { wrapper })
    expect(result.current.isLoading).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('fetches task when taskId is provided', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'running',
      lastMessage: 'Processing...',
    })
    const { useTask } = await import('./useTasks')
    const { result } = renderHook(() => useTask('task-123'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.get).toHaveBeenCalledWith('/api/tasks/task-123')
    expect(result.current.data?.status).toBe('running')
  })

  it('stops polling on terminal status done', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'done',
      result: {},
    })
    const { useTask } = await import('./useTasks')
    const { result } = renderHook(() => useTask('task-done'), { wrapper })
    await waitFor(() => expect(result.current.data?.status).toBe('done'))
    // After resolving to done, refetchInterval should return false
    expect(result.current.data?.status).toBe('done')
  })

  it('stops polling on terminal status error', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'error',
      lastMessage: 'Something went wrong',
    })
    const { useTask } = await import('./useTasks')
    const { result } = renderHook(() => useTask('task-err'), { wrapper })
    await waitFor(() => expect(result.current.data?.status).toBe('error'))
    expect(result.current.data?.lastMessage).toBe('Something went wrong')
  })
})
