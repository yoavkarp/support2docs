import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { DraftEventAction, MemberRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { firestoreDb } from '../../lib/firestore.js'
import { publishQueue } from '../../lib/queue.js'

async function isOrgAdmin(orgId: string | null | undefined, userId: string): Promise<boolean> {
  // If orgId is null (legacy draft created before multi-org), check if the user
  // is an admin of any org — they're the owner by definition.
  const where = orgId
    ? { orgId, userId, role: MemberRole.ADMIN }
    : { userId, role: MemberRole.ADMIN }
  const membership = await prisma.organizationMember.findFirst({
    where,
    select: { id: true },
  })
  return membership !== null
}

export const draftsRouter = Router()

// --- A05: Injection / A01: Broken Access Control --------------------------------
// All query params, route params, and request bodies are validated with Zod
// before use. Pagination is capped to prevent resource-exhaustion attacks.
// DraftEvent.action is now a Prisma-enforced DB enum (DraftEventAction);
// insertion sites pass the enum value directly — no string literals accepted.
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

    res.json(drafts)
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
// A01 — requireAdmin: edit access is restricted to admins to prevent any
// authenticated user from mutating any draft (IDOR / broken access control).
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
    const uid = res.locals['uid'] as string
    const existing = await prisma.draft.findUnique({ where: { id: paramParsed.data.id }, select: { orgId: true } })
    if (!existing) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    if (!(await isOrgAdmin(existing.orgId, uid))) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
      return
    }
    const { title, content } = bodyParsed.data
    const updated = await prisma.draft.update({
      where: { id: paramParsed.data.id },
      data: { ...(title !== undefined && { title }), ...(content !== undefined && { content }) },
    })

    // Record reviewer attribution event
    const patchClaims = res.locals['claims'] as Record<string, unknown> | undefined
    await prisma.draftEvent.create({
      data: {
        id: uuidv4(),
        draftId: updated.id,
        action: DraftEventAction.EDITED,
        userId: String(patchClaims?.['uid'] ?? res.locals['uid'] ?? 'unknown'),
        userEmail: String(patchClaims?.['email'] ?? ''),
      },
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
draftsRouter.post('/:id/approve', async (req, res, next) => {
  try {
    const paramParsed = DraftIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid draft id', details: paramParsed.error.flatten() })
      return
    }
    const { id } = paramParsed.data
    const uid = res.locals['uid'] as string

    const existing = await prisma.draft.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    if (!(await isOrgAdmin(existing.orgId, uid))) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
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

    // Record reviewer attribution event
    const approveClaims = res.locals['claims'] as Record<string, unknown> | undefined
    await prisma.draftEvent.create({
      data: {
        id: uuidv4(),
        draftId: id,
        action: DraftEventAction.APPROVED,
        userId: String(approveClaims?.['uid'] ?? res.locals['uid'] ?? 'unknown'),
        userEmail: String(approveClaims?.['email'] ?? ''),
      },
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
draftsRouter.post('/:id/discard', async (req, res, next) => {
  try {
    const paramParsed = DraftIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid draft id', details: paramParsed.error.flatten() })
      return
    }
    const { id } = paramParsed.data
    const uid = res.locals['uid'] as string

    const existing = await prisma.draft.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    if (!(await isOrgAdmin(existing.orgId, uid))) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
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

    // Record reviewer attribution event
    const discardClaims = res.locals['claims'] as Record<string, unknown> | undefined
    await prisma.draftEvent.create({
      data: {
        id: uuidv4(),
        draftId: id,
        action: DraftEventAction.DISCARDED,
        userId: String(discardClaims?.['uid'] ?? res.locals['uid'] ?? 'unknown'),
        userEmail: String(discardClaims?.['email'] ?? ''),
      },
    })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})
