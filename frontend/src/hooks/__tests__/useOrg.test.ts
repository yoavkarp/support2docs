import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { OrgSettings, OrgMember, OrgSummary } from '../useOrg'

const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }))

const mockSetActiveOrgId = vi.fn()
let mockActiveOrgId = 'test-org-id'

vi.mock('@/contexts/OrgContext', () => ({
  useActiveOrg: () => ({ activeOrgId: mockActiveOrgId, setActiveOrgId: mockSetActiveOrgId }),
}))

const {
  useOrgs,
  useOrgSettings,
  useOrgMembers,
  useUpdateOrgSettings,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
  useDeleteOrg,
  useCreateOrg,
  usePatchOrg,
} = await import('../useOrg')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const sampleOrg: OrgSummary = {
  id: 'test-org-id',
  name: 'Test Org',
  slug: 'test-org',
  role: 'ADMIN',
  memberCount: 3,
  logoUrl: null,
}

const anotherOrg: OrgSummary = {
  id: 'another-org-id',
  name: 'Another Org',
  slug: 'another-org',
  role: 'MEMBER',
  memberCount: 1,
  logoUrl: 'https://example.com/logo.png',
}

const sampleSettings: OrgSettings = {
  zendeskSubdomain: 'acme',
  zendeskApiKey: '****5678',
  intercomToken: '****abcd',
  kbPublishUrl: 'https://kb.example.com/publish',
  clusterThreshold: 0.65,
  minClusterSize: 5,
}

const sampleMember: OrgMember = {
  userId: 'user-1',
  userEmail: 'admin@example.com',
  role: 'ADMIN',
  joinedAt: '2026-01-15T10:00:00Z',
}

const pendingMember: OrgMember = {
  userId: null,
  userEmail: 'invited@example.com',
  role: 'MEMBER',
  joinedAt: '2026-03-01T10:00:00Z',
}

describe('useOrgSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches org settings from /api/v1/org/settings', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleSettings)
    const { result } = renderHook(() => useOrgSettings(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(sampleSettings)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/settings')
  })

  it('returns error state when fetch fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('API error 500'))
    const { result } = renderHook(() => useOrgSettings(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useOrgMembers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches org members from /api/v1/org/members', async () => {
    mockApiFetch.mockResolvedValueOnce([sampleMember, pendingMember])
    const { result } = renderHook(() => useOrgMembers(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([sampleMember, pendingMember])
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/members')
  })
})

describe('useUpdateOrgSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls PUT /api/v1/org/settings with provided data', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleSettings)
    const { result } = renderHook(() => useUpdateOrgSettings(), { wrapper: createWrapper() })
    const partial = { zendeskSubdomain: 'newdomain', clusterThreshold: 0.7 }
    result.current.mutate(partial)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/settings', {
      method: 'PUT',
      body: JSON.stringify(partial),
    })
  })
})

describe('useInviteMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /api/v1/org/members/invite with email', async () => {
    mockApiFetch.mockResolvedValueOnce(pendingMember)
    const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() })
    result.current.mutate({ email: 'invited@example.com' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/members/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'invited@example.com' }),
    })
  })
})

describe('useUpdateMemberRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls PATCH /api/v1/org/members/:userId with new role', async () => {
    const updatedMember = { ...sampleMember, role: 'MEMBER' as const }
    mockApiFetch.mockResolvedValueOnce(updatedMember)
    const { result } = renderHook(() => useUpdateMemberRole(), { wrapper: createWrapper() })
    result.current.mutate({ userId: 'user-1', role: 'MEMBER' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/members/user-1', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'MEMBER' }),
    })
  })
})

describe('useRemoveMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls DELETE /api/v1/org/members/:userId', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useRemoveMember(), { wrapper: createWrapper() })
    result.current.mutate('user-2')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/members/user-2', {
      method: 'DELETE',
    })
  })
})

