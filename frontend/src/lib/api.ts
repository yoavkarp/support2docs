import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = auth.currentUser ? await getIdToken(auth.currentUser) : null
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? ''}${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    }
  )
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}
