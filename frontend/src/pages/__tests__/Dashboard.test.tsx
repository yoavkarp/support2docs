import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../Dashboard'
import type { Draft } from '@/types/draft'

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { email: 'test@example.com' }, loading: false })),
}))

const mockSignOut = vi.fn()
vi.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

const mockUseDrafts = vi.fn()
vi.mock('@/hooks/useDrafts', () => ({
  useDrafts: (...args: unknown[]) => mockUseDrafts(...args),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

describe('Dashboard', () => {
  it('sets document.title to "Dashboard | Support2Docs"', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    expect(document.title).toBe('Dashboard | Support2Docs')
  })

  it('renders the header and user email', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    expect(screen.getByText('Support2Docs')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('renders the KB Drafts heading', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    expect(screen.getByRole('heading', { name: 'KB Drafts' })).toBeInTheDocument()
  })

  it('calls signOut when sign out button is clicked', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    fireEvent.click(screen.getByText('Sign out'))
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('shows loading skeleton while fetching', () => {
    mockUseDrafts.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderDashboard()
    expect(screen.getByLabelText('Loading drafts')).toBeInTheDocument()
  })

  it('shows empty state when no drafts', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    expect(screen.getByText('No drafts pending review')).toBeInTheDocument()
  })

  it('shows error message on fetch failure', () => {
    mockUseDrafts.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderDashboard()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders draft cards when drafts are available', () => {
    const draft: Draft = {
      id: 'draft-1',
      title: 'How to reset password',
      content: 'Reset your password by...',
      status: 'PENDING_REVIEW',
      publishedUrl: null,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      clusterId: 'cluster-1',
      cluster: { _count: { tickets: 7 } },
    }
    mockUseDrafts.mockReturnValue({ data: [draft], isLoading: false, isError: false })
    renderDashboard()
    expect(screen.getByText('How to reset password')).toBeInTheDocument()
    expect(screen.getByText('7 tickets')).toBeInTheDocument()
  })

  it('navigates to draft detail on card click', () => {
    const draft: Draft = {
      id: 'draft-1',
      title: 'How to reset password',
      content: 'content',
      status: 'PENDING_REVIEW',
      publishedUrl: null,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      clusterId: 'cluster-1',
      cluster: { _count: { tickets: 3 } },
    }
    mockUseDrafts.mockReturnValue({ data: [draft], isLoading: false, isError: false })
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /draft: how to reset password/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/drafts/draft-1')
  })
})
