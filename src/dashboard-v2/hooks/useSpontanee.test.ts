import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const mockTargets = [
  {
    id: 1, company: 'Acme', title: 'Engineer', email: 'hr@acme.com',
    status: 'pending', notes: '', email_subject: '', sent_letter: '',
    created_at: '2026-03-01',
  },
  {
    id: 2, company: 'BigCorp', title: 'Developer', email: 'jobs@bigcorp.com',
    status: 'draft', notes: 'drafted', email_subject: 'Hi', sent_letter: 'Dear...',
    created_at: '2026-03-10',
  },
]

const mockStats = {
  byStatus: { pending: 5, draft: 2, sent: 10, replied: 3 },
  sent: 10,
  replied: 3,
  sentToday: 1,
}

describe('useTargets', () => {
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

  it('fetches targets by status', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTargets)
    const { useTargets } = await import('./useSpontanee')
    const { result } = renderHook(() => useTargets('all'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.get).toHaveBeenCalledWith('/api/spontanee/targets?status=all&limit=200')
    expect(result.current.data).toHaveLength(2)
  })

  it('returns empty array on error', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('500'))
    const { useTargets } = await import('./useSpontanee')
    const { result } = renderHook(() => useTargets('pending'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useSpontaneeStats', () => {
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

  it('fetches spontanee stats', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStats)
    const { useSpontaneeStats } = await import('./useSpontanee')
    const { result } = renderHook(() => useSpontaneeStats(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.get).toHaveBeenCalledWith('/api/spontanee/stats')
    expect(result.current.data?.sent).toBe(10)
  })
})

describe('useMoveTarget', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('patches target status and invalidates queries', async () => {
    ;(api.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTargets[0])
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockTargets)
    const { useMoveTarget } = await import('./useSpontanee')
    const { result } = renderHook(() => useMoveTarget(), { wrapper })
    act(() => {
      result.current.mutate({ id: 1, status: 'sent' })
    })
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/spontanee/targets/1', { status: 'sent' })
    )
  })
})
