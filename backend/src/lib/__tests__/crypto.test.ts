import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mask, encrypt, decrypt } from '../crypto.js'

// ---------------------------------------------------------------------------
// mask()
// ---------------------------------------------------------------------------
describe('mask()', () => {
  it('returns null for null input', () => {
    expect(mask(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(mask(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(mask('')).toBeNull()
  })

  it('returns "****" (no suffix) for a 1-char value — A04 fix', () => {
    expect(mask('a')).toBe('****')
  })

  it('returns "****" (no suffix) for a 2-char value — A04 fix', () => {
    expect(mask('ab')).toBe('****')
  })

  it('returns "****" (no suffix) for a 3-char value — A04 fix', () => {
    expect(mask('abc')).toBe('****')
  })

  it('returns "****" (no suffix) for exactly 4 chars — A04 fix', () => {
    expect(mask('abcd')).toBe('****')
  })

  it('returns "****" + last 4 chars for a 5-char value', () => {
    expect(mask('abcde')).toBe('****bcde')
  })

  it('returns "****" + last 4 chars for a long value', () => {
    expect(mask('supersecretkey1234')).toBe('****1234')
  })

  it('returns "****" + last 4 chars for exactly 5 chars', () => {
    expect(mask('12345')).toBe('****2345')
  })
})

// ---------------------------------------------------------------------------
// encrypt() / decrypt() — round-trip
// ---------------------------------------------------------------------------
describe('encrypt() / decrypt() round-trip', () => {
  const VALID_KEY = 'a'.repeat(64) // 64-char hex string (32 bytes of 0xAA)

  beforeEach(() => {
    process.env['ORG_SECRETS_KEY'] = VALID_KEY
  })

  afterEach(() => {
    delete process.env['ORG_SECRETS_KEY']
  })

  it('encrypts and decrypts a plaintext value correctly', () => {
    const plaintext = 'my-secret-api-key'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertexts for the same input (random IV)', () => {
    const plaintext = 'same-value'
    const c1 = encrypt(plaintext)
    const c2 = encrypt(plaintext)
    expect(c1).not.toBe(c2)
  })

  it('stored format contains 3 colon-separated hex parts', () => {
    const ciphertext = encrypt('test')
    const parts = ciphertext.split(':')
    expect(parts).toHaveLength(3)
    // Each part should be a non-empty hex string
    parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/))
  })

  it('decrypt treats a non-encrypted string as legacy plaintext', () => {
    // Values stored before encryption was enabled have no colon structure
    expect(decrypt('plain-legacy-value')).toBe('plain-legacy-value')
  })
})

describe('encrypt() / decrypt() — dev mode (no ORG_SECRETS_KEY)', () => {
  beforeEach(() => {
    delete process.env['ORG_SECRETS_KEY']
  })

  it('encrypt returns plaintext in dev mode', () => {
    const plaintext = 'dev-secret'
    expect(encrypt(plaintext)).toBe(plaintext)
  })

  it('decrypt returns stored value as-is in dev mode', () => {
    expect(decrypt('dev-stored')).toBe('dev-stored')
  })
})
