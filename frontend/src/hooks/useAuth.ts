import { useState, useEffect } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    // Fallback: treat as unauthenticated if Firebase doesn't respond within 5s
    const timeout = setTimeout(() => {
      setState({ user: null, loading: false })
    }, 5000)

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout)
      setState({ user, loading: false })
    })

    return () => {
      clearTimeout(timeout)
      unsubscribe()
    }
  }, [])

  return state
}
