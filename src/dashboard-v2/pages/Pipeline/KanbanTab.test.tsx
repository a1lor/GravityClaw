import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockApplications = [
  { id: 'a1', company: 'Acme', position: 'Engineer', status: 'applied', outcome: '', url: '', cover_letter_path: null },
  { id: 'a2', company: 'BigCorp', position: 'Dev', status: 'applied', outcome: '', url: 'https://bigcorp.com', cover_letter_path: null },
  { id: 'a3', company: 'Labs', position: 'Researcher', status: 'interview', outcome: '', url: '', cover_letter_path: null },
]

vi.mock('@/hooks/useApplications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useApplications')>()
  return {
    ...actual,
    useApplications: vi.fn(() => ({ data: mockApplications, isLoading: false, isError: false, refetch: vi.fn() })),
  }
})

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('KanbanTab', () => {
  it('renders columns grouped by status', async () => {
    const { KanbanTab } = await import('./KanbanTab')
    wrap(<KanbanTab />)
    // Should have columns for applied and interview statuses
    expect(screen.getByText('applied')).toBeInTheDocument()
    expect(screen.getByText('interview')).toBeInTheDocument()
  })

  it('groups applications correctly by status', async () => {
    const { KanbanTab } = await import('./KanbanTab')
    wrap(<KanbanTab />)
    // applied column has 2 applications, interview has 1
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('BigCorp')).toBeInTheDocument()
    expect(screen.getByText('Labs')).toBeInTheDocument()
  })

  it('shows correct count badges per column', async () => {
    const { KanbanTab } = await import('./KanbanTab')
    wrap(<KanbanTab />)
    // applied: 2, interview: 1
    const badges = screen.getAllByText('2')
    expect(badges.length).toBeGreaterThanOrEqual(1)
    const badge1 = screen.getByText('1')
    expect(badge1).toBeInTheDocument()
  })

  it('shows loading state', async () => {
    const { useApplications } = await import('@/hooks/useApplications')
    ;(useApplications as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: [], isLoading: true, isError: false, refetch: vi.fn(),
    })
    const { KanbanTab } = await import('./KanbanTab')
    wrap(<KanbanTab />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no applications', async () => {
    const { useApplications } = await import('@/hooks/useApplications')
    ;(useApplications as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: [], isLoading: false, isError: false, refetch: vi.fn(),
    })
    const { KanbanTab } = await import('./KanbanTab')
    wrap(<KanbanTab />)
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument()
  })
})
