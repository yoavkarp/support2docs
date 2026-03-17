import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Firebase Storage SDK ────────────────────────────────────────────────
const mockRef = vi.fn()
const mockUploadBytes = vi.fn()
const mockGetDownloadURL = vi.fn()

vi.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  uploadBytes: (...args: unknown[]) => mockUploadBytes(...args),
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
}))

vi.mock('@/lib/firebase', () => ({
  storage: { /* fake storage instance */ },
}))

// ── Import after mocks ───────────────────────────────────────────────────────
import { uploadOrgLogo } from '../uploadOrgLogo'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(type: string, name = 'logo.png', size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type })
  return new File([blob], name, { type })
}

const DOWNLOAD_URL = 'https://firebasestorage.googleapis.com/v0/b/test/o/org-logos%2Forg-1%2Flogo.png'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('uploadOrgLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRef.mockReturnValue({ _path: 'fake-ref' })
    mockUploadBytes.mockResolvedValue({ ref: { _path: 'fake-ref' } })
    mockGetDownloadURL.mockResolvedValue(DOWNLOAD_URL)
  })

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('uploads a PNG and returns the download URL', async () => {
    const file = makeFile('image/png', 'logo.png')
    const url = await uploadOrgLogo('org-1', file)
    expect(url).toBe(DOWNLOAD_URL)
  })

  it('uploads a JPEG and returns the download URL', async () => {
    const file = makeFile('image/jpeg', 'photo.jpg')
    const url = await uploadOrgLogo('org-1', file)
    expect(url).toBe(DOWNLOAD_URL)
  })

  it('uploads a WebP file', async () => {
    const file = makeFile('image/webp', 'image.webp')
    const url = await uploadOrgLogo('org-1', file)
    expect(url).toBe(DOWNLOAD_URL)
  })

  it('uploads a GIF file', async () => {
    const file = makeFile('image/gif', 'anim.gif')
    const url = await uploadOrgLogo('org-1', file)
    expect(url).toBe(DOWNLOAD_URL)
  })

  // ── Storage path construction ────────────────────────────────────────────────

  it('constructs the storage path from orgId and canonical extension', async () => {
    const file = makeFile('image/jpeg', 'myphoto.jpg')
    await uploadOrgLogo('abc-123', file)
    expect(mockRef).toHaveBeenCalledWith(
      expect.anything(),
      'org-logos/abc-123/logo.jpg',
    )
  })

  it('uses "jpg" extension for image/jpeg regardless of file.name extension', async () => {
    const file = makeFile('image/jpeg', 'sneaky.png') // mismatched name
    await uploadOrgLogo('org-1', file)
    expect(mockRef).toHaveBeenCalledWith(
      expect.anything(),
      'org-logos/org-1/logo.jpg', // extension from MIME map, not file.name
    )
  })

  it('uses "png" extension for image/png', async () => {
    const file = makeFile('image/png', 'logo.png')
    await uploadOrgLogo('org-1', file)
    expect(mockRef).toHaveBeenCalledWith(expect.anything(), 'org-logos/org-1/logo.png')
  })

  it('uses "webp" extension for image/webp', async () => {
    const file = makeFile('image/webp', 'logo.webp')
    await uploadOrgLogo('org-1', file)
    expect(mockRef).toHaveBeenCalledWith(expect.anything(), 'org-logos/org-1/logo.webp')
  })

  it('uses "gif" extension for image/gif', async () => {
    const file = makeFile('image/gif', 'logo.gif')
    await uploadOrgLogo('org-1', file)
    expect(mockRef).toHaveBeenCalledWith(expect.anything(), 'org-logos/org-1/logo.gif')
  })

  // ── contentType set explicitly ───────────────────────────────────────────────

  it('sets contentType from MIME type, not from file.name', async () => {
    const file = makeFile('image/webp', 'image.xyz')
    await uploadOrgLogo('org-1', file)
    expect(mockUploadBytes).toHaveBeenCalledWith(
      expect.anything(),
      file,
      { contentType: 'image/webp' },
    )
  })

  // ── MIME-type rejection ──────────────────────────────────────────────────────

  it('throws for image/svg+xml (XSS risk)', async () => {
    const file = makeFile('image/svg+xml', 'evil.svg')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Unsupported image type',
    )
    expect(mockUploadBytes).not.toHaveBeenCalled()
  })

  it('throws for application/pdf', async () => {
    const file = makeFile('application/pdf', 'doc.pdf')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Unsupported image type',
    )
  })

  it('throws for text/html', async () => {
    const file = makeFile('text/html', 'page.html')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Unsupported image type',
    )
  })

  it('throws for empty MIME type', async () => {
    const file = makeFile('', 'no-type')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Unsupported image type',
    )
    expect(mockUploadBytes).not.toHaveBeenCalled()
  })

  it('throws for image/tiff (not in allowlist)', async () => {
    const file = makeFile('image/tiff', 'photo.tiff')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Unsupported image type',
    )
  })

  // ── Firebase errors propagated ───────────────────────────────────────────────

  it('propagates Firebase uploadBytes error', async () => {
    mockUploadBytes.mockRejectedValue(new Error('Firebase: storage/unauthorized'))
    const file = makeFile('image/png', 'logo.png')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Firebase: storage/unauthorized',
    )
  })

  it('propagates Firebase getDownloadURL error', async () => {
    mockGetDownloadURL.mockRejectedValue(new Error('Firebase: storage/object-not-found'))
    const file = makeFile('image/png', 'logo.png')
    await expect(uploadOrgLogo('org-1', file)).rejects.toThrow(
      'Firebase: storage/object-not-found',
    )
  })
})
