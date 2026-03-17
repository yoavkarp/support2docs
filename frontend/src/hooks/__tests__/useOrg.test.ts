import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { OrgSettings, OrgMember } from '../useOrg'

const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }))

vi.mock('@/contexts/OrgContext', () => ({
  useActiveOrg: () => ({ activeOrgId: 'test-org-id', setActiveOrgId: vi.fn() }),
}))

const {
  useOrgSettings,
  useOrgMembers,
  useUpdateOrgSettings,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
  useDeleteOrg,
} = await import('../useOrg')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
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
  beforeEach(() => vi.clearAllMocks())

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
})
