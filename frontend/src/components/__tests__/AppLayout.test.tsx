import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppLayout } from '../AppLayout'
import type { OrgSummary } from '@/hooks/useOrg'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/firebase', () => ({ auth: {} }))

vi.mock('@/lib/theme', () => ({
  getTheme: vi.fn(() => 'dark' as const),
  toggleTheme: vi.fn(() => 'light' as const),
  initTheme: vi.fn(),
  applyTheme: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(() => Promise.resolve()),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => {
    cb(null)
    return () => {}
  }),
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}))

const mockSetActiveOrgId = vi.fn()
const mockUseActiveOrg = vi.fn()
vi.mock('@/contexts/OrgContext', () => ({
  useActiveOrg: (...args: unknown[]) => mockUseActiveOrg(...args),
}))

const mockUseOrgs = vi.fn()
const mockUseCreateOrg = vi.fn()
vi.mock('@/hooks/useOrg', () => ({
  useOrgs: (...args: unknown[]) => mockUseOrgs(...args),
  useCreateOrg: (...args: unknown[]) => mockUseCreateOrg(...args),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const orgNoLogo: OrgSummary = {
  id: 'org-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  role: 'ADMIN',
  memberCount: 5,
  logoUrl: null,
}

const orgWithLogo: OrgSummary = {
  id: 'org-2',
  name: 'Beta Inc',
  slug: 'beta-inc',
  role: 'MEMBER',
  memberCount: 2,
  logoUrl: 'https://cdn.example.com/beta-logo.png',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAppLayout() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppLayout>
        <div data-testid="child-content">Content</div>
      </AppLayout>
    </MemoryRouter>
  )
}

function setupDefaults(activeOrgId = 'org-1', orgs = [orgNoLogo]) {
  mockUseAuth.mockReturnValue({ user: { email: 'admin@example.com' }, loading: false })
  mockUseActiveOrg.mockReturnValue({ activeOrgId, setActiveOrgId: mockSetActiveOrgId })
  mockUseOrgs.mockReturnValue({ data: orgs, isLoading: false })
  mockUseCreateOrg.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetActiveOrgId.mockReset()
  })

  it('renders the sidebar navigation', () => {
    setupDefaults()
    renderAppLayout()
    expect(screen.getByRole('complementary', { name: 'Sidebar navigation' })).toBeInTheDocument()
  })

  it('renders the child content', () => {
    setupDefaults()
    renderAppLayout()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders the Support2Docs wordmark', () => {
    setupDefaults()
    renderAppLayout()
    expect(screen.getByText('Support2Docs')).toBeInTheDocument()
  })

  it('renders nav links for Dashboard, Stats and Settings', () => {
    setupDefaults()
    renderAppLayout()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stats' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders the signed-in user email', () => {
    setupDefaults()
    renderAppLayout()
    expect(screen.getByTitle('admin@example.com')).toBeInTheDocument()
  })

  it('renders sign-out button', () => {
    setupDefaults()
    renderAppLayout()
    const signOutButtons = screen.getAllByRole('button', { name: 'Sign out' })
    expect(signOutButtons.length).toBeGreaterThan(0)
  })

  describe('OrgSwitcher — initials and logo', () => {
    it('renders org initials (first 2 chars) when logoUrl is null', () => {
      setupDefaults('org-1', [orgNoLogo])
      renderAppLayout()
      // "Acme Corp" → initials "AC"
      expect(screen.getAllByText('AC').length).toBeGreaterThan(0)
    })

    it('renders <img> when logoUrl is set', () => {
      setupDefaults('org-2', [orgWithLogo])
      renderAppLayout()
      const img = screen.getByRole('img', { name: 'Beta Inc' })
      expect(img).toHaveAttribute('src', orgWithLogo.logoUrl)
    })

    it('renders org name in the switcher button when expanded', () => {
      setupDefaults('org-1', [orgNoLogo])
      renderAppLayout()
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  describe('OrgSwitcher — dropdown interaction', () => {
    it('dropdown is not visible initially', () => {
      setupDefaults('org-1', [orgNoLogo])
      renderAppLayout()
      expect(screen.queryByRole('listbox', { name: 'Organizations' })).not.toBeInTheDocument()
    })

    it('clicking the switcher button opens the dropdown', () => {
      setupDefaults('org-1', [orgNoLogo])
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      expect(screen.getByRole('listbox', { name: 'Organizations' })).toBeInTheDocument()
    })

    it('clicking an org in the dropdown calls setActiveOrgId', () => {
      setupDefaults('org-1', [orgNoLogo, orgWithLogo])
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      // Click the "Beta Inc" org button
      fireEvent.click(screen.getByText('Beta Inc'))
      expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-2')
    })

    it('clicking outside the dropdown closes it', () => {
      setupDefaults('org-1', [orgNoLogo])
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      expect(screen.getByRole('listbox', { name: 'Organizations' })).toBeInTheDocument()
      // Fire a mousedown event on the document body (outside)
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('listbox', { name: 'Organizations' })).not.toBeInTheDocument()
    })
  })

  describe('OrgSwitcher — create form', () => {
    it('shows "+ New team" option in the open dropdown', () => {
      setupDefaults()
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      expect(screen.getByText('New team')).toBeInTheDocument()
    })

    it('clicking "+ New team" shows the create form', () => {
      setupDefaults()
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      fireEvent.click(screen.getByText('New team'))
      expect(screen.getByLabelText('New team name')).toBeInTheDocument()
    })

    it('submitting the create form calls mutateAsync with the trimmed name', async () => {
      const mutateAsync = vi.fn().mockResolvedValue({ ...orgNoLogo, id: 'new-org' })
      mockUseAuth.mockReturnValue({ user: { email: 'admin@example.com' }, loading: false })
      mockUseActiveOrg.mockReturnValue({ activeOrgId: 'org-1', setActiveOrgId: mockSetActiveOrgId })
      mockUseOrgs.mockReturnValue({ data: [orgNoLogo], isLoading: false })
      mockUseCreateOrg.mockReturnValue({ mutateAsync, isPending: false })
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      fireEvent.click(screen.getByText('New team'))
      const input = screen.getByLabelText('New team name')
      fireEvent.change(input, { target: { value: '  My New Team  ' } })
      fireEvent.submit(input.closest('form')!)
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({ name: 'My New Team' })
      })
    })

    it('Create button is disabled when input is empty', () => {
      setupDefaults()
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }))
      fireEvent.click(screen.getByText('New team'))
      expect(screen.getByRole('button', { name: 'Create team' })).toBeDisabled()
    })
  })

  describe('Sidebar collapse', () => {
    it('renders "Collapse sidebar" button initially', () => {
      setupDefaults()
      renderAppLayout()
      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    })

    it('clicking collapse hides the wordmark', () => {
      setupDefaults()
      renderAppLayout()
      expect(screen.getByText('Support2Docs')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      expect(screen.queryByText('Support2Docs')).not.toBeInTheDocument()
    })

    it('clicking expand button after collapse restores wordmark', () => {
      setupDefaults()
      renderAppLayout()
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      expect(screen.queryByText('Support2Docs')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
      expect(screen.getByText('Support2Docs')).toBeInTheDocument()
    })
  })
})
