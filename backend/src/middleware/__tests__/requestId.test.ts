import { describe, it, expect, vi, beforeEach } from 'vitest'
import { type Request, type Response, type NextFunction } from 'express'

// Mock uuid so we can control the generated value
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-v4'),
}))

import { requestIdMiddleware } from '../requestId.js'
import { v4 as uuidv4 } from 'uuid'

function makeRes(): Response {
  const headers: Record<string, string> = {}
  const res = {
    locals: {} as Record<string, unknown>,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value
    }),
    _headers: headers,
  }
  return res as unknown as Response
}

describe('requestIdMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the X-Request-Id header value when it is present in the request', () => {
    const req = { headers: { 'x-request-id': 'client-provided-id' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(res.locals['requestId']).toBe('client-provided-id')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-provided-id')
    expect(next).toHaveBeenCalledOnce()
    // uuid generator should NOT have been called
    expect(uuidv4).not.toHaveBeenCalled()
  })

  it('generates a new uuid v4 when X-Request-Id header is absent', () => {
    const req = { headers: {} } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(uuidv4).toHaveBeenCalledOnce()
    expect(res.locals['requestId']).toBe('generated-uuid-v4')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'generated-uuid-v4')
    expect(next).toHaveBeenCalledOnce()
  })

  it('generates a new uuid v4 when X-Request-Id header is an empty string', () => {
    const req = { headers: { 'x-request-id': '' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(uuidv4).toHaveBeenCalledOnce()
    expect(res.locals['requestId']).toBe('generated-uuid-v4')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'generated-uuid-v4')
    expect(next).toHaveBeenCalledOnce()
  })

  it('uses the first element when X-Request-Id header is an array (multi-value)', () => {
    // A01 — when the header arrives as a multi-value array, use the first element
    // if it is non-empty and within the 128-char limit (prevents log-forging).
    const req = { headers: { 'x-request-id': ['id-a', 'id-b'] } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    // uuid generator should NOT be called — 'id-a' is valid
    expect(uuidv4).not.toHaveBeenCalled()
    expect(res.locals['requestId']).toBe('id-a')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'id-a')
    expect(next).toHaveBeenCalledOnce()
  })

  it('generates a new uuid v4 when X-Request-Id header is an array whose first element is too long', () => {
    // A01 — oversized IDs (>128 chars) must be regenerated to prevent log-line injection.
    const longId = 'x'.repeat(129)
    const req = { headers: { 'x-request-id': [longId, 'id-b'] } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(uuidv4).toHaveBeenCalledOnce()
    expect(res.locals['requestId']).toBe('generated-uuid-v4')
    expect(next).toHaveBeenCalledOnce()
  })

  it('generates a new uuid v4 when X-Request-Id header exceeds 128 characters', () => {
    // A01 — oversized IDs must be regenerated to prevent log-line injection.
    const longId = 'a'.repeat(129)
    const req = { headers: { 'x-request-id': longId } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(uuidv4).toHaveBeenCalledOnce()
    expect(res.locals['requestId']).toBe('generated-uuid-v4')
    expect(next).toHaveBeenCalledOnce()
  })

  it('accepts an X-Request-Id header that is exactly 128 characters', () => {
    const exactId = 'b'.repeat(128)
    const req = { headers: { 'x-request-id': exactId } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(uuidv4).not.toHaveBeenCalled()
    expect(res.locals['requestId']).toBe(exactId)
    expect(next).toHaveBeenCalledOnce()
  })

  it('sets X-Request-Id on the response so callers can correlate logs', () => {
    const req = { headers: { 'x-request-id': 'trace-xyz' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-xyz')
  })

  it('sets res.locals.requestId for use in downstream handlers', () => {
    const req = { headers: { 'x-request-id': 'downstream-id' } } as unknown as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    requestIdMiddleware(req, res, next)

    expect(res.locals['requestId']).toBe('downstream-id')
  })

  it('always calls next() regardless of whether a request id was provided', () => {
    const reqWithId = { headers: { 'x-request-id': 'some-id' } } as unknown as Request
    const reqWithout = { headers: {} } as unknown as Request
    const next1 = vi.fn() as NextFunction
    const next2 = vi.fn() as NextFunction

    requestIdMiddleware(reqWithId, makeRes(), next1)
    requestIdMiddleware(reqWithout, makeRes(), next2)

    expect(next1).toHaveBeenCalledOnce()
    expect(next2).toHaveBeenCalledOnce()
  })
})
