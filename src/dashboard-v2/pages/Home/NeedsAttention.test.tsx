import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NeedsAttention } from './NeedsAttention'

const items = [
  { id: '1', type: 'follow-up' as const,  label: 'Follow up with Vercel',   urgency: 'high' as const },
  { id: '2', type: 'job-match' as const,  label: 'New match: Stripe Staff', urgency: 'normal' as const },
  { id: '3', type: 'interview' as const,  label: 'Interview tomorrow 10:00', urgency: 'high' as const },
]

describe('NeedsAttention', () => {
  it('renders all items', () => {
    render(<NeedsAttention items={items} />)
    expect(screen.getByText('Follow up with Vercel')).toBeInTheDocument()
    expect(screen.getByText('New match: Stripe Staff')).toBeInTheDocument()
    expect(screen.getByText('Interview tomorrow 10:00')).toBeInTheDocument()
  })

  it('shows empty state when no items', () => {
    render(<NeedsAttention items={[]} />)
    expect(screen.getByText(/all clear/i)).toBeInTheDocument()
  })
})
