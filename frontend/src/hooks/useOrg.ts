import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useActiveOrg } from '@/contexts/OrgContext'

export interface OrgSummary {
  id: string
  name: string
  slug: string
  role: 'ADMIN' | 'MEMBER'
  memberCount: number
  logoUrl: string | null
}

export function useOrgs(): UseQueryResult<OrgSummary[]> {
  return useQuery<OrgSummary[]>({
    queryKey: ['orgs'],
    queryFn: () => apiFetch<OrgSummary[]>('/api/v1/org'),
    staleTime: 60_000,
  })
}

export function useCreateOrg(): UseMutationResult<OrgSummary, unknown, { name: string }> {
  const queryClient = useQueryClient()
  const { setActiveOrgId } = useActiveOrg()
  return useMutation<OrgSummary, unknown, { name: string }>({
    mutationFn: (data) =>
      apiFetch<OrgSummary>('/api/v1/org', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      setActiveOrgId(data.id)
      void queryClient.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
}

export function useDeleteOrg(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient()
  const { activeOrgId, setActiveOrgId } = useActiveOrg()
  return useMutation<void, unknown, string>({
    mutationFn: async (orgId) => {
      await apiFetch<void>(`/api/v1/org/${orgId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: (_data, orgId) => {
      void queryClient.invalidateQueries({ queryKey: ['orgs'] }).then(() => {
        // If the deleted org was the active one, switch to the first remaining org
        if (orgId === activeOrgId) {
          const orgs = queryClient.getQueryData<OrgSummary[]>(['orgs'])
          const firstOrg = orgs?.[0]
          if (firstOrg) {
            setActiveOrgId(firstOrg.id)
          }
        }
      })
    },
  })
}

export function usePatchOrg(): UseMutationResult<
  OrgSummary,
  unknown,
  { orgId: string; name?: string; logoUrl?: string | null }
> {
  const queryClient = useQueryClient()
  return useMutation<
    OrgSummary,
    unknown,
    { orgId: string; name?: string; logoUrl?: string | null }
  >({
    mutationFn: ({ orgId, ...body }) =>
      apiFetch<OrgSummary>(`/api/v1/org/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
}

export interface OrgSettings {
  zendeskSubdomain: string | null
  zendeskApiKey: string | null
  intercomToken: string | null
  kbPublishUrl: string | null
  clusterThreshold: number
  minClusterSize: number
}

export interface OrgMember {
  userId: string | null
  userEmail: string
  role: 'ADMIN' | 'MEMBER'
  joinedAt: string
}

export function useOrgSettings(): UseQueryResult<OrgSettings> {
  const { activeOrgId } = useActiveOrg()
  return useQuery<OrgSettings>({
    queryKey: ['org', 'settings', activeOrgId],
    queryFn: () => apiFetch<OrgSettings>('/api/v1/org/settings'),
    staleTime: 60_000,
    enabled: !!activeOrgId,
  })
}

export function useOrgMembers(): UseQueryResult<OrgMember[]> {
  const { activeOrgId } = useActiveOrg()
  return useQuery<OrgMember[]>({
    queryKey: ['org', 'members', activeOrgId],
    queryFn: () => apiFetch<OrgMember[]>('/api/v1/org/members'),
    staleTime: 60_000,
    enabled: !!activeOrgId,
  })
}

export function useUpdateOrgSettings(): UseMutationResult<
  OrgSettings,
  unknown,
  Partial<OrgSettings>
> {
  const queryClient = useQueryClient()
  const { activeOrgId } = useActiveOrg()
  return useMutation<OrgSettings, unknown, Partial<OrgSettings>>({
    mutationFn: (data) =>
      apiFetch<OrgSettings>('/api/v1/org/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['org', 'settings', activeOrgId] })
    },
  })
}

export function useInviteMember(): UseMutationResult<
  OrgMember,
  unknown,
  { email: string }
> {
  const queryClient = useQueryClient()
  const { activeOrgId } = useActiveOrg()
  return useMutation<OrgMember, unknown, { email: string }>({
    mutationFn: (data) =>
      apiFetch<OrgMember>('/api/v1/org/members/invite', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['org', 'members', activeOrgId] })
    },
  })
}

export function useUpdateMemberRole(): UseMutationResult<
  OrgMember,
  unknown,
  { userId: string; role: 'ADMIN' | 'MEMBER' }
> {
  const queryClient = useQueryClient()
  const { activeOrgId } = useActiveOrg()
  return useMutation<OrgMember, unknown, { userId: string; role: 'ADMIN' | 'MEMBER' }>({
    mutationFn: ({ userId, role }) =>
      apiFetch<OrgMember>(`/api/v1/org/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['org', 'members', activeOrgId] })
    },
  })
}

export function useRemoveMember(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient()
  const { activeOrgId } = useActiveOrg()
  return useMutation<void, unknown, string>({
    mutationFn: async (userId) => {
      await apiFetch<void>(`/api/v1/org/members/${userId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['org', 'members', activeOrgId] })
    },
  })
}
