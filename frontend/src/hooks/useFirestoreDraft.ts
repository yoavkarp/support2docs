import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface FirestoreDraftFields {
  title?: string
  content?: string
  status?: string
  updatedAt?: string
}

interface UseFirestoreDraftResult {
  firestoreData: FirestoreDraftFields | null
  isLive: boolean
}

/**
 * Subscribe to a Firestore draft document for real-time collaborative sync.
 * Returns the latest Firestore fields and a boolean indicating the connection is live.
 */
export function useFirestoreDraft(draftId: string): UseFirestoreDraftResult {
  const [firestoreData, setFirestoreData] = useState<FirestoreDraftFields | null>(null)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    if (!draftId) return

    const ref = doc(db, 'drafts', draftId)
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setIsLive(true)
        if (snapshot.exists()) {
          setFirestoreData(snapshot.data() as FirestoreDraftFields)
        }
      },
      () => {
        // On error, mark as not live
        setIsLive(false)
      }
    )

    return () => {
      unsubscribe()
      setIsLive(false)
    }
  }, [draftId])

  return { firestoreData, isLive }
}
