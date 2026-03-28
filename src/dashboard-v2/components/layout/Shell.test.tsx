import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NAV } from '@/lib/nav'

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}))

import { useIsMobile } from '@/hooks/useIsMobile'
import { Shell } from './Shell'

function renderShell(isMobile: boolean) {
  vi.mocked(useIsMobile).mockReturnValue(isMobile)
  render(
    <MemoryRouter>
      <Shell />
    </MemoryRouter>
  )
}

describe('Shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Sidebar on desktop, no BottomNav', () => {
    renderShell(false)
    expect(screen.getByRole('navigation', { name: 'GravityClaw' })).toBeInTheDocument()
    // BottomNav should not be present
    for (const { label } of NAV) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('does not render Sidebar on mobile', () => {
    renderShell(true)
    expect(screen.queryByRole('navigation', { name: 'GravityClaw' })).not.toBeInTheDocument()
  })

  it('renders BottomNav on mobile, no Sidebar', () => {
    renderShell(true)
    // BottomNav items should be present
    for (const { label } of NAV) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // Sidebar should not be present
    expect(screen.queryByRole('navigation', { name: 'GravityClaw' })).not.toBeInTheDocument()
  })
})
