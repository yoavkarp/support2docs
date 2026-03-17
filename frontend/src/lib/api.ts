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
        ...(localStorage.getItem('activeOrgId') ? { 'X-Org-Id': localStorage.getItem('activeOrgId')! } : {}),
        ...options?.headers,
      },
    }
  )
  if (!res.ok) {
    let serverMessage: string | undefined
    try {
      const body = await res.json() as { error?: string }
      serverMessage = body?.error
    } catch { /* non-JSON error body */ }
    throw new Error(serverMessage ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}
