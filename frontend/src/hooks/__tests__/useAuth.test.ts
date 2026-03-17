import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from '../useAuth'

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

import { onAuthStateChanged } from 'firebase/auth'

describe('useAuth', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('starts with loading=true and user=null', () => {
    vi.mocked(onAuthStateChanged).mockImplementation(() => () => {})
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('falls back to unauthenticated after 5s if Firebase does not respond', async () => {
    vi.mocked(onAuthStateChanged).mockImplementation(() => () => {})
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(result.current.loading).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('sets user and loading=false when Firebase returns an authenticated user', async () => {
    const mockUser = { uid: 'abc', email: 'test@test.com' }
    let capturedCallback: (u: unknown) => void

    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      capturedCallback = callback as (u: unknown) => void
      return () => {}
    })

    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)

    await act(async () => {
      capturedCallback(mockUser)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.user).toEqual(mockUser)
  })

  it('sets user=null and loading=false when not authenticated', async () => {
    let capturedCallback: (u: unknown) => void

    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      capturedCallback = callback as (u: unknown) => void
      return () => {}
    })

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      capturedCallback(null)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.user).toBeNull()
  })
})
