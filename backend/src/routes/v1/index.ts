import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { webhooksRouter } from './webhooks.js'
import { draftsRouter } from './drafts.js'
import { statsRouter } from './stats.js'
import { orgRouter } from './org.js'

export const v1Router = Router()

v1Router.use('/webhooks', webhooksRouter)
v1Router.use('/drafts', requireAuth, draftsRouter)
// Stats endpoints are public (read-only aggregate metrics — no auth required)
v1Router.use('/stats', statsRouter)
v1Router.use('/org', requireAuth, orgRouter)
