import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockTargets = [
  {
    id: 1, company: 'Acme', title: 'Engineer', email: 'hr@acme.com',
    status: 'pending', notes: '', email_subject: '', sent_letter: '',
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 2, company: 'BigCorp', title: 'Dev', email: 'jobs@bigcorp.com',
    status: 'draft', notes: '', email_subject: '', sent_letter: '',
    created_at: '2026-03-05T00:00:00Z',
  },
]

const mockStats = {
  byStatus: { pending: 1, draft: 1, sent: 0, replied: 0 },
  sent: 0, replied: 0, sentToday: 0,
}

vi.mock('@/hooks/useSpontanee', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSpontanee')>()
  return {
    ...actual,
    useTargets: vi.fn(() => ({ data: mockTargets, isLoading: false, isError: false, refetch: vi.fn() })),
    useSpontaneeStats: vi.fn(() => ({ data: mockStats, isLoading: false, isError: false })),
    useBatchGenerate: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ taskId: 'task-batch' }),
      isPending: false,
    })),
    useMoveTarget: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    })),
    useGenerateTarget: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ taskId: 'task-gen' }),
      isPending: false,
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

describe('OutreachTab', () => {
  it('renders stats cards', async () => {
    const { OutreachTab } = await import('./OutreachTab')
    wrap(<OutreachTab />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('Replied')).toBeInTheDocument()
  })

  it('renders target list', async () => {
    const { OutreachTab } = await import('./OutreachTab')
    wrap(<OutreachTab />)
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('BigCorp')).toBeInTheDocument()
  })

  it('renders status filter tabs', async () => {
    const { OutreachTab } = await import('./OutreachTab')
    wrap(<OutreachTab />)
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^pending$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^draft$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sent$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^replied$/i })).toBeInTheDocument()
  })

  it('renders Batch Generate button', async () => {
    const { OutreachTab } = await import('./OutreachTab')
    wrap(<OutreachTab />)
    expect(screen.getByRole('button', { name: /batch generate/i })).toBeInTheDocument()
  })

  it('fires batch generate POST and shows TaskPoller', async () => {
    const { useBatchGenerate } = await import('@/hooks/useSpontanee')
    const mutateAsync = vi.fn().mockResolvedValue({ taskId: 'task-batch-123' })
    ;(useBatchGenerate as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
    })
    const { OutreachTab } = await import('./OutreachTab')
    wrap(<OutreachTab />)
    await userEvent.click(screen.getByRole('button', { name: /batch generate/i }))
    expect(mutateAsync).toHaveBeenCalledWith(5)
    expect(await screen.findByTestId('task-poller')).toBeInTheDocument()
  })
})
