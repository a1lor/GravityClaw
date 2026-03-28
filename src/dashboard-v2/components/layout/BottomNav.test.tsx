import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { NAV } from '@/lib/nav'

describe('BottomNav', () => {
  it('renders nav items with labels from NAV constant', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )
    for (const { label } of NAV) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('renders 4 navigation links', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('applies accent color to active nav item', () => {
    // Render with /pipeline as the active route
    const pipelineNav = NAV.find((n) => n.to === '/pipeline')!
    render(
      <MemoryRouter initialEntries={['/pipeline']}>
        <BottomNav />
      </MemoryRouter>
    )
    const pipelineLabel = screen.getByText('Pipeline')
    // Active label should use the pipeline accent color
    expect(pipelineLabel).toHaveStyle({ color: pipelineNav.accent })
  })
})
