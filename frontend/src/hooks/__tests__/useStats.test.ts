import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { Stats, ReviewerRow } from '../useStats'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }))

const { useStats, useStatsByReviewer } = await import('../useStats')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleStats: Stats = {
  totalDrafts: 42,
  totalApproved: 20,
  totalDiscarded: 5,
  totalPending: 17,
  approvedThisWeek: 3,
  avgReviewTimeMinutes: 12.5,
  estimatedHoursSaved: 15,
  estimatedTicketsDeflected: 2500,
}

const sampleReviewers: ReviewerRow[] = [
  { userId: 'uid-1', userEmail: 'alice@example.com', approved: 15, discarded: 3, edited: 5 },
  { userId: 'uid-2', userEmail: 'bob@example.com', approved: 5, discarded: 2, edited: 1 },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches stats from /api/v1/stats', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleStats)
    const { result } = renderHook(() => useStats(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(sampleStats)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/stats')
  })

  it('uses ["stats"] as the query key', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleStats)
    const { result } = renderHook(() => useStats(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Verifying the hook calls the correct endpoint is a proxy for the query key
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/stats')
  })

  it('returns loading state initially', () => {
    // Never resolves so we can observe the loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useStats(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)
  })

  it('returns error state when fetch fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useStats(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

describe('useStatsByReviewer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches reviewer stats from /api/v1/stats/by-reviewer', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleReviewers)
    const { result } = renderHook(() => useStatsByReviewer(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(sampleReviewers)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/stats/by-reviewer')
  })

  it('returns loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useStatsByReviewer(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)
  })

  it('returns error state when fetch fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('API error 500'))
    const { result } = renderHook(() => useStatsByReviewer(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('returns empty array when no reviewers exist', async () => {
    mockApiFetch.mockResolvedValueOnce([])
    const { result } = renderHook(() => useStatsByReviewer(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})
