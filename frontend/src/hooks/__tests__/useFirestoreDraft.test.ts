import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { onSnapshot } from 'firebase/firestore'
import { useFirestoreDraft } from '../useFirestoreDraft'

// Mock firebase/firestore
const mockUnsubscribe = vi.fn()
let capturedCallback: ((snap: unknown) => void) | null = null
let capturedErrorCallback: ((err: unknown) => void) | null = null

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  onSnapshot: vi.fn(
    (
      _ref: unknown,
      successCb: (snap: unknown) => void,
      errorCb: (err: unknown) => void
    ) => {
      capturedCallback = successCb
      capturedErrorCallback = errorCb
      return mockUnsubscribe
    }
  ),
}))

vi.mock('@/lib/firebase', () => ({ db: {} }))

describe('useFirestoreDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedCallback = null
    capturedErrorCallback = null
  })

  it('starts with isLive false and no data', () => {
    const { result } = renderHook(() => useFirestoreDraft('draft-1'))
    expect(result.current.isLive).toBe(false)
    expect(result.current.firestoreData).toBeNull()
  })

  it('sets isLive to true when snapshot arrives', () => {
    const { result } = renderHook(() => useFirestoreDraft('draft-1'))
    act(() => {
      capturedCallback?.({ exists: () => false })
    })
    expect(result.current.isLive).toBe(true)
  })

  it('updates firestoreData when snapshot has data', () => {
    const { result } = renderHook(() => useFirestoreDraft('draft-1'))
    const mockData = { title: 'Updated Title', content: 'New content' }
    act(() => {
      capturedCallback?.({ exists: () => true, data: () => mockData })
    })
    expect(result.current.firestoreData).toEqual(mockData)
    expect(result.current.isLive).toBe(true)
  })

  it('sets isLive to false on error', () => {
    const { result } = renderHook(() => useFirestoreDraft('draft-1'))
    act(() => {
      capturedCallback?.({ exists: () => false })
    })
    expect(result.current.isLive).toBe(true)
    act(() => {
      capturedErrorCallback?.(new Error('Firestore error'))
    })
    expect(result.current.isLive).toBe(false)
  })

  it('calls unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => useFirestoreDraft('draft-1'))
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('does not set up listener when id is empty', () => {
    renderHook(() => useFirestoreDraft(''))
    expect(vi.mocked(onSnapshot)).not.toHaveBeenCalled()
  })
})
