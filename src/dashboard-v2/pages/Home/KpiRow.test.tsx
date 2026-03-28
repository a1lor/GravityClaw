import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiRow } from './KpiRow'

describe('KpiRow', () => {
  it('renders all 4 stat cards with provided values', () => {
    render(<KpiRow messages={213} memories={1} jobsTracked={39} pipeline={13} />)
    expect(screen.getByText('213')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('39')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('renders skeleton placeholders when loading', () => {
    render(<KpiRow loading />)
    expect(screen.getAllByRole('status')).toHaveLength(4)
  })
})
