import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const mockJobs = [
  {
    id: 'job:1', source: 'email', title: 'Data Scientist', company: 'Acme',
    location: 'Paris', url: 'https://example.com', found_at: '2026-03-01', applied_at: null,
    pipeline_status: 'applied', job_type: 'alternance', outcome: '', followup_at: null,
    job_score: 80, job_score_reason: 'Good match',
  },
  {
    id: 'job:2', source: 'wttj', title: 'ML Engineer', company: 'BigCorp',
    location: 'Lyon', url: '', found_at: '2026-03-10', applied_at: null,
    pipeline_status: 'new', job_type: 'cdi', outcome: '', followup_at: null,
    job_score: null, job_score_reason: '',
  },
]

describe('useJobs', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })
  afterEach(() => {
    queryClient.clear()
    vi.restoreAllMocks()
  })

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('returns jobs array on success', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs)
    const { useJobs } = await import('./useJobs')
    const { result } = renderHook(() => useJobs(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data[0].company).toBe('Acme')
    expect(result.current.isError).toBe(false)
  })

  it('returns isError true when fetch fails', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('500'))
    const { useJobs } = await import('./useJobs')
    const { result } = renderHook(() => useJobs(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toEqual([])
  })
})

describe('useMoveJob', () => {
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

  it('calls api.patch with correct args', async () => {
    ;(api.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs)
    const { useMoveJob } = await import('./useJobs')
    const { result } = renderHook(() => useMoveJob(), { wrapper })
    act(() => {
      result.current.mutate({ id: 'job:1', newStatus: 'interview' })
    })
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/jobs/job%3A1', { pipeline_status: 'interview' })
    )
  })
})
