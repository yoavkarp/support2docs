import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { webhooksRouter } from './webhooks.js'
import { draftsRouter } from './drafts.js'

export const v1Router = Router()

v1Router.use('/webhooks', webhooksRouter)
v1Router.use('/drafts', requireAuth, draftsRouter)
