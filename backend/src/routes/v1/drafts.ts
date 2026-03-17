import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

export const draftsRouter = Router()

// --- A05: Injection / A01: Broken Access Control --------------------------------
// All query params and request bodies are validated with Zod before use.
// Pagination is capped to prevent resource-exhaustion attacks.
// -------------------------------------------------------------------------------

const DraftStatusSchema = z.enum(['PENDING_REVIEW', 'APPROVED', 'DISCARDED'])

const ListQuerySchema = z.object({
  status: DraftStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const PatchBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().min(1).max(100_000).optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: 'At least one of title or content must be provided',
  })

draftsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() })
      return
    }
    const { status, page, limit } = parsed.data

    const drafts = await prisma.draft.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { cluster: { include: { tickets: { select: { id: true } } } } },
    })

    res.json({ data: drafts, page, limit })
  } catch (err) {
    next(err)
  }
})

draftsRouter.get('/:id', async (req, res, next) => {
  try {
    const draft = await prisma.draft.findUnique({
      where: { id: req.params['id'] },
      include: { cluster: { include: { tickets: true } } },
    })
    if (!draft) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    res.json(draft)
  } catch (err) {
    next(err)
  }
})

draftsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = PatchBodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
      return
    }
    const { title, content } = parsed.data
    const draft = await prisma.draft.update({
      where: { id: req.params['id'] },
      data: { ...(title !== undefined && { title }), ...(content !== undefined && { content }) },
    })
    res.json(draft)
  } catch (err) {
    next(err)
  }
})

draftsRouter.post('/:id/approve', async (req, res, next) => {
  try {
    const draft = await prisma.draft.update({
      where: { id: req.params['id'] },
      data: { status: 'APPROVED' },
    })
    // TODO: enqueue publish job (Phase 4.4)
    res.json(draft)
  } catch (err) {
    next(err)
  }
})

draftsRouter.post('/:id/discard', async (req, res, next) => {
  try {
    const draft = await prisma.draft.update({
      where: { id: req.params['id'] },
      data: { status: 'DISCARDED' },
    })
    res.json(draft)
  } catch (err) {
    next(err)
  }
})
