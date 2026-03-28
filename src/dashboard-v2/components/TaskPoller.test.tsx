import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/hooks/useTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useTasks')>()
  return {
    ...actual,
    useTask: vi.fn(),
  }
})

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { useTask } from '@/hooks/useTasks'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('TaskPoller', () => {
  it('renders nothing when taskId is null', async () => {
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null, isLoading: false,
    })
    const { TaskPoller } = await import('./TaskPoller')
    const { container } = wrap(<TaskPoller taskId={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders spinner and lastMessage while running', async () => {
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { status: 'running', lastMessage: 'Processing job...' },
      isLoading: false,
    })
    const { TaskPoller } = await import('./TaskPoller')
    wrap(<TaskPoller taskId="task-123" />)
    expect(screen.getByText('Processing job...')).toBeInTheDocument()
  })

  it('renders spinner while queued', async () => {
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { status: 'queued', lastMessage: 'Waiting in queue' },
      isLoading: false,
    })
    const { TaskPoller } = await import('./TaskPoller')
    wrap(<TaskPoller taskId="task-456" />)
    expect(screen.getByText('Waiting in queue')).toBeInTheDocument()
  })

  it('calls onDone when status becomes done', async () => {
    const onDone = vi.fn()
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { status: 'done', lastMessage: 'Finished!' },
      isLoading: false,
    })
    const { TaskPoller } = await import('./TaskPoller')
    wrap(<TaskPoller taskId="task-done" onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('calls onError when status becomes error', async () => {
    const onError = vi.fn()
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { status: 'error', lastMessage: 'Failed to process' },
      isLoading: false,
    })
    const { TaskPoller } = await import('./TaskPoller')
    wrap(<TaskPoller taskId="task-err" onError={onError} />)
    expect(onError).toHaveBeenCalledWith('Failed to process')
  })

  it('shows error message in red when error', async () => {
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { status: 'error', lastMessage: 'Task failed' },
      isLoading: false,
    })
    const { TaskPoller } = await import('./TaskPoller')
    wrap(<TaskPoller taskId="task-err2" />)
    const errorEl = screen.getByText('Task failed')
    expect(errorEl).toBeInTheDocument()
  })

  it('shows cancel button while running and calls cancel API on click', async () => {
    ;(useTask as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { status: 'running', lastMessage: 'Running...' },
      isLoading: false,
    })
    const { api } = await import('@/lib/api')
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({})
    const { TaskPoller } = await import('./TaskPoller')
    wrap(<TaskPoller taskId="task-cancel" />)
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    expect(cancelBtn).toBeInTheDocument()
    await userEvent.click(cancelBtn)
    expect(api.post).toHaveBeenCalledWith('/api/tasks/task-cancel/cancel', {})
  })
})
