import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockLastStudio = {
  job: { title: 'ML Engineer', company: 'Acme AI' },
  files: [
    { kind: 'cover_letter', name: 'cover_letter_acme.pdf' },
  ],
  updated_at: '2026-03-01T10:00:00Z',
}

vi.mock('@/hooks/useStudio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useStudio')>()
  return {
    ...actual,
    useLastStudio: vi.fn(() => ({ data: mockLastStudio, isLoading: false, isError: false })),
    useGenerateCoverLetter: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ taskId: 'task-studio' }),
      isPending: false,
      isError: false,
      error: null,
    })),
  }
})

vi.mock('@/components/TaskPoller', () => ({
  TaskPoller: ({ taskId }: { taskId: string | null }) =>
    taskId ? <div data-testid="task-poller">{taskId}</div> : null,
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('StudioTab', () => {
  it('renders the Generate Cover Letter section', async () => {
    const { StudioTab } = await import('./StudioTab')
    wrap(<StudioTab />)
    expect(screen.getByText(/generate cover letter/i)).toBeInTheDocument()
  })

  it('renders URL input and Generate from URL button', async () => {
    const { StudioTab } = await import('./StudioTab')
    wrap(<StudioTab />)
    expect(screen.getByPlaceholderText(/https:\/\//i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate from url/i })).toBeInTheDocument()
  })

  it('renders last output section with job info', async () => {
    const { StudioTab } = await import('./StudioTab')
    wrap(<StudioTab />)
    expect(screen.getByText('Last Output')).toBeInTheDocument()
    expect(screen.getByText(/ML Engineer/i)).toBeInTheDocument()
    expect(screen.getByText(/Acme AI/i)).toBeInTheDocument()
  })

  it('renders file list with download links', async () => {
    const { StudioTab } = await import('./StudioTab')
    wrap(<StudioTab />)
    expect(screen.getByText('cover_letter_acme.pdf')).toBeInTheDocument()
    const downloadLink = screen.getByRole('link', { name: /download/i })
    expect(downloadLink).toHaveAttribute('href', expect.stringContaining('cover_letter_acme.pdf'))
  })

  it('shows empty state when no last output', async () => {
    const { useLastStudio } = await import('@/hooks/useStudio')
    ;(useLastStudio as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: null, isLoading: false, isError: false,
    })
    const { StudioTab } = await import('./StudioTab')
    wrap(<StudioTab />)
    expect(screen.getByText(/no cover letters generated yet/i)).toBeInTheDocument()
  })

  it('submits URL and shows TaskPoller', async () => {
    const { useGenerateCoverLetter } = await import('@/hooks/useStudio')
    const mutateAsync = vi.fn().mockResolvedValue({ taskId: 'task-studio-123' })
    ;(useGenerateCoverLetter as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    })
    const { StudioTab } = await import('./StudioTab')
    wrap(<StudioTab />)
    const urlInput = screen.getByPlaceholderText(/https:\/\//i)
    await userEvent.type(urlInput, 'https://example.com/job')
    await userEvent.click(screen.getByRole('button', { name: /generate from url/i }))
    expect(mutateAsync).toHaveBeenCalledWith({ url: 'https://example.com/job' })
    expect(await screen.findByTestId('task-poller')).toBeInTheDocument()
  })
})
