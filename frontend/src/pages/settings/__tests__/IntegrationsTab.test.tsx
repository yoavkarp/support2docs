import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IntegrationsTab } from '../IntegrationsTab'
import type { OrgSettings } from '@/hooks/useOrg'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/firebase', () => ({ auth: {} }))

vi.mock('@/contexts/OrgContext', () => ({
  useActiveOrg: () => ({ activeOrgId: 'test-org-id', setActiveOrgId: vi.fn() }),
}))

const mockUseOrgSettings = vi.fn()
const mockUseUpdateOrgSettings = vi.fn()

vi.mock('@/hooks/useOrg', () => ({
  useOrgSettings: (...args: unknown[]) => mockUseOrgSettings(...args),
  useUpdateOrgSettings: (...args: unknown[]) => mockUseUpdateOrgSettings(...args),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const settingsData: OrgSettings = {
  zendeskSubdomain: 'mycompany',
  zendeskApiKey: '****5678',
  intercomToken: '****abcd',
  kbPublishUrl: 'https://kb.example.com/publish',
  clusterThreshold: 0.65,
  minClusterSize: 5,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntegrationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseOrgSettings.mockReturnValue({ data: settingsData, isLoading: false, isError: false })
    mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  })

  it('renders all 6 form fields', () => {
    render(<IntegrationsTab />)
    expect(screen.getByLabelText('Zendesk Subdomain')).toBeInTheDocument()
    expect(screen.getByLabelText('Zendesk API Key')).toBeInTheDocument()
    expect(screen.getByLabelText('Intercom Token')).toBeInTheDocument()
    expect(screen.getByLabelText('KB Publish URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Cluster Threshold')).toBeInTheDocument()
    expect(screen.getByLabelText('Min Cluster Size')).toBeInTheDocument()
  })

  it('pre-fills Zendesk Subdomain from useOrgSettings data', () => {
    render(<IntegrationsTab />)
    expect(screen.getByLabelText('Zendesk Subdomain')).toHaveValue('mycompany')
  })

  it('pre-fills KB Publish URL from useOrgSettings data', () => {
    render(<IntegrationsTab />)
    expect(screen.getByLabelText('KB Publish URL')).toHaveValue('https://kb.example.com/publish')
  })

  it('pre-fills Cluster Threshold from useOrgSettings data', () => {
    render(<IntegrationsTab />)
    expect(screen.getByLabelText('Cluster Threshold')).toHaveValue(0.65)
  })

  it('pre-fills Min Cluster Size from useOrgSettings data', () => {
    render(<IntegrationsTab />)
    expect(screen.getByLabelText('Min Cluster Size')).toHaveValue(5)
  })

  it('shows loading skeleton while data is fetching', () => {
    mockUseOrgSettings.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<IntegrationsTab />)
    expect(screen.getByLabelText('Loading settings')).toBeInTheDocument()
  })

  describe('Password field show/hide toggle', () => {
    it('Zendesk API Key is hidden by default (type=password)', () => {
      render(<IntegrationsTab />)
      expect(screen.getByLabelText('Zendesk API Key')).toHaveAttribute('type', 'password')
    })

    it('clicking Show on Zendesk API Key reveals the value (type=text)', () => {
      render(<IntegrationsTab />)
      fireEvent.click(screen.getByLabelText('Show Zendesk API Key'))
      expect(screen.getByLabelText('Zendesk API Key')).toHaveAttribute('type', 'text')
    })

    it('clicking Hide on Zendesk API Key hides the value again', () => {
      render(<IntegrationsTab />)
      fireEvent.click(screen.getByLabelText('Show Zendesk API Key'))
      fireEvent.click(screen.getByLabelText('Hide Zendesk API Key'))
      expect(screen.getByLabelText('Zendesk API Key')).toHaveAttribute('type', 'password')
    })

    it('Intercom Token is hidden by default (type=password)', () => {
      render(<IntegrationsTab />)
      expect(screen.getByLabelText('Intercom Token')).toHaveAttribute('type', 'password')
    })

    it('clicking Show on Intercom Token reveals the value', () => {
      render(<IntegrationsTab />)
      fireEvent.click(screen.getByLabelText('Show Intercom Token'))
      expect(screen.getByLabelText('Intercom Token')).toHaveAttribute('type', 'text')
    })
  })

  describe('Form submission', () => {
    it('calls mutateAsync on submit', async () => {
      const mutateAsync = vi.fn().mockResolvedValue(settingsData)
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync, isPending: false })
      render(<IntegrationsTab />)
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    })

    it('shows success message after save', async () => {
      const mutateAsync = vi.fn().mockResolvedValue(settingsData)
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync, isPending: false })
      render(<IntegrationsTab />)
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Settings saved')
      })
    })

    it('shows error message when save fails', async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error('Server error'))
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync, isPending: false })
      render(<IntegrationsTab />)
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to save settings')
      })
    })

    it('disables the Save button while mutation is pending', () => {
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync: vi.fn(), isPending: true })
      render(<IntegrationsTab />)
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    })

    it('shows "Saving…" text on the button while pending', () => {
      mockUseUpdateOrgSettings.mockReturnValue({ mutateAsync: vi.fn(), isPending: true })
      render(<IntegrationsTab />)
      expect(screen.getByRole('button', { name: /saving/i })).toHaveTextContent('Saving…')
    })
  })
})
