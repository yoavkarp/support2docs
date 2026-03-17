import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../Dashboard'

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { email: 'test@example.com' }, loading: false })),
}))

const mockSignOut = vi.fn()
vi.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

describe('Dashboard', () => {
  it('renders the header and user email', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByText('Support2Docs')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('renders the KB Drafts heading', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'KB Drafts' })).toBeInTheDocument()
  })

  it('calls signOut when sign out button is clicked', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    fireEvent.click(screen.getByText('Sign out'))
    expect(mockSignOut).toHaveBeenCalled()
  })
})
