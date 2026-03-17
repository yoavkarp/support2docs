import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    draft: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('../../../lib/firestore.js', () => ({
  firestoreDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

vi.mock('../../../lib/queue.js', () => ({
  publishQueue: {
    add: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock auth middleware so tests are not coupled to Firebase Admin SDK initialisation.
// requireAuth is not applied in the unit-test app (draftsRouter is mounted directly),
// so only requireAdmin needs to be stubbed.  By default the stub passes (simulates
// an authenticated admin user); individual tests can override it to test the 403 path.
vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import { draftsRouter } from '../drafts.js'
import { prisma } from '../../../lib/prisma.js'
import { publishQueue } from '../../../lib/queue.js'
import { firestoreDb } from '../../../lib/firestore.js'
import { requireAdmin } from '../../../middleware/auth.js'

const app = express()
app.use(express.json())
app.use('/drafts', draftsRouter)
// Catch errors forwarded by next(err) so supertest gets a 500 response
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message })
})

// Using proper UUID v4 strings so the DraftIdParamSchema validation passes.
const DRAFT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const mockDraft = {
  id: DRAFT_ID,
  title: 'How to reset password',
  content: 'Steps to reset...',
  status: 'PENDING_REVIEW' as const,
  clusterId: 'f0e1d2c3-b4a5-4968-8765-432100fedcba',
  publishedUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  cluster: {
    id: 'f0e1d2c3-b4a5-4968-8765-432100fedcba',
    _count: { tickets: 2 },
    tickets: [
      { id: 'c9d8e7f6-a5b4-4321-8c9d-1e2f3a4b5c6d', subject: 'Ticket 1', source: 'zendesk', createdAt: new Date() },
      { id: 'b8c7d6e5-f4a3-4210-7b8c-0d1e2f3a4b5c', subject: 'Ticket 2', source: 'zendesk', createdAt: new Date() },
    ],
  },
}

// ---------------------------------------------------------------------------
// GET /drafts
// ---------------------------------------------------------------------------
describe('GET /drafts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated drafts', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([mockDraft] as never)
    const res = await request(app).get('/drafts')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.page).toBe(1)
  })

  it('includes cluster _count in query', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([mockDraft] as never)
    await request(app).get('/drafts')
    expect(prisma.draft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          cluster: {
            include: { _count: { select: { tickets: true } } },
          },
        },
      }),
    )
  })

  it('filters by status when query param provided', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([])
    await request(app).get('/drafts?status=APPROVED')
    expect(prisma.draft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED' } }),
    )
  })

  // --- A05: Injection — invalid status enum rejected ---
  it('returns 400 for an invalid status value', async () => {
    const res = await request(app).get('/drafts?status=HACKED')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  // --- A01: Broken Access Control — pagination bounds enforced ---
  it('returns 400 when limit exceeds maximum (100)', async () => {
    const res = await request(app).get('/drafts?limit=1000000')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when page is zero or negative', async () => {
    const res = await request(app).get('/drafts?page=0')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when limit is non-numeric', async () => {
    const res = await request(app).get('/drafts?limit=abc')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })
})

// ---------------------------------------------------------------------------
// GET /drafts/:id
// ---------------------------------------------------------------------------
describe('GET /drafts/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  // --- A01: Route param UUID validation ---
  it('returns 400 when id is not a valid UUID', async () => {
    const res = await request(app).get('/drafts/nonexistent')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(null)
    const res = await request(app).get(`/drafts/${DRAFT_ID}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Draft not found' })
  })

  it('returns the draft when found', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
    const res = await request(app).get(`/drafts/${DRAFT_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(DRAFT_ID)
  })

  it('includes cluster with source ticket fields', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
    await request(app).get(`/drafts/${DRAFT_ID}`)
    expect(prisma.draft.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          cluster: {
            include: {
              tickets: { select: { id: true, subject: true, source: true, createdAt: true } },
            },
          },
        },
      }),
    )
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.findUnique).mockRejectedValue(new Error('DB error'))
    const res = await request(app).get(`/drafts/${DRAFT_ID}`)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// PATCH /drafts/:id
