import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { Draft, DraftDetail } from '@/types/draft'

// Single mock declaration for api
const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }))

// Import hooks after mocking
const { useDrafts, useDraft, useApproveDraft, useDiscardDraft, useUpdateDraft } = await import(
  '../useDrafts'
)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const sampleDraft: Draft = {
  id: 'draft-1',
  title: 'Test Draft',
  content: 'Content',
  status: 'PENDING_REVIEW',
  publishedUrl: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  clusterId: 'cluster-1',
  cluster: { _count: { tickets: 3 } },
}

const sampleDetail: DraftDetail = {
  ...sampleDraft,
  cluster: {
    id: 'cluster-1',
    tickets: [
      {
        id: 'ticket-1',
        subject: 'Problem',
        source: 'zendesk',
        createdAt: '2026-01-10T00:00:00Z',
      },
    ],
  },
}

describe('useDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches list of drafts with status filter', async () => {
    mockApiFetch.mockResolvedValueOnce([sampleDraft])
    const { result } = renderHook(() => useDrafts('PENDING_REVIEW'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([sampleDraft])
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/drafts?status=PENDING_REVIEW')
  })

  it('fetches drafts without status filter', async () => {
    mockApiFetch.mockResolvedValueOnce([sampleDraft])
    const { result } = renderHook(() => useDrafts(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/drafts')
  })
})

describe('useDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches a single draft by ID', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleDetail)
    const { result } = renderHook(() => useDraft('draft-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(sampleDetail)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/drafts/draft-1')
  })

  it('does not fetch when id is empty', () => {
    const { result } = renderHook(() => useDraft(''), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useApproveDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls approve endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce({ ...sampleDetail, status: 'APPROVED' })
    const { result } = renderHook(() => useApproveDraft(), { wrapper: createWrapper() })
    result.current.mutate('draft-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/drafts/draft-1/approve', {
      method: 'POST',
    })
  })
})

describe('useDiscardDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls discard endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce({ ...sampleDetail, status: 'DISCARDED' })
    const { result } = renderHook(() => useDiscardDraft(), { wrapper: createWrapper() })
    result.current.mutate('draft-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/drafts/draft-1/discard', {
      method: 'POST',
    })
  })
})

describe('useUpdateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls patch endpoint with updated fields', async () => {
    mockApiFetch.mockResolvedValueOnce({ ...sampleDetail, title: 'New Title' })
    const { result } = renderHook(() => useUpdateDraft(), { wrapper: createWrapper() })
    result.current.mutate({ id: 'draft-1', title: 'New Title', content: 'New Content' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/drafts/draft-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title', content: 'New Content' }),
    })
  })
})
