import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from '../Dashboard'
import { AppLayout } from '@/components/AppLayout'
import type { Draft } from '@/types/draft'

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { email: 'test@example.com' }, loading: false })),
}))
vi.mock('@/lib/theme', () => ({
  initTheme: vi.fn(),
  applyTheme: vi.fn(),
  getTheme: vi.fn(() => 'dark' as const),
  toggleTheme: vi.fn(() => 'light' as const),
}))

const mockSignOut = vi.fn()
vi.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  GoogleAuthProvider: vi.fn(),
}))

const mockUseDrafts = vi.fn()
vi.mock('@/hooks/useDrafts', () => ({
  useDrafts: (...args: unknown[]) => mockUseDrafts(...args),
}))

vi.mock('@/hooks/useStats', () => ({
  useStats: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useStatsByReviewer: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}))

vi.mock('@/hooks/useOrg', () => ({
  useOrgs: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  useCreateOrg: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useOrgSettings: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useOrgMembers: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  useUpdateOrgSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useInviteMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateMemberRole: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRemoveMember: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const pendingDraft: Draft = {
  id: 'draft-1',
  title: 'How to reset password',
  content: 'Reset your password by visiting the login page.',
  status: 'PENDING_REVIEW',
  publishedUrl: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  clusterId: 'cluster-1',
  cluster: { _count: { tickets: 7 } },
}

const approvedDraft: Draft = {
  id: 'draft-2',
  title: 'Getting started guide',
  content: 'Welcome to the platform.',
  status: 'APPROVED',
  publishedUrl: null,
  createdAt: '2026-01-14T09:00:00Z',
  updatedAt: '2026-01-14T09:00:00Z',
  clusterId: 'cluster-2',
  cluster: { _count: { tickets: 5 } },
}

const discardedDraft: Draft = {
  id: 'draft-3',
  title: 'Old article',
  content: 'Outdated content.',
  status: 'DISCARDED',
  publishedUrl: null,
  createdAt: '2026-01-13T08:00:00Z',
  updatedAt: '2026-01-13T08:00:00Z',
  clusterId: 'cluster-3',
  cluster: { _count: { tickets: 3 } },
}

/** Render Dashboard alone (no sidebar) — for content-focused tests */
function renderDashboard(initialUrl = '/') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Dashboard />
    </MemoryRouter>
  )
}

/** Render Dashboard wrapped in AppLayout — for sidebar-related tests */
function renderDashboardWithLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppLayout>
          <Dashboard />
        </AppLayout>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Dashboard', () => {
  it('sets document.title to "Dashboard | Support2Docs"', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    expect(document.title).toBe('Dashboard | Support2Docs')
  })

  it('renders the sidebar wordmark and user email via AppLayout', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboardWithLayout()
    expect(screen.getByText('Support2Docs')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('renders the KB Drafts heading', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboard()
    expect(screen.getByRole('heading', { name: 'KB Drafts' })).toBeInTheDocument()
  })

  it('calls signOut when sign out button is clicked in AppLayout', () => {
    mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderDashboardWithLayout()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
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
    expect(screen.getByText('No drafts yet')).toBeInTheDocument()
  })

  it('shows error message on fetch failure', () => {
    mockUseDrafts.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderDashboard()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders draft cards when drafts are available', () => {
    mockUseDrafts.mockReturnValue({ data: [pendingDraft], isLoading: false, isError: false })
    renderDashboard()
    expect(screen.getByText('How to reset password')).toBeInTheDocument()
    expect(screen.getByText('7 tickets')).toBeInTheDocument()
  })

  it('navigates to draft detail on card click', () => {
    mockUseDrafts.mockReturnValue({ data: [pendingDraft], isLoading: false, isError: false })
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /draft: how to reset password/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/drafts/draft-1')
  })

  describe('Status filter tabs', () => {
    it('renders All, Pending, Approved, Discarded tabs', () => {
      mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
      renderDashboard()
      expect(screen.getByRole('tab', { name: /^All/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /^Pending/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /^Approved/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /^Discarded/ })).toBeInTheDocument()
    })

    it('All tab is selected by default', () => {
      mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
      renderDashboard()
      expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
    })

    it('shows all drafts when All tab is active', () => {
      mockUseDrafts.mockReturnValue({
        data: [pendingDraft, approvedDraft, discardedDraft],
        isLoading: false,
        isError: false,
      })
      renderDashboard()
      expect(screen.getByText('How to reset password')).toBeInTheDocument()
      expect(screen.getByText('Getting started guide')).toBeInTheDocument()
      expect(screen.getByText('Old article')).toBeInTheDocument()
    })

    it('filters to pending drafts when Pending tab is clicked', () => {
      mockUseDrafts.mockReturnValue({
        data: [pendingDraft, approvedDraft, discardedDraft],
        isLoading: false,
        isError: false,
      })
      renderDashboard()
      fireEvent.click(screen.getByRole('tab', { name: /^Pending/ }))
      expect(screen.getByText('How to reset password')).toBeInTheDocument()
      expect(screen.queryByText('Getting started guide')).not.toBeInTheDocument()
      expect(screen.queryByText('Old article')).not.toBeInTheDocument()
    })

    it('filters to approved drafts when Approved tab is clicked', () => {
      mockUseDrafts.mockReturnValue({
        data: [pendingDraft, approvedDraft, discardedDraft],
        isLoading: false,
        isError: false,
      })
      renderDashboard()
      fireEvent.click(screen.getByRole('tab', { name: /^Approved/ }))
      expect(screen.queryByText('How to reset password')).not.toBeInTheDocument()
      expect(screen.getByText('Getting started guide')).toBeInTheDocument()
      expect(screen.queryByText('Old article')).not.toBeInTheDocument()
    })

    it('filters to discarded drafts when Discarded tab is clicked', () => {
      mockUseDrafts.mockReturnValue({
        data: [pendingDraft, approvedDraft, discardedDraft],
        isLoading: false,
        isError: false,
      })
      renderDashboard()
      fireEvent.click(screen.getByRole('tab', { name: /^Discarded/ }))
      expect(screen.queryByText('How to reset password')).not.toBeInTheDocument()
      expect(screen.queryByText('Getting started guide')).not.toBeInTheDocument()
      expect(screen.getByText('Old article')).toBeInTheDocument()
    })

    it('shows count badges on tabs', () => {
      mockUseDrafts.mockReturnValue({
        data: [pendingDraft, approvedDraft, discardedDraft],
        isLoading: false,
        isError: false,
      })
      renderDashboard()
      // All tab shows total count of 3
      const allTab = screen.getByRole('tab', { name: /^All/ })
      expect(allTab).toHaveTextContent('3')
      // Pending tab shows count of 1
      const pendingTab = screen.getByRole('tab', { name: /^Pending/ })
      expect(pendingTab).toHaveTextContent('1')
    })

    it('shows pre-selected Approved tab from URL query param', () => {
      mockUseDrafts.mockReturnValue({
        data: [pendingDraft, approvedDraft],
        isLoading: false,
        isError: false,
      })
      renderDashboard('/?status=APPROVED')
      expect(screen.getByRole('tab', { name: /^Approved/ })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Getting started guide')).toBeInTheDocument()
      expect(screen.queryByText('How to reset password')).not.toBeInTheDocument()
    })

    it('view=stats param works independently of status param', () => {
      mockUseDrafts.mockReturnValue({ data: [], isLoading: false, isError: false })
      renderDashboard('/?view=stats')
      expect(screen.getByRole('heading', { name: 'Stats & ROI' })).toBeInTheDocument()
      // Filter tabs should not be visible in stats view
      expect(screen.queryByRole('tab', { name: /^All/ })).not.toBeInTheDocument()
    })
  })
})
