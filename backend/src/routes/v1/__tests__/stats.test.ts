import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @prisma/client so the test runner never needs a real DB connection.
// The DraftEventAction enum values must match the real Prisma enum.
// ---------------------------------------------------------------------------
vi.mock('@prisma/client', () => ({
  DraftEventAction: {
    CREATED: 'CREATED',
    APPROVED: 'APPROVED',
    DISCARDED: 'DISCARDED',
    EDITED: 'EDITED',
  },
}))

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    draft: {
      groupBy: vi.fn(),
    },
    draftEvent: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import { statsRouter } from '../stats.js'
import { prisma } from '../../../lib/prisma.js'
import { requireAuth } from '../../../middleware/auth.js'

const app = express()
app.use(express.json())
app.use('/stats', statsRouter)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message })
})

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------
describe('GET /stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 with correct shape', async () => {
    vi.mocked(prisma.draft.groupBy).mockResolvedValue([
      { status: 'APPROVED', _count: { _all: 10 } },
      { status: 'DISCARDED', _count: { _all: 3 } },
      { status: 'PENDING_REVIEW', _count: { _all: 7 } },
    ] as never)
    vi.mocked(prisma.draftEvent.count).mockResolvedValue(2)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg_minutes: 15.5 }] as never)

    const res = await request(app).get('/stats')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      totalDrafts: 20,
      totalApproved: 10,
      totalDiscarded: 3,
      totalPending: 7,
      approvedThisWeek: 2,
      avgReviewTimeMinutes: 15.5,
    })
  })

  it('computes estimatedHoursSaved as totalApproved * 0.75 (rounded to 1dp)', async () => {
    vi.mocked(prisma.draft.groupBy).mockResolvedValue([
      { status: 'APPROVED', _count: { _all: 4 } },
    ] as never)
    vi.mocked(prisma.draftEvent.count).mockResolvedValue(0)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg_minutes: null }] as never)

    const res = await request(app).get('/stats')
    expect(res.status).toBe(200)
    // 4 * 0.75 = 3.0
    expect(res.body.estimatedHoursSaved).toBe(3)
  })

  it('computes estimatedTicketsDeflected as totalApproved * 125', async () => {
    vi.mocked(prisma.draft.groupBy).mockResolvedValue([
      { status: 'APPROVED', _count: { _all: 4 } },
    ] as never)
    vi.mocked(prisma.draftEvent.count).mockResolvedValue(0)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg_minutes: null }] as never)

    const res = await request(app).get('/stats')
    expect(res.status).toBe(200)
    expect(res.body.estimatedTicketsDeflected).toBe(500)
  })

  it('returns 0 for avgReviewTimeMinutes when avg_minutes is null', async () => {
    vi.mocked(prisma.draft.groupBy).mockResolvedValue([])
    vi.mocked(prisma.draftEvent.count).mockResolvedValue(0)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg_minutes: null }] as never)

    const res = await request(app).get('/stats')
    expect(res.status).toBe(200)
    expect(res.body.avgReviewTimeMinutes).toBe(0)
  })

  it('handles empty draft table (all counts zero)', async () => {
    vi.mocked(prisma.draft.groupBy).mockResolvedValue([])
    vi.mocked(prisma.draftEvent.count).mockResolvedValue(0)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg_minutes: null }] as never)

    const res = await request(app).get('/stats')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      totalDrafts: 0,
      totalApproved: 0,
      totalDiscarded: 0,
      totalPending: 0,
      approvedThisWeek: 0,
    })
  })

  it('calls next(err) on DB error', async () => {
    vi.mocked(prisma.draft.groupBy).mockRejectedValue(new Error('DB exploded'))
    const res = await request(app).get('/stats')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('DB exploded')
  })
})

// ---------------------------------------------------------------------------
// GET /stats/by-reviewer
// ---------------------------------------------------------------------------
describe('GET /stats/by-reviewer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when Authorization header is missing', async () => {
    // Override requireAuth to simulate unauthenticated request
    vi.mocked(requireAuth).mockImplementationOnce(async (_req, res: Response, _next) => {
      res.status(401).json({ error: 'Missing or invalid Authorization header' })
    })

    const res = await request(app).get('/stats/by-reviewer')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 200 with empty array when no reviewer events exist', async () => {
    vi.mocked(prisma.draftEvent.groupBy).mockResolvedValue([])

    const res = await request(app).get('/stats/by-reviewer')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 200 with aggregated reviewer rows', async () => {
    vi.mocked(prisma.draftEvent.groupBy).mockResolvedValue([
      { userId: 'uid-1', userEmail: 'alice@example.com', action: 'APPROVED', _count: { _all: 5 } },
      { userId: 'uid-1', userEmail: 'alice@example.com', action: 'DISCARDED', _count: { _all: 2 } },
      { userId: 'uid-1', userEmail: 'alice@example.com', action: 'EDITED', _count: { _all: 3 } },
      { userId: 'uid-2', userEmail: 'bob@example.com', action: 'APPROVED', _count: { _all: 1 } },
    ] as never)

    const res = await request(app).get('/stats/by-reviewer')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)

    const alice = res.body.find((r: { userId: string }) => r.userId === 'uid-1')
    expect(alice).toMatchObject({
      userId: 'uid-1',
      userEmail: 'alice@example.com',
      approved: 5,
      discarded: 2,
      edited: 3,
    })

    const bob = res.body.find((r: { userId: string }) => r.userId === 'uid-2')
    expect(bob).toMatchObject({
      userId: 'uid-2',
      userEmail: 'bob@example.com',
      approved: 1,
      discarded: 0,
      edited: 0,
    })
  })

  it('sorts reviewers by approved count descending', async () => {
    vi.mocked(prisma.draftEvent.groupBy).mockResolvedValue([
      { userId: 'uid-low', userEmail: 'low@example.com', action: 'APPROVED', _count: { _all: 1 } },
      { userId: 'uid-high', userEmail: 'high@example.com', action: 'APPROVED', _count: { _all: 10 } },
    ] as never)

    const res = await request(app).get('/stats/by-reviewer')
    expect(res.status).toBe(200)
    expect(res.body[0].approved).toBeGreaterThan(res.body[1].approved)
    expect(res.body[0].userId).toBe('uid-high')
  })

  it('excludes "system" userId rows', async () => {
    // The query is mocked — verify the where clause is passed correctly by
    // checking that groupBy was called with userId: { not: 'system' }
    vi.mocked(prisma.draftEvent.groupBy).mockResolvedValue([])

    await request(app).get('/stats/by-reviewer')
    expect(prisma.draftEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { not: 'system' } },
      }),
    )
  })

  it('calls next(err) on DB error', async () => {
    vi.mocked(prisma.draftEvent.groupBy).mockRejectedValue(new Error('connection failed'))
    const res = await request(app).get('/stats/by-reviewer')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('connection failed')
  })
})
