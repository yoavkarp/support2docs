import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { firestoreDb } from '../../lib/firestore.js'
import { publishQueue } from '../../lib/queue.js'
import { requireAdmin } from '../../middleware/auth.js'

export const draftsRouter = Router()

// --- A05: Injection / A01: Broken Access Control --------------------------------
// All query params, route params, and request bodies are validated with Zod
// before use. Pagination is capped to prevent resource-exhaustion attacks.
// -------------------------------------------------------------------------------

// A01 — Route param :id must be a valid UUID v4; a non-UUID string causes
// Prisma to throw a DB error (the column is typed @db.Uuid) which would produce
// a 500 instead of a clean 400.
const DraftIdParamSchema = z.object({
  id: z.string().uuid(),
})

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

// ---------------------------------------------------------------------------
// 4.1 — GET /drafts — paginated, filterable by status, includes ticket count
// ---------------------------------------------------------------------------
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
      include: {
        cluster: {
          include: {
            _count: { select: { tickets: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })

    res.json({ data: drafts, page, limit })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// 4.2 — GET /drafts/:id — fetch single draft with cluster + source tickets
// ---------------------------------------------------------------------------
draftsRouter.get('/:id', async (req, res, next) => {
  try {
    const paramParsed = DraftIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid draft id', details: paramParsed.error.flatten() })
      return
    }
    const draft = await prisma.draft.findUnique({
      where: { id: paramParsed.data.id },
      include: {
        cluster: {
          include: {
            tickets: {
              select: { id: true, subject: true, source: true, createdAt: true },
            },
          },
        },
      },
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

// ---------------------------------------------------------------------------
// 4.2 — PATCH /drafts/:id — save edits; sync to Firestore for real-time UI
// ---------------------------------------------------------------------------
draftsRouter.patch('/:id', async (req, res, next) => {
  try {
    const paramParsed = DraftIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid draft id', details: paramParsed.error.flatten() })
      return
    }
    const bodyParsed = PatchBodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: bodyParsed.error.flatten() })
      return
    }
    const { title, content } = bodyParsed.data
    const updated = await prisma.draft.update({
      where: { id: paramParsed.data.id },
      data: { ...(title !== undefined && { title }), ...(content !== undefined && { content }) },
    })

    // Sync to Firestore for real-time collaborative editing indicator in the FE.
    await firestoreDb.collection('drafts').doc(updated.id).set(
      {
        title: updated.title,
        content: updated.content,
        updatedAt: updated.updatedAt.toISOString(),
      },
      { merge: true },
    )

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// 4.3 — POST /drafts/:id/approve — set APPROVED + enqueue publish job
// A01 — requireAdmin: only users with the `admin: true` Firebase custom claim
// may approve drafts. This prevents any authenticated reviewer from unilaterally
// publishing another reviewer's draft (IDOR / broken access control).
// ---------------------------------------------------------------------------
draftsRouter.post('/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const paramParsed = DraftIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid draft id', details: paramParsed.error.flatten() })
      return
    }
    const { id } = paramParsed.data

    const existing = await prisma.draft.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    if (existing.status !== 'PENDING_REVIEW') {
      res.status(409).json({ error: `Draft is already ${existing.status}` })
      return
    }

    const updated = await prisma.draft.update({
      where: { id },
      data: { status: 'APPROVED' },
    })

    await publishQueue.add('publish-draft', { draftId: id })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// 4.3 — POST /drafts/:id/discard — set DISCARDED
// A01 — requireAdmin: same rationale as /approve above.
// ---------------------------------------------------------------------------
draftsRouter.post('/:id/discard', requireAdmin, async (req, res, next) => {
  try {
    const paramParsed = DraftIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid draft id', details: paramParsed.error.flatten() })
      return
    }
    const { id } = paramParsed.data

    const existing = await prisma.draft.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    if (existing.status !== 'PENDING_REVIEW') {
      res.status(409).json({ error: `Draft is already ${existing.status}` })
      return
    }

    const updated = await prisma.draft.update({
      where: { id },
      data: { status: 'DISCARDED' },
    })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})
