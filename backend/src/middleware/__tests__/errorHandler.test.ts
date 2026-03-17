import { describe, it, expect, vi } from 'vitest'
import { type Request, type Response, type NextFunction } from 'express'
import { errorHandler } from '../errorHandler.js'

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn() },
}))

describe('errorHandler middleware', () => {
  it('responds with 500 and generic message', () => {
    const err = new Error('Something broke')
    const req = { path: '/api/v1/test' } as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response
    const next = vi.fn() as NextFunction

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
  })
})
