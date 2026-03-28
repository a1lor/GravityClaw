import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockJobs = [
  {
    id: 'j1', source: 'email', title: 'Data Scientist', company: 'Acme',
    location: '', url: '', found_at: '2026-03-01', applied_at: null,
    pipeline_status: 'applied', job_type: 'alternance', outcome: '',
    followup_at: null, job_score: null, job_score_reason: '',
  },
  {
    id: 'j2', source: 'wttj', title: 'ML Engineer', company: 'BigCorp',
    location: '', url: '', found_at: '2026-03-10', applied_at: null,
    pipeline_status: 'new', job_type: 'cdi', outcome: '',
    followup_at: null, job_score: null, job_score_reason: '',
  },
]

vi.mock('@/hooks/useJobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useJobs')>()
  return {
    ...actual,
    useJobs: vi.fn(() => ({ data: mockJobs, isLoading: false, isError: false, refetch: vi.fn() })),
    useMoveJob: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

vi.mock('@/components/TaskPoller', () => ({
  TaskPoller: ({ taskId }: { taskId: string | null }) =>
    taskId ? <div data-testid="task-poller">{taskId}</div> : null,
}))

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('JobsTab', () => {
  it('renders job list with stage tabs', async () => {
    const { JobsTab } = await import('./JobsTab')
    wrap(<JobsTab />)
    // Stage tabs
    expect(screen.getByRole('button', { name: /applied/i })).toBeInTheDocument()
    // Applied jobs
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('shows Add Job button', async () => {
    const { JobsTab } = await import('./JobsTab')
    wrap(<JobsTab />)
    expect(screen.getByRole('button', { name: /add job/i })).toBeInTheDocument()
  })

  it('toggles URL input when Add Job button is clicked', async () => {
    const { JobsTab } = await import('./JobsTab')
    wrap(<JobsTab />)
    const addBtn = screen.getByRole('button', { name: /add job/i })
    expect(screen.queryByPlaceholderText(/https:\/\//i)).not.toBeInTheDocument()
    await userEvent.click(addBtn)
    expect(screen.getByPlaceholderText(/https:\/\//i)).toBeInTheDocument()
  })

  it('fires POST /api/jobs on URL submit', async () => {
    const { api } = await import('@/lib/api')
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ taskId: 'task-new' })

    const { JobsTab } = await import('./JobsTab')
    wrap(<JobsTab />)
    await userEvent.click(screen.getByRole('button', { name: /add job/i }))
    const input = screen.getByPlaceholderText(/https:\/\//i)
    await userEvent.type(input, 'https://example.com/job')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(api.post).toHaveBeenCalledWith('/api/jobs', { url: 'https://example.com/job' })
  })

  it('shows TaskPoller after successful submit', async () => {
    const { api } = await import('@/lib/api')
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ taskId: 'task-abc' })

    const { JobsTab } = await import('./JobsTab')
    wrap(<JobsTab />)
    await userEvent.click(screen.getByRole('button', { name: /add job/i }))
    const input = screen.getByPlaceholderText(/https:\/\//i)
    await userEvent.type(input, 'https://example.com/job')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByTestId('task-poller')).toBeInTheDocument()
  })
})
