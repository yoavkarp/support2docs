import { type Request, type Response, type NextFunction } from 'express'
import { adminAuth } from '../lib/firebase-admin.js'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  const idToken = authHeader.slice(7)
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    res.locals['uid'] = decoded.uid
    // Propagate custom claims so downstream middleware (requireAdmin) can check them
    // without a second verifyIdToken call.
    res.locals['claims'] = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ---------------------------------------------------------------------------
// A01 — requireAdmin
//
// Checks that the authenticated user has the `admin: true` Firebase custom claim.
// Must be applied AFTER requireAuth (which populates res.locals['claims']).
//
// Usage: set the claim on a user via Firebase Admin SDK:
//   await adminAuth.setCustomUserClaims(uid, { admin: true })
//
// Approve and discard are irreversible state transitions — restrict them to
// admin users so that any authenticated reviewer cannot arbitrarily publish
// or discard another reviewer's drafts (IDOR / A01 mitigation).
// ---------------------------------------------------------------------------
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const claims = res.locals['claims'] as Record<string, unknown> | undefined
  if (!claims?.['admin']) {
    res.status(403).json({ error: 'Forbidden — admin role required' })
    return
  }
  next()
}
