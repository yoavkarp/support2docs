import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../SettingsPage'
import type { OrgSettings, OrgMember, OrgSummary } from '@/hooks/useOrg'

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({ auth: {}, storage: {} }))

const mockUploadOrgLogo = vi.fn()
vi.mock('@/lib/uploadOrgLogo', () => ({
  uploadOrgLogo: (...args: unknown[]) => mockUploadOrgLogo(...args),
}))
vi.mock('@/lib/theme', () => ({
  initTheme: vi.fn(),
  applyTheme: vi.fn(),
  getTheme: vi.fn(() => 'dark' as const),
  toggleTheme: vi.fn(() => 'light' as const),
}))
vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
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

vi.mock('@/contexts/OrgContext', () => ({
  useActiveOrg: () => ({ activeOrgId: 'test-org-id', setActiveOrgId: vi.fn() }),
}))

const mockUseOrgSettings = vi.fn()
const mockUseOrgMembers = vi.fn()
const mockUseUpdateOrgSettings = vi.fn()
const mockUseInviteMember = vi.fn()
const mockUseUpdateMemberRole = vi.fn()
const mockUseRemoveMember = vi.fn()
const mockUseOrgs = vi.fn()
const mockUseCreateOrg = vi.fn()
const mockUseDeleteOrg = vi.fn()
const mockUsePatchOrg = vi.fn()

vi.mock('@/hooks/useOrg', () => ({
  useOrgSettings: (...args: unknown[]) => mockUseOrgSettings(...args),
  useOrgMembers: (...args: unknown[]) => mockUseOrgMembers(...args),
  useUpdateOrgSettings: (...args: unknown[]) => mockUseUpdateOrgSettings(...args),
  useInviteMember: (...args: unknown[]) => mockUseInviteMember(...args),
  useUpdateMemberRole: (...args: unknown[]) => mockUseUpdateMemberRole(...args),
  useRemoveMember: (...args: unknown[]) => mockUseRemoveMember(...args),
  useOrgs: (...args: unknown[]) => mockUseOrgs(...args),
  useCreateOrg: (...args: unknown[]) => mockUseCreateOrg(...args),
  useDeleteOrg: (...args: unknown[]) => mockUseDeleteOrg(...args),
  usePatchOrg: (...args: unknown[]) => mockUsePatchOrg(...args),
}))

// ─── Test fixtures ────────────────────────────────────────────────────────────

const settingsData: OrgSettings = {
  zendeskSubdomain: 'acme',
  zendeskApiKey: '****5678',
  intercomToken: '****abcd',
  kbPublishUrl: 'https://kb.example.com/publish',
  clusterThreshold: 0.65,
  minClusterSize: 5,
}

const adminMember: OrgMember = {
  userId: 'user-1',
  userEmail: 'admin@example.com',
  role: 'ADMIN',
  joinedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
}

const regularMember: OrgMember = {
  userId: 'user-2',
  userEmail: 'member@example.com',
  role: 'MEMBER',
  joinedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
}

const pendingMember: OrgMember = {
  userId: null,
  userEmail: 'invited@example.com',
  role: 'MEMBER',
  joinedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
}

const adminOrg: OrgSummary = {
  id: 'test-org-id',
  name: 'My Team',
  slug: 'my-team',
  role: 'ADMIN',
  memberCount: 2,
  logoUrl: null,
}

const memberOrg: OrgSummary = {
  id: 'other-org-id',
  name: 'Product Team',
  slug: 'product-team',
  role: 'MEMBER',
  memberCount: 5,
  logoUrl: 'https://storage.example.com/org-logos/other-org-id/logo.png',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockUploadOrgLogo.mockResolvedValue('https://storage.example.com/org-logos/test-org-id/logo.png')
  mockUseAuth.mockReturnValue({ user: { email: 'admin@example.com' }, loading: false })

  mockUseOrgSettings.mockReturnValue({
    data: settingsData,
    isLoading: false,
    isError: false,
  })
  mockUseOrgMembers.mockReturnValue({
    data: [adminMember, regularMember],
    isLoading: false,
    isError: false,
  })
  mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mockUseInviteMember.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mockUseUpdateMemberRole.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mockUseRemoveMember.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mockUseOrgs.mockReturnValue({
    data: [adminOrg, memberOrg],
    isLoading: false,
    isError: false,
  })
  mockUseCreateOrg.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mockUseDeleteOrg.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mockUsePatchOrg.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
}

function renderSettingsPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  beforeEach(() => {
    setupDefaultMocks()
  })

  it('sets document.title to "Settings | Support2Docs"', () => {
    renderSettingsPage()
    expect(document.title).toBe('Settings | Support2Docs')
  })

  it('renders the Settings heading', () => {
    renderSettingsPage()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders Integrations, Team, and Manage Teams tabs', () => {
    renderSettingsPage()
    expect(screen.getByRole('tab', { name: 'Integrations' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Manage Teams' })).toBeInTheDocument()
  })

  it('Integrations tab is selected by default', () => {
    renderSettingsPage()
    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('switches to Team tab on click', () => {
    renderSettingsPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Team members')).toBeInTheDocument()
  })

  describe('Integrations tab', () => {
    it('pre-fills form fields with masked values from API', () => {
      renderSettingsPage()
      expect(screen.getByLabelText('Zendesk Subdomain')).toHaveValue('acme')
      expect(screen.getByLabelText('KB Publish URL')).toHaveValue('https://kb.example.com/publish')
      expect(screen.getByLabelText('Cluster Threshold')).toHaveValue(0.65)
      expect(screen.getByLabelText('Min Cluster Size')).toHaveValue(5)
    })

    it('renders loading skeletons while fetching settings', () => {
      mockUseOrgSettings.mockReturnValue({ data: undefined, isLoading: true, isError: false })
      renderSettingsPage()
      expect(screen.getByLabelText('Loading settings')).toBeInTheDocument()
    })

    it('password fields have show/hide toggle buttons', () => {
      renderSettingsPage()
      expect(screen.getByLabelText('Show Zendesk API Key')).toBeInTheDocument()
      expect(screen.getByLabelText('Show Intercom Token')).toBeInTheDocument()
    })

    it('toggles password field visibility when show/hide is clicked', () => {
      renderSettingsPage()
      const apiKeyInput = screen.getByLabelText('Zendesk API Key')
      expect(apiKeyInput).toHaveAttribute('type', 'password')
      fireEvent.click(screen.getByLabelText('Show Zendesk API Key'))
      expect(apiKeyInput).toHaveAttribute('type', 'text')
      expect(screen.getByLabelText('Hide Zendesk API Key')).toBeInTheDocument()
    })

    it('calls updateOrgSettings mutation on form submit', async () => {
      const mutateAsync = vi.fn().mockResolvedValue(settingsData)
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync, isPending: false })
      renderSettingsPage()
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledOnce()
      })
    })

    it('shows success message after successful save', async () => {
      const mutateAsync = vi.fn().mockResolvedValue(settingsData)
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync, isPending: false })
      renderSettingsPage()
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Settings saved')
      })
    })

    it('shows error message when save fails', async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error('Network error'))
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync, isPending: false })
      renderSettingsPage()
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Failed to save settings',
        )
      })
    })

    it('disables Save button while mutation is pending', () => {
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync: vi.fn(), isPending: true })
      renderSettingsPage()
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    })
  })

  describe('Team tab', () => {
    function renderTeamTab() {
      renderSettingsPage()
      fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    }

    it('renders member table with member rows', () => {
      renderTeamTab()
      expect(screen.getByText('admin@example.com')).toBeInTheDocument()
      expect(screen.getByText('member@example.com')).toBeInTheDocument()
    })

    it('renders loading skeletons while fetching members', () => {
      mockUseOrgMembers.mockReturnValue({ data: undefined, isLoading: true, isError: false })
      renderTeamTab()
      expect(screen.getByLabelText('Loading team members')).toBeInTheDocument()
    })

    it('renders Admin role badge for admin members', () => {
      renderTeamTab()
      const badges = screen.getAllByText('Admin')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders Member role badge for regular members', () => {
      renderTeamTab()
      const badges = screen.getAllByText('Member')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders Invited badge for pending members', () => {
      mockUseOrgMembers.mockReturnValue({
        data: [adminMember, pendingMember],
        isLoading: false,
        isError: false,
      })
      renderTeamTab()
      expect(screen.getByText('Invited')).toBeInTheDocument()
    })

    it('does not render Remove button for the current user row', () => {
      renderTeamTab()
      // admin@example.com is the current user; should not have a Remove button for self
      const removeButtons = screen.queryAllByLabelText(/Remove admin@example\.com/)
      expect(removeButtons).toHaveLength(0)
    })

    it('renders Remove button for other members', () => {
      renderTeamTab()
      expect(screen.getByLabelText('Remove member@example.com')).toBeInTheDocument()
    })

    it('shows confirm dialog before removing a member', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const mutateAsync = vi.fn()
      mockUseRemoveMember.mockReturnValue({ mutateAsync, isPending: false })
      renderTeamTab()
      fireEvent.click(screen.getByLabelText('Remove member@example.com'))
      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledOnce()
        expect(mutateAsync).not.toHaveBeenCalled()
      })
      confirmSpy.mockRestore()
    })

    it('calls removeMember mutation when confirm is accepted', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const mutateAsync = vi.fn().mockResolvedValue(undefined)
      mockUseRemoveMember.mockReturnValue({ mutateAsync, isPending: false })
      renderTeamTab()
      fireEvent.click(screen.getByLabelText('Remove member@example.com'))
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith('user-2')
      })
      vi.restoreAllMocks()
    })

    it('shows Make Admin / Make Member role toggle buttons for admin users', () => {
      renderTeamTab()
      // Current user is admin, so they see role toggles for other members
      expect(screen.getByRole('button', { name: 'Make Admin' })).toBeInTheDocument()
    })

    describe('Invite form', () => {
      it('renders the invite email input and Invite button', () => {
        renderTeamTab()
        expect(screen.getByLabelText('Email address to invite')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
      })

      it('shows success message after successful invite', async () => {
        const mutateAsync = vi.fn().mockResolvedValue(pendingMember)
        mockUseInviteMember.mockReturnValue({ mutateAsync, isPending: false })
        renderTeamTab()
        const input = screen.getByLabelText('Email address to invite')
        fireEvent.change(input, { target: { value: 'new@example.com' } })
        fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
        await waitFor(() => {
          expect(screen.getByRole('status')).toHaveTextContent(
            'Invitation sent to new@example.com',
          )
        })
        expect(mutateAsync).toHaveBeenCalledWith({ email: 'new@example.com' })
      })

      it('clears input after successful invite', async () => {
        const mutateAsync = vi.fn().mockResolvedValue(pendingMember)
        mockUseInviteMember.mockReturnValue({ mutateAsync, isPending: false })
        renderTeamTab()
        const input = screen.getByLabelText('Email address to invite')
        fireEvent.change(input, { target: { value: 'new@example.com' } })
        fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
        await waitFor(() => {
          expect(input).toHaveValue('')
        })
      })

      it('shows "Already a member" error on 409 response', async () => {
        const mutateAsync = vi
          .fn()
          .mockRejectedValue(new Error('Already a member'))
        mockUseInviteMember.mockReturnValue({ mutateAsync, isPending: false })
        renderTeamTab()
        const input = screen.getByLabelText('Email address to invite')
        fireEvent.change(input, { target: { value: 'existing@example.com' } })
        fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent('Already a member')
        })
      })

      it('disables Invite button when email is empty', () => {
        renderTeamTab()
        expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled()
      })
    })
  })

  describe('Manage Teams tab', () => {
    function renderManageTeamsTab() {
      renderSettingsPage()
      fireEvent.click(screen.getByRole('tab', { name: 'Manage Teams' }))
    }

    it('renders the teams list with org names', () => {
      renderManageTeamsTab()
      expect(screen.getByText('My Team')).toBeInTheDocument()
      expect(screen.getByText('Product Team')).toBeInTheDocument()
    })

    it('shows loading skeletons while fetching orgs', () => {
      mockUseOrgs.mockReturnValue({ data: undefined, isLoading: true, isError: false })
      renderManageTeamsTab()
      expect(screen.getByLabelText('Loading teams')).toBeInTheDocument()
    })

    it('shows "(active)" badge next to the active org', () => {
      renderManageTeamsTab()
      expect(screen.getByText('active')).toBeInTheDocument()
    })

    it('shows member count for each org', () => {
      renderManageTeamsTab()
      expect(screen.getByText('2 members')).toBeInTheDocument()
      expect(screen.getByText('5 members')).toBeInTheDocument()
    })

    it('shows Delete button only for orgs where user is ADMIN', () => {
      renderManageTeamsTab()
      expect(screen.getByLabelText('Delete My Team')).toBeInTheDocument()
      // Product Team role is MEMBER — no delete button
      expect(screen.queryByLabelText('Delete Product Team')).not.toBeInTheDocument()
    })

    it('shows confirm dialog before deleting an org', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const mutateAsync = vi.fn()
      mockUseDeleteOrg.mockReturnValue({ mutateAsync, isPending: false })
      renderManageTeamsTab()
      fireEvent.click(screen.getByLabelText('Delete My Team'))
      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledOnce()
        expect(mutateAsync).not.toHaveBeenCalled()
      })
      confirmSpy.mockRestore()
    })

    it('calls deleteOrg mutation when confirm is accepted', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const mutateAsync = vi.fn().mockResolvedValue(undefined)
      mockUseDeleteOrg.mockReturnValue({ mutateAsync, isPending: false })
      renderManageTeamsTab()
      fireEvent.click(screen.getByLabelText('Delete My Team'))
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith('test-org-id')
      })
      vi.restoreAllMocks()
    })

    it('shows inline error when delete fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const mutateAsync = vi.fn().mockRejectedValue(new Error('Cannot delete your only team'))
      mockUseDeleteOrg.mockReturnValue({ mutateAsync, isPending: false })
      renderManageTeamsTab()
      fireEvent.click(screen.getByLabelText('Delete My Team'))
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Cannot delete your only team')
      })
      vi.restoreAllMocks()
    })

    it('shows "+ New team" button', () => {
      renderManageTeamsTab()
      expect(screen.getByRole('button', { name: '+ New team' })).toBeInTheDocument()
    })

    it('shows inline create form when "+ New team" is clicked', () => {
      renderManageTeamsTab()
      fireEvent.click(screen.getByRole('button', { name: '+ New team' }))
      expect(screen.getByLabelText('New team name')).toBeInTheDocument()
    })

    it('calls createOrg mutation when form is submitted', async () => {
      const mutateAsync = vi.fn().mockResolvedValue({ ...adminOrg, id: 'new-org-id' })
      mockUseCreateOrg.mockReturnValue({ mutateAsync, isPending: false })
      renderManageTeamsTab()
      fireEvent.click(screen.getByRole('button', { name: '+ New team' }))
      const input = screen.getByLabelText('New team name')
      fireEvent.change(input, { target: { value: 'Dev Team' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({ name: 'Dev Team' })
      })
    })

    describe('Inline edit form', () => {
      it('Edit button renders for admin orgs', () => {
        renderManageTeamsTab()
        expect(screen.getByLabelText('Edit My Team')).toBeInTheDocument()
      })

      it('Edit button does not render for non-admin orgs', () => {
        renderManageTeamsTab()
        expect(screen.queryByLabelText('Edit Product Team')).not.toBeInTheDocument()
      })

      it('clicking Edit shows name input pre-filled with org name', () => {
        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))
        const nameInput = screen.getByLabelText('Team name')
        expect(nameInput).toBeInTheDocument()
        expect(nameInput).toHaveValue('My Team')
      })

      it('clicking Cancel hides the edit form', () => {
        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))
        expect(screen.getByLabelText('Team name')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByLabelText('Team name')).not.toBeInTheDocument()
      })

      it('submitting calls usePatchOrg with correct args (no logo change)', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({ ...adminOrg, name: 'New Name' })
        mockUsePatchOrg.mockReturnValue({ mutateAsync, isPending: false })
        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))
        const nameInput = screen.getByLabelText('Team name')
        fireEvent.change(nameInput, { target: { value: 'New Name' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => {
          expect(mutateAsync).toHaveBeenCalledWith({
            orgId: 'test-org-id',
            name: 'New Name',
            logoUrl: null,
          })
        })
      })

      it('inline error shown on failure', async () => {
        const mutateAsync = vi.fn().mockRejectedValue(new Error('Update failed'))
        mockUsePatchOrg.mockReturnValue({ mutateAsync, isPending: false })
        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent('Update failed')
        })
      })

      it('file > 2MB shows inline error without calling uploadOrgLogo', async () => {
        mockUploadOrgLogo.mockResolvedValue('https://storage.example.com/new-logo.png')
        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))

        // Simulate selecting a file that is too large (3 MB)
        const uploadButton = screen.getByLabelText('Upload logo')
        // The hidden file input is a sibling in the DOM; we trigger change on it directly
        // by querying within the same container
        const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]') as HTMLInputElement
        expect(fileInput).toBeTruthy()
        const largeFile = new File(['x'.repeat(3 * 1024 * 1024)], 'big.png', { type: 'image/png' })
        Object.defineProperty(largeFile, 'size', { value: 3 * 1024 * 1024 })
        fireEvent.change(fileInput, { target: { files: [largeFile] } })

        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent('Image must be under 2 MB')
        })
        expect(mockUploadOrgLogo).not.toHaveBeenCalled()
      })

      it('successful image upload stores URL and passes it to usePatchOrg on save', async () => {
        const uploadedUrl = 'https://storage.example.com/org-logos/test-org-id/logo.png'
        mockUploadOrgLogo.mockResolvedValue(uploadedUrl)
        const mutateAsync = vi.fn().mockResolvedValue({ ...adminOrg, logoUrl: uploadedUrl })
        mockUsePatchOrg.mockReturnValue({ mutateAsync, isPending: false })

        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))

        const uploadButton = screen.getByLabelText('Upload logo')
        const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]') as HTMLInputElement
        const validFile = new File(['data'], 'logo.png', { type: 'image/png' })
        fireEvent.change(fileInput, { target: { files: [validFile] } })

        await waitFor(() => {
          expect(mockUploadOrgLogo).toHaveBeenCalledWith('test-org-id', validFile)
        })

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => {
          expect(mutateAsync).toHaveBeenCalledWith({
            orgId: 'test-org-id',
            name: 'My Team',
            logoUrl: uploadedUrl,
          })
        })
      })

      it('only one row in edit mode at a time', () => {
        // Add a second admin org to test mutual exclusion
        const secondAdminOrg: OrgSummary = {
          id: 'second-org-id',
          name: 'Second Team',
          slug: 'second-team',
          role: 'ADMIN',
          memberCount: 1,
          logoUrl: null,
        }
        mockUseOrgs.mockReturnValue({
          data: [adminOrg, secondAdminOrg],
          isLoading: false,
          isError: false,
        })
        renderManageTeamsTab()
        fireEvent.click(screen.getByLabelText('Edit My Team'))
        expect(screen.getAllByLabelText('Team name')).toHaveLength(1)
        // Clicking Edit on the second org closes the first
        fireEvent.click(screen.getByLabelText('Edit Second Team'))
        const inputs = screen.getAllByLabelText('Team name')
        expect(inputs).toHaveLength(1)
      })
    })
  })
})
