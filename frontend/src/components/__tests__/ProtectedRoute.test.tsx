import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '../ProtectedRoute'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/hooks/useAuth'

describe('ProtectedRoute', () => {
  it('shows loading state while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true })
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('loading container has role="status" and aria-label for screen readers', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true })
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByLabelText('Authenticating')).toBeInTheDocument()
  })

  it('redirects to /login when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders children when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user-1', email: 'test@example.com' } as never,
      loading: false,
    })
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})
