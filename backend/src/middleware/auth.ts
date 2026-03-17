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
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
