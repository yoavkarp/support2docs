import { Router } from 'express'
import { DraftEventAction } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.js'

export const statsRouter = Router()

// ---------------------------------------------------------------------------
// Helper — get the Monday (UTC) of the current ISO week
// ---------------------------------------------------------------------------
function getStartOfWeekUtc(): Date {
  const now = new Date()
  // getUTCDay(): 0=Sun, 1=Mon … 6=Sat
  const dayOfWeek = now.getUTCDay()
  // Days since Monday (treat Sunday as 6 days after Monday)
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  )
  return monday
}

// ---------------------------------------------------------------------------
// GET /api/v1/stats
// Public — no auth required (read-only aggregate metrics)
// ---------------------------------------------------------------------------
statsRouter.get('/', async (_req, res, next) => {
  try {
    // Draft counts by status in a single query
    const statusCounts = await prisma.draft.groupBy({
      by: ['status'],
      _count: { _all: true },
    })

    const countMap: Record<string, number> = {}
    for (const row of statusCounts) {
      countMap[row.status] = row._count._all
    }

    const totalApproved = countMap['APPROVED'] ?? 0
    const totalDiscarded = countMap['DISCARDED'] ?? 0
    const totalPending = countMap['PENDING_REVIEW'] ?? 0
    const totalDrafts = totalApproved + totalDiscarded + totalPending

    // Approved this week — count APPROVED events since start of current week
    const weekStart = getStartOfWeekUtc()
    const approvedThisWeek = await prisma.draftEvent.count({
      where: {
        action: DraftEventAction.APPROVED,
        timestamp: { gte: weekStart },
      },
    })

    // Average review time — time between CREATED and APPROVED events for same draft
    // Use raw SQL for the join + avg calculation
    const avgResult = await prisma.$queryRaw<Array<{ avg_minutes: number | null }>>`
      SELECT
        AVG(
          EXTRACT(EPOCH FROM (a.timestamp - c.timestamp)) / 60.0
        ) AS avg_minutes
      FROM "DraftEvent" a
      JOIN "DraftEvent" c ON c."draftId" = a."draftId"
        AND c.action = ${DraftEventAction.CREATED}::"DraftEventAction"
      WHERE a.action = ${DraftEventAction.APPROVED}::"DraftEventAction"
    `

    const avgReviewTimeMinutes =
      avgResult[0]?.avg_minutes != null
        ? Math.round(Number(avgResult[0].avg_minutes) * 10) / 10
        : 0

    // Derived ROI metrics
    const estimatedHoursSaved = Math.round(totalApproved * 0.75 * 10) / 10
    const estimatedTicketsDeflected = totalApproved * 125

    res.json({
      totalDrafts,
      totalApproved,
      totalDiscarded,
      totalPending,
      approvedThisWeek,
      avgReviewTimeMinutes,
      estimatedHoursSaved,
      estimatedTicketsDeflected,
    })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /api/v1/stats/by-reviewer
// A01/A03 — Auth required: this endpoint returns reviewer email addresses
// (PII) and Firebase UIDs. Unauthenticated callers must not be able to
// enumerate org members or harvest email addresses.
// ---------------------------------------------------------------------------
statsRouter.get('/by-reviewer', requireAuth, async (_req, res, next) => {
  try {
    const events = await prisma.draftEvent.groupBy({
      by: ['userId', 'userEmail', 'action'],
      where: {
        userId: { not: 'system' },
      },
      _count: { _all: true },
    })

    // Aggregate into per-user map
    type ReviewerRow = {
      userId: string
      userEmail: string
      approved: number
      discarded: number
      edited: number
    }
    const reviewerMap = new Map<string, ReviewerRow>()

    for (const row of events) {
      const existing = reviewerMap.get(row.userId) ?? {
        userId: row.userId,
        userEmail: row.userEmail,
        approved: 0,
        discarded: 0,
        edited: 0,
      }

      if (row.action === DraftEventAction.APPROVED) {
        existing.approved += row._count._all
      } else if (row.action === DraftEventAction.DISCARDED) {
        existing.discarded += row._count._all
      } else if (row.action === DraftEventAction.EDITED) {
        existing.edited += row._count._all
      }

      reviewerMap.set(row.userId, existing)
    }

    const result = Array.from(reviewerMap.values()).sort((a, b) => b.approved - a.approved)

    res.json(result)
  } catch (err) {
    next(err)
  }
})
