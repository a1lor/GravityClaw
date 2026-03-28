import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JobCard } from './JobCard'
import type { Job } from '@/hooks/useJobs'

vi.mock('@/hooks/useJobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useJobs')>()
  return {
    ...actual,
    useMoveJob: () => ({
      mutate: vi.fn().mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void; onError?: () => void }) => {
        opts?.onSuccess?.()
      }),
      isPending: false,
    }),
  }
})

const mockJob: Job = {
  id: 'job:1', source: 'email', title: 'Data Scientist', company: 'Acme Corp',
  location: 'Paris', url: '', found_at: '2026-03-01', applied_at: null,
  pipeline_status: 'applied', job_type: 'alternance', outcome: '',
  followup_at: null, job_score: 75, job_score_reason: '',
}

function renderCard(job = mockJob) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <JobCard job={job} />
    </QueryClientProvider>
  )
}

describe('JobCard', () => {
  it('renders company and title', () => {
    renderCard()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Data Scientist')).toBeInTheDocument()
  })

  it('renders score badge when job_score is not null', () => {
    renderCard()
    expect(screen.getByText('75')).toBeInTheDocument()
  })

  it('does not render score badge when job_score is null', () => {
    renderCard({ ...mockJob, job_score: null })
    expect(screen.queryByText('75')).not.toBeInTheDocument()
  })

  it('shows ActionSheet when card is clicked', async () => {
    renderCard()
    await userEvent.click(screen.getByText('Acme Corp'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes ActionSheet when Close button is clicked', async () => {
    renderCard()
    await userEvent.click(screen.getByText('Acme Corp'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes ActionSheet after successful move', async () => {
    renderCard()
    await userEvent.click(screen.getByText('Acme Corp'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Click the Interview stage button (not the current stage 'applied')
    await userEvent.click(screen.getByRole('button', { name: /interview/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
