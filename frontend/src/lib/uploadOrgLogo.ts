import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'

// A05 — Allowed image MIME types and their canonical file extensions.
// Only these types are accepted; the extension stored in Firebase Storage is
// derived from this map, not from the attacker-controlled file.name or file.type,
// preventing path traversal and SVG-script injection via crafted filenames.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    throw new Error('Unsupported image type. Allowed: PNG, JPEG, WebP, GIF')
  }
  // Use the canonical extension from our allowlist — never from file.name.
  // contentType is also set explicitly so Firebase Storage serves the correct
  // MIME type regardless of what the client claims.
  const storageRef = ref(storage, `org-logos/${orgId}/logo.${ext}`)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(storageRef)
}
