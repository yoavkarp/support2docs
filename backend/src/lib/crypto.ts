/**
 * AES-256-GCM encryption helpers for storing sensitive org secrets at rest.
 *
 * Key: ORG_SECRETS_KEY env var — must be a 64-char hex string (32 bytes).
 * If not set, dev mode: values are stored and returned as plaintext (with a
 * console warning). Never deploy without ORG_SECRETS_KEY set.
 *
 * Stored format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit recommended for GCM
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer | null {
  const hex = process.env['ORG_SECRETS_KEY']
  if (!hex) return null
  if (hex.length !== 64) {
    throw new Error('ORG_SECRETS_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  if (!key) {
    // Dev mode: store plaintext — warn but don't break startup
    console.warn('[crypto] ORG_SECRETS_KEY not set — storing secret as plaintext (dev mode only)')
    return plaintext
  }
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored: string): string {
  const key = getKey()
  if (!key) {
    // Dev mode: value was stored as plaintext
    return stored
  }
  // If the value doesn't look like our encrypted format, treat as legacy plaintext
  const parts = stored.split(':')
  if (parts.length !== 3) {
    return stored
  }
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

/**
 * Masks a secret value for API responses.
 * Returns "****<last4>" for values longer than 4 chars, "****" for values
 * of 4 chars or fewer (avoids leaking the full value), null otherwise.
 */
export function mask(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  if (value.length <= 4) return '****'
  return '****' + value.slice(-4)
}