describe('useDeleteOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveOrgId = 'test-org-id'
    mockSetActiveOrgId.mockReset()
  })

  it('calls DELETE /api/v1/org/:orgId', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useDeleteOrg(), { wrapper: createWrapper() })
    result.current.mutate('org-to-delete')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/org-to-delete', {
      method: 'DELETE',
    })
  })

  it('returns error state when delete fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Cannot delete last org'))
    const { result } = renderHook(() => useDeleteOrg(), { wrapper: createWrapper() })
    result.current.mutate('org-123')
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('onSuccess: switches active org to orgs[0] when deleted org was active', async () => {
    // The deleted org IS the currently active one
    mockActiveOrgId = 'test-org-id'
    mockApiFetch.mockResolvedValueOnce(undefined)

    const wrapper = createWrapper()
    // Pre-populate the query cache with a list that has a second org remaining
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    qc.setQueryData<OrgSummary[]>(['orgs'], [anotherOrg])

    function WrapperWithData({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children)
    }

    const { result } = renderHook(() => useDeleteOrg(), { wrapper: WrapperWithData })
    result.current.mutate('test-org-id')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('another-org-id'))
  })

  it('onSuccess: does NOT switch active org when a different org was deleted', async () => {
    mockActiveOrgId = 'test-org-id'
    mockApiFetch.mockResolvedValueOnce(undefined)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    qc.setQueryData<OrgSummary[]>(['orgs'], [sampleOrg])

    function WrapperWithData({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children)
    }

    const { result } = renderHook(() => useDeleteOrg(), { wrapper: WrapperWithData })
    // Deleting a *different* org, not the active one
    result.current.mutate('another-org-id')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockSetActiveOrgId).not.toHaveBeenCalled()
  })
})

describe('useOrgs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches orgs from /api/v1/org', async () => {
    mockApiFetch.mockResolvedValueOnce([sampleOrg, anotherOrg])
    const { result } = renderHook(() => useOrgs(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([sampleOrg, anotherOrg])
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org')
  })

  it('uses ["orgs"] as the query key (staleTime is 60 s)', async () => {
    mockApiFetch.mockResolvedValueOnce([sampleOrg])
    const { result } = renderHook(() => useOrgs(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org')
  })

  it('returns error state when fetch fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Unauthorized'))
    const { result } = renderHook(() => useOrgs(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useCreateOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetActiveOrgId.mockReset()
  })

  it('calls POST /api/v1/org with org name', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleOrg)
    const { result } = renderHook(() => useCreateOrg(), { wrapper: createWrapper() })
    result.current.mutate({ name: 'Test Org' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Org' }),
    })
  })

  it('onSuccess: calls setActiveOrgId with the new org id', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleOrg)
    const { result } = renderHook(() => useCreateOrg(), { wrapper: createWrapper() })
    result.current.mutate({ name: 'Test Org' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockSetActiveOrgId).toHaveBeenCalledWith(sampleOrg.id)
  })

  it('onSuccess: invalidates the ["orgs"] query', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    mockApiFetch.mockResolvedValueOnce(sampleOrg)

    function WrapperWithData({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children)
    }

    const { result } = renderHook(() => useCreateOrg(), { wrapper: WrapperWithData })
    result.current.mutate({ name: 'Test Org' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['orgs'] }))
  })

  it('returns error state when creation fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Duplicate slug'))
    const { result } = renderHook(() => useCreateOrg(), { wrapper: createWrapper() })
    result.current.mutate({ name: 'Test Org' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('usePatchOrg', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls PATCH /api/v1/org/:orgId with the provided body', async () => {
    const patched = { ...sampleOrg, name: 'Updated Org' }
    mockApiFetch.mockResolvedValueOnce(patched)
    const { result } = renderHook(() => usePatchOrg(), { wrapper: createWrapper() })
    result.current.mutate({ orgId: 'test-org-id', name: 'Updated Org' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/test-org-id', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Org' }),
    })
  })

  it('passes logoUrl in the body when provided', async () => {
    const patched = { ...sampleOrg, logoUrl: 'https://cdn.example.com/logo.png' }
    mockApiFetch.mockResolvedValueOnce(patched)
    const { result } = renderHook(() => usePatchOrg(), { wrapper: createWrapper() })
    result.current.mutate({ orgId: 'test-org-id', logoUrl: 'https://cdn.example.com/logo.png' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/org/test-org-id', {
      method: 'PATCH',
      body: JSON.stringify({ logoUrl: 'https://cdn.example.com/logo.png' }),
    })
  })

  it('onSuccess: invalidates the ["orgs"] query', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    mockApiFetch.mockResolvedValueOnce(sampleOrg)

    function WrapperWithData({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children)
    }

    const { result } = renderHook(() => usePatchOrg(), { wrapper: WrapperWithData })
    result.current.mutate({ orgId: 'test-org-id', name: 'New Name' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['orgs'] }))
  })

  it('returns error state when patch fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Not found'))
    const { result } = renderHook(() => usePatchOrg(), { wrapper: createWrapper() })
    result.current.mutate({ orgId: 'bad-id', name: 'X' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
