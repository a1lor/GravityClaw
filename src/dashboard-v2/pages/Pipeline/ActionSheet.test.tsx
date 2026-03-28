import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ActionSheet } from './ActionSheet'
import type { Job } from '@/hooks/useJobs'

const mockJob: Job = {
  id: 'job:1', source: 'email', title: 'Data Scientist', company: 'Acme Corp',
  location: 'Paris', url: 'https://example.com', found_at: '2026-03-01',
  applied_at: null, pipeline_status: 'applied', job_type: 'alternance',
  outcome: '', followup_at: null, job_score: 80, job_score_reason: '',
}

function renderSheet(props = {}) {
  const onMove = vi.fn()
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <ActionSheet
        job={mockJob}
        onMove={onMove}
        onClose={onClose}
        isPending={false}
        errorMessage=""
        {...props}
      />
    </MemoryRouter>
  )
  return { onMove, onClose }
}

describe('ActionSheet', () => {
  it('renders job title and company', () => {
    renderSheet()
    expect(screen.getByText('Data Scientist')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders a link when url is non-empty', () => {
    renderSheet()
    const link = screen.getByRole('link', { name: /view listing/i })
    expect(link).toHaveAttribute('href', 'https://example.com')
  })

  it('current stage button is disabled', () => {
    renderSheet()
    const appliedBtn = screen.getByRole('button', { name: /^applied$/i })
    expect(appliedBtn).toBeDisabled()
  })

  it('other stage buttons are enabled and call onMove', async () => {
    const { onMove } = renderSheet()
    const interviewBtn = screen.getByRole('button', { name: /^interview$/i })
    expect(interviewBtn).not.toBeDisabled()
    await userEvent.click(interviewBtn)
    expect(onMove).toHaveBeenCalledWith('interview')
  })

  it('backdrop click calls onClose', async () => {
    const { onClose } = renderSheet()
    const backdrop = document.querySelector('[data-testid="backdrop"]') as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows errorMessage when non-empty', () => {
    renderSheet({ errorMessage: 'Move failed' })
    expect(screen.getByText('Move failed')).toBeInTheDocument()
  })
})
