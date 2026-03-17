import { describe, it, expect, vi, beforeEach } from 'vitest'
import { type Request, type Response, type NextFunction } from 'express'

vi.mock('../../lib/firebase-admin.js', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
}))

import { requireAuth } from '../auth.js'
import { adminAuth } from '../../lib/firebase-admin.js'

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {} as Record<string, unknown>,
  }
  return res as unknown as Response
}

describe('requireAuth middleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when Authorization header is missing', async () => {
    const req = { headers: {} } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token does not start with Bearer', async () => {
    const req = { headers: { authorization: 'Basic abc123' } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next and sets uid when token is valid', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'user-123' } as never)
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.locals['uid']).toBe('user-123')
  })

  it('returns 401 when token verification fails', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('Token expired'))
    const req = { headers: { authorization: 'Bearer bad-token' } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' })
    expect(next).not.toHaveBeenCalled()
  })
})
