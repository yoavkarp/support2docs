import { type Request, type Response, type NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

/**
 * X-Request-Id propagation middleware (A09 — Security Logging and Monitoring).
 * - Reads `X-Request-Id` from the incoming request header if present.
 * - Generates a new uuidv4 if the header is absent.
 * - Attaches the value to `res.locals.requestId` for use in downstream handlers/workers.
 * - Sets `X-Request-Id` on the response so callers can correlate their logs.
 */
// A01 — Max length capped at 64 chars and newline/carriage-return characters
// stripped to prevent log-line injection and oversized response headers.
// Values exceeding the limit or containing control characters are replaced
// with a fresh uuid rather than truncated (a truncated arbitrary string could
// still contain injected log tokens).
const REQUEST_ID_MAX_LENGTH = 64

// Matches any carriage-return or newline character (log-injection vectors).
const CONTROL_CHAR_RE = /[\r\n]/

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id']
  const raw = Array.isArray(incoming) ? incoming[0] : incoming
  const isValid =
    raw != null &&
    raw.length > 0 &&
    raw.length <= REQUEST_ID_MAX_LENGTH &&
    !CONTROL_CHAR_RE.test(raw)
  const requestId = isValid ? raw : uuidv4()
  res.locals['requestId'] = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}