// ---------------------------------------------------------------------------
describe('PATCH /drafts/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await request(app).patch('/drafts/not-a-uuid').send({ title: 'x' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('updates and returns the draft with both fields', async () => {
    const updated = { ...mockDraft, title: 'Updated title', content: 'New content' }
    vi.mocked(prisma.draft.update).mockResolvedValue(updated as never)
    const res = await request(app)
      .patch(`/drafts/${DRAFT_ID}`)
      .send({ title: 'Updated title', content: 'New content' })
    expect(res.status).toBe(200)
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Updated title', content: 'New content' } }),
    )
  })

  it('updates only title when content is omitted', async () => {
    vi.mocked(prisma.draft.update).mockResolvedValue(mockDraft as never)
    await request(app).patch(`/drafts/${DRAFT_ID}`).send({ title: 'Only title' })
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Only title' } }),
    )
  })

  it('updates only content when title is omitted', async () => {
    vi.mocked(prisma.draft.update).mockResolvedValue(mockDraft as never)
    await request(app).patch(`/drafts/${DRAFT_ID}`).send({ content: 'Only content' })
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { content: 'Only content' } }),
    )
  })

  it('syncs updated draft to Firestore', async () => {
    const updated = { ...mockDraft, title: 'Synced title' }
    vi.mocked(prisma.draft.update).mockResolvedValue(updated as never)
    await request(app).patch(`/drafts/${DRAFT_ID}`).send({ title: 'Synced title' })
    // firestoreDb.collection('drafts').doc(id).set(...)
    expect(firestoreDb.collection).toHaveBeenCalledWith('drafts')
  })

  // --- A05: Injection — oversized and invalid body rejected ---
  it('returns 400 when title exceeds maximum length (500 chars)', async () => {
    const res = await request(app)
      .patch(`/drafts/${DRAFT_ID}`)
      .send({ title: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when title is an empty string', async () => {
    const res = await request(app).patch(`/drafts/${DRAFT_ID}`).send({ title: '' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when neither title nor content is provided', async () => {
    const res = await request(app).patch(`/drafts/${DRAFT_ID}`).send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.update).mockRejectedValue(new Error('DB error'))
    const res = await request(app).patch(`/drafts/${DRAFT_ID}`).send({ title: 'x' })
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// POST /drafts/:id/approve
// ---------------------------------------------------------------------------
describe('POST /drafts/:id/approve', () => {
  beforeEach(() => vi.clearAllMocks())

  // --- A01: requireAdmin middleware blocks non-admin users ---
  it('returns 403 when caller does not have admin claim', async () => {
    vi.mocked(requireAdmin).mockImplementationOnce((_req, res: Response, _next) => {
      res.status(403).json({ error: 'Forbidden — admin role required' })
    })
    const res = await request(app).post(`/drafts/${DRAFT_ID}/approve`)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/admin/)
  })

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await request(app).post('/drafts/not-a-uuid/approve')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 404 when draft does not exist', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(null)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/approve`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Draft not found' })
  })

  it('returns 409 when draft is already APPROVED', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue({
      ...mockDraft,
      status: 'APPROVED',
    } as never)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/approve`)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/APPROVED/)
  })

  it('returns 409 when draft is already DISCARDED', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue({
      ...mockDraft,
      status: 'DISCARDED',
    } as never)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/approve`)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/DISCARDED/)
  })

  it('sets status to APPROVED and enqueues publish job', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
    const approved = { ...mockDraft, status: 'APPROVED' }
    vi.mocked(prisma.draft.update).mockResolvedValue(approved as never)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/approve`)
    expect(res.status).toBe(200)
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'APPROVED' } }),
    )
    expect(publishQueue.add).toHaveBeenCalledWith('publish-draft', { draftId: DRAFT_ID })
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.findUnique).mockRejectedValue(new Error('DB error'))
    const res = await request(app).post(`/drafts/${DRAFT_ID}/approve`)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// POST /drafts/:id/discard
// ---------------------------------------------------------------------------
describe('POST /drafts/:id/discard', () => {
  beforeEach(() => vi.clearAllMocks())

  // --- A01: requireAdmin middleware blocks non-admin users ---
  it('returns 403 when caller does not have admin claim', async () => {
    vi.mocked(requireAdmin).mockImplementationOnce((_req, res: Response, _next) => {
      res.status(403).json({ error: 'Forbidden — admin role required' })
    })
    const res = await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/admin/)
  })

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await request(app).post('/drafts/not-a-uuid/discard')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 404 when draft does not exist', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(null)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Draft not found' })
  })

  it('returns 409 when draft is already APPROVED', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue({
      ...mockDraft,
      status: 'APPROVED',
    } as never)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/APPROVED/)
  })

  it('returns 409 when draft is already DISCARDED', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue({
      ...mockDraft,
      status: 'DISCARDED',
    } as never)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/DISCARDED/)
  })

  it('sets status to DISCARDED', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
    const discarded = { ...mockDraft, status: 'DISCARDED' }
    vi.mocked(prisma.draft.update).mockResolvedValue(discarded as never)
    const res = await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(res.status).toBe(200)
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DISCARDED' } }),
    )
  })

  it('does not enqueue a publish job when discarding', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
    const discarded = { ...mockDraft, status: 'DISCARDED' }
    vi.mocked(prisma.draft.update).mockResolvedValue(discarded as never)
    await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(publishQueue.add).not.toHaveBeenCalled()
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.findUnique).mockRejectedValue(new Error('DB error'))
    const res = await request(app).post(`/drafts/${DRAFT_ID}/discard`)
    expect(res.status).toBe(500)
  })
})
