import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock firebase before importing api
vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: null,
  },
}))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}))

describe('apiFetch', () => {
  const mockFetch = vi.fn()
  const originalFetch = window.fetch

  beforeEach(() => {
    window.fetch = mockFetch
  })

  afterEach(() => {
    window.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('calls fetch with the correct path and Content-Type header', async () => {
    const { apiFetch } = await import('@/lib/api')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    } as Response)

    await apiFetch('/api/v1/drafts')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/drafts')
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('throws an Error when response is not ok', async () => {
    const { apiFetch } = await import('@/lib/api')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as Response)

    await expect(apiFetch('/api/v1/drafts/nonexistent')).rejects.toThrow('API error 404')
  })

  it('returns parsed JSON on success', async () => {
    vi.resetModules()
    vi.doMock('@/lib/firebase', () => ({ auth: { currentUser: null } }))
    vi.doMock('firebase/auth', () => ({ getIdToken: vi.fn() }))

    const { apiFetch } = await import('@/lib/api')
    const mockData = [{ id: '1', title: 'Draft' }]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response)

    const result = await apiFetch<typeof mockData>('/api/v1/drafts')
    expect(result).toEqual(mockData)
  })

  it('includes Authorization header when user is logged in', async () => {
    vi.resetModules()
    vi.doMock('@/lib/firebase', () => ({
      auth: { currentUser: { uid: 'user-1' } },
    }))
    vi.doMock('firebase/auth', () => ({
      getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    }))

    const { apiFetch } = await import('@/lib/api')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    await apiFetch('/api/v1/drafts')
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer mock-id-token'
    )
  })
})
