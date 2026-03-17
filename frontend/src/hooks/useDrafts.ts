import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { Draft, DraftDetail, DraftStatus } from '@/types/draft'

export function useDrafts(status?: DraftStatus) {
  return useQuery<Draft[]>({
    queryKey: ['drafts', status],
    queryFn: () =>
      apiFetch<Draft[]>(`/api/v1/drafts${status ? `?status=${status}` : ''}`),
  })
}

export function useDraft(id: string) {
  return useQuery<DraftDetail>({
    queryKey: ['drafts', id],
    queryFn: () => apiFetch<DraftDetail>(`/api/v1/drafts/${id}`),
    enabled: Boolean(id),
  })
}

export function useApproveDraft() {
  const queryClient = useQueryClient()
  return useMutation<DraftDetail, Error, string>({
    mutationFn: (id: string) =>
      apiFetch<DraftDetail>(`/api/v1/drafts/${id}/approve`, { method: 'POST' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['drafts'] })
      const previousDrafts = queryClient.getQueryData<Draft[]>(['drafts', 'PENDING_REVIEW'])
      if (previousDrafts) {
        queryClient.setQueryData<Draft[]>(
          ['drafts', 'PENDING_REVIEW'],
          previousDrafts.filter((d) => d.id !== id)
        )
      }
      return { previousDrafts }
    },
    onError: (_err, _id, context) => {
      const ctx = context as { previousDrafts?: Draft[] } | undefined
      if (ctx?.previousDrafts) {
        queryClient.setQueryData(['drafts', 'PENDING_REVIEW'], ctx.previousDrafts)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] })
    },
  })
}

export function useDiscardDraft() {
  const queryClient = useQueryClient()
  return useMutation<DraftDetail, Error, string>({
    mutationFn: (id: string) =>
      apiFetch<DraftDetail>(`/api/v1/drafts/${id}/discard`, { method: 'POST' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['drafts'] })
      const previousDrafts = queryClient.getQueryData<Draft[]>(['drafts', 'PENDING_REVIEW'])
      if (previousDrafts) {
        queryClient.setQueryData<Draft[]>(
          ['drafts', 'PENDING_REVIEW'],
          previousDrafts.filter((d) => d.id !== id)
        )
      }
      return { previousDrafts }
    },
    onError: (_err, _id, context) => {
      const ctx = context as { previousDrafts?: Draft[] } | undefined
      if (ctx?.previousDrafts) {
        queryClient.setQueryData(['drafts', 'PENDING_REVIEW'], ctx.previousDrafts)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] })
    },
  })
}

interface UpdateDraftPayload {
  id: string
  title?: string
  content?: string
}

export function useUpdateDraft() {
  const queryClient = useQueryClient()
  return useMutation<DraftDetail, Error, UpdateDraftPayload>({
    mutationFn: ({ id, title, content }: UpdateDraftPayload) =>
      apiFetch<DraftDetail>(`/api/v1/drafts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, content }),
      }),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['drafts', variables.id] })
    },
  })
}
