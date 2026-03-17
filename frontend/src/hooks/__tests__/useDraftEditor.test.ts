import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftEditor } from '../useDraftEditor'

const mockMutate = vi.fn()

vi.mock('../useDrafts', () => ({
  useUpdateDraft: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
}))

describe('useDraftEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with provided title and content', () => {
    const { result } = renderHook(() =>
      useDraftEditor({ draftId: 'draft-1', initialTitle: 'My Title', initialContent: 'My Content' })
    )
    expect(result.current.title).toBe('My Title')
    expect(result.current.content).toBe('My Content')
  })

  it('updates title on handleTitleChange', () => {
    const { result } = renderHook(() =>
      useDraftEditor({ draftId: 'draft-1', initialTitle: 'Old', initialContent: '' })
    )
    act(() => result.current.handleTitleChange('New Title'))
    expect(result.current.title).toBe('New Title')
  })

  it('updates content on handleContentChange', () => {
    const { result } = renderHook(() =>
      useDraftEditor({ draftId: 'draft-1', initialTitle: '', initialContent: 'Old content' })
    )
    act(() => result.current.handleContentChange('New content'))
    expect(result.current.content).toBe('New content')
  })

  it('debounces save after 1 second on title change', () => {
    const { result } = renderHook(() =>
      useDraftEditor({ draftId: 'draft-1', initialTitle: 'Old', initialContent: 'Content' })
    )
    act(() => result.current.handleTitleChange('New Title'))
    expect(mockMutate).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'draft-1',
      title: 'New Title',
      content: 'Content',
    })
  })

  it('saves immediately on blur', () => {
    const { result } = renderHook(() =>
      useDraftEditor({ draftId: 'draft-1', initialTitle: 'Title', initialContent: 'Content' })
    )
    act(() => result.current.handleBlurSave())
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'draft-1',
      title: 'Title',
      content: 'Content',
    })
  })

  it('cancels pending debounce on blur and saves immediately', () => {
    const { result } = renderHook(() =>
      useDraftEditor({ draftId: 'draft-1', initialTitle: 'Old', initialContent: 'Content' })
    )
    act(() => result.current.handleTitleChange('New Title'))
    act(() => result.current.handleBlurSave())
    // Should only call once (the blur save), not twice
    expect(mockMutate).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(1000))
    // Still only one call
    expect(mockMutate).toHaveBeenCalledOnce()
  })
})
