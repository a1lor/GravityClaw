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
  {
    id: 'j3', source: 'email', title: 'AI Researcher', company: 'LabCo',
    location: '', url: '', found_at: '2026-03-12', applied_at: null,
    pipeline_status: 'new', job_type: 'cdi', outcome: '',
    followup_at: null, job_score: null, job_score_reason: '',
  },
]

vi.mock('@/hooks/useJobs', () => ({
  useJobs: vi.fn(),
  useMoveJob: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { useJobs } from '@/hooks/useJobs'
import PipelinePage from './index'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PipelinePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PipelinePage', () => {
  it('renders stage tabs with correct count badges', () => {
    ;(useJobs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockJobs, isLoading: false, isError: false, refetch: vi.fn(),
    })
    renderPage()
    // Applied tab has 1 job, New tab has 2 jobs
    expect(screen.getByRole('button', { name: /applied.*1|1.*applied/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new.*2|2.*new/i })).toBeInTheDocument()
  })

  it('defaults to the "applied" tab and shows applied jobs', () => {
    ;(useJobs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockJobs, isLoading: false, isError: false, refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.queryByText('BigCorp')).not.toBeInTheDocument()
  })

  it('switches to "new" tab when clicked', async () => {
    ;(useJobs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockJobs, isLoading: false, isError: false, refetch: vi.fn(),
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^new/i }))
    expect(screen.getByText('BigCorp')).toBeInTheDocument()
    expect(screen.queryByText('Acme')).not.toBeInTheDocument()
  })

  it('shows skeleton rows while loading', () => {
    ;(useJobs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [], isLoading: true, isError: false, refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getAllByRole('status')).toHaveLength(3)
  })

  it('shows error message and retry button, and calls refetch on click', async () => {
    const refetch = vi.fn()
    ;(useJobs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [], isLoading: false, isError: true, refetch,
    })
    renderPage()
    expect(screen.getByText(/failed to load jobs/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
