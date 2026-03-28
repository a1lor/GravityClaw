import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'

function wrap(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  it('renders the GravityClaw logo', () => {
    wrap('/')
    expect(screen.getByLabelText('GravityClaw')).toBeInTheDocument()
  })

  it('highlights the active nav item', () => {
    wrap('/pipeline')
    const pipelineLink = screen.getByRole('link', { name: 'Pipeline' })
    expect(pipelineLink).toHaveAttribute('aria-current', 'page')
  })

  it('renders all 4 nav items', () => {
    wrap('/')
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pipeline' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agent' })).toBeInTheDocument()
  })
})
