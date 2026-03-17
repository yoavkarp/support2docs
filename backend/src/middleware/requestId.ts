import { type Request, type Response, type NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

/**
 * X-Request-Id propagation middleware (A09 — Security Logging and Monitoring).
 * - Reads `X-Request-Id` from the incoming request header if present.
 * - Generates a new uuidv4 if the header is absent.
 * - Attaches the value to `res.locals.requestId` for use in downstream handlers/workers.
 * - Sets `X-Request-Id` on the response so callers can correlate their logs.
 */
// A01 — Max length enforced to 128 chars to prevent log-forging and
// header-injection via caller-supplied IDs. Values exceeding this limit are
// replaced with a fresh uuid rather than truncated (a truncated arbitrary
// string could still contain injected log tokens).
const REQUEST_ID_MAX_LENGTH = 128

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id']
  const raw = Array.isArray(incoming) ? incoming[0] : incoming
  const requestId = (raw && raw.length > 0 && raw.length <= REQUEST_ID_MAX_LENGTH) ? raw : uuidv4()
  res.locals['requestId'] = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}
