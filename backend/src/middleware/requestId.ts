import { type Request, type Response, type NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

/**
 * X-Request-Id propagation middleware (A09 — Security Logging and Monitoring).
 * - Reads `X-Request-Id` from the incoming request header if present.
 * - Generates a new uuidv4 if the header is absent.
 * - Attaches the value to `res.locals.requestId` for use in downstream handlers/workers.
 * - Sets `X-Request-Id` on the response so callers can correlate their logs.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id']
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4()
  res.locals['requestId'] = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}
