import { useState, useEffect, useRef } from 'react'
import { useUpdateDraft } from '@/hooks/useDrafts'

interface UseDraftEditorOptions {
  draftId: string
  initialTitle: string
  initialContent: string
  firestoreTitle?: string
  firestoreContent?: string
}

const DEBOUNCE_MS = 1000

/**
 * Manages local edit state for a draft and auto-saves on blur with a 1s debounce.
 * Also accepts Firestore real-time overrides from another user's edits.
 */
export function useDraftEditor({
  draftId,
  initialTitle,
  initialContent,
  firestoreTitle,
  firestoreContent,
}: UseDraftEditorOptions) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const { mutate: updateDraft, isPending: isSaving } = useUpdateDraft()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync Firestore real-time updates when another user edits
  useEffect(() => {
    if (firestoreTitle !== undefined && firestoreTitle !== title) {
      setTitle(firestoreTitle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestoreTitle])

  useEffect(() => {
    if (firestoreContent !== undefined && firestoreContent !== content) {
      setContent(firestoreContent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestoreContent])

  function scheduleSave(newTitle: string, newContent: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateDraft({ id: draftId, title: newTitle, content: newContent })
    }, DEBOUNCE_MS)
  }

  function handleTitleChange(value: string) {
    setTitle(value)
    scheduleSave(value, content)
  }

  function handleContentChange(value: string) {
    setContent(value)
    scheduleSave(title, value)
  }

  function handleBlurSave() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    updateDraft({ id: draftId, title, content })
  }

  return {
    title,
    content,
    isSaving,
    handleTitleChange,
    handleContentChange,
    handleBlurSave,
  }
}
