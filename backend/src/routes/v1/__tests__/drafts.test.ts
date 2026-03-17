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

import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import { draftsRouter } from '../drafts.js'
import { prisma } from '../../../lib/prisma.js'

const app = express()
app.use(express.json())
app.use('/drafts', draftsRouter)
// Catch errors forwarded by next(err) so supertest gets a 500 response
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message })
})

const mockDraft = {
  id: 'draft-uuid-1',
  title: 'How to reset password',
  content: 'Steps to reset...',
  status: 'PENDING_REVIEW' as const,
  clusterId: 'cluster-uuid-1',
  publishedUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  cluster: { tickets: [{ id: 't1' }, { id: 't2' }] },
}

describe('GET /drafts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated drafts', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([mockDraft] as never)
    const res = await request(app).get('/drafts')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.page).toBe(1)
  })

  it('filters by status when query param provided', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([])
    await request(app).get('/drafts?status=APPROVED')
    expect(prisma.draft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED' } })
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

describe('GET /drafts/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(null)
    const res = await request(app).get('/drafts/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Draft not found' })
  })

  it('returns the draft when found', async () => {
    vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
    const res = await request(app).get('/drafts/draft-uuid-1')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('draft-uuid-1')
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.findUnique).mockRejectedValue(new Error('DB error'))
    const res = await request(app).get('/drafts/draft-uuid-1')
    expect(res.status).toBe(500)
  })
})

describe('PATCH /drafts/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates and returns the draft with both fields', async () => {
    const updated = { ...mockDraft, title: 'Updated title' }
    vi.mocked(prisma.draft.update).mockResolvedValue(updated as never)
    const res = await request(app)
      .patch('/drafts/draft-uuid-1')
      .send({ title: 'Updated title', content: 'New content' })
    expect(res.status).toBe(200)
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Updated title', content: 'New content' } })
    )
  })

  it('updates only title when content is omitted', async () => {
    vi.mocked(prisma.draft.update).mockResolvedValue(mockDraft as never)
    await request(app).patch('/drafts/draft-uuid-1').send({ title: 'Only title' })
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Only title' } })
    )
  })

  it('updates only content when title is omitted', async () => {
    vi.mocked(prisma.draft.update).mockResolvedValue(mockDraft as never)
    await request(app).patch('/drafts/draft-uuid-1').send({ content: 'Only content' })
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { content: 'Only content' } })
    )
  })

  // --- A05: Injection — oversized and invalid body rejected ---
  it('returns 400 when title exceeds maximum length (500 chars)', async () => {
    const res = await request(app)
      .patch('/drafts/draft-uuid-1')
      .send({ title: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when title is an empty string', async () => {
    const res = await request(app).patch('/drafts/draft-uuid-1').send({ title: '' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when neither title nor content is provided', async () => {
    const res = await request(app).patch('/drafts/draft-uuid-1').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.update).mockRejectedValue(new Error('DB error'))
    const res = await request(app).patch('/drafts/draft-uuid-1').send({ title: 'x' })
    expect(res.status).toBe(500)
  })
})

describe('POST /drafts/:id/approve', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status to APPROVED', async () => {
    const approved = { ...mockDraft, status: 'APPROVED' }
    vi.mocked(prisma.draft.update).mockResolvedValue(approved as never)
    const res = await request(app).post('/drafts/draft-uuid-1/approve')
    expect(res.status).toBe(200)
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'APPROVED' } })
    )
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.update).mockRejectedValue(new Error('DB error'))
    const res = await request(app).post('/drafts/draft-uuid-1/approve')
    expect(res.status).toBe(500)
  })
})

describe('POST /drafts/:id/discard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status to DISCARDED', async () => {
    const discarded = { ...mockDraft, status: 'DISCARDED' }
    vi.mocked(prisma.draft.update).mockResolvedValue(discarded as never)
    const res = await request(app).post('/drafts/draft-uuid-1/discard')
    expect(res.status).toBe(200)
    expect(prisma.draft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DISCARDED' } })
    )
  })

  it('calls next on error', async () => {
    vi.mocked(prisma.draft.update).mockRejectedValue(new Error('DB error'))
    const res = await request(app).post('/drafts/draft-uuid-1/discard')
    expect(res.status).toBe(500)
  })
})
