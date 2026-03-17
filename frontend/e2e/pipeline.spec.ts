/**
 * pipeline.spec.ts
 *
 * End-to-end smoke tests for the full Support-to-Docs pipeline:
 *   ticket ingestion → clustering → draft synthesis → reviewer approval → publish
 *
 * All tests in this file are marked fixme because they require a running
 * backend (Express + PostgreSQL + Redis + OpenAI key) and a Firebase emulator.
 * They are staged here so they run automatically once the infrastructure is
 * available (e.g. in a dedicated staging environment).
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const WEBHOOK_PATH = '/api/v1/webhooks/ticket-closed'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'test-secret'

/** Build a minimal Zendesk-style closed-ticket payload. */
function makeTicketPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `ext-ticket-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    subject: 'User cannot log in after password reset',
    description:
      'The user reports being unable to log in after resetting their password. ' +
      'Clearing the browser cache and retrying resolved the issue.',
    source: 'zendesk',
    closedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Full pipeline smoke test — requires backend + Firebase emulator
// ---------------------------------------------------------------------------

test.describe('Full pipeline smoke test', () => {
  test.fixme(
    true,
    'Requires running backend (Express + PostgreSQL + Redis + BullMQ workers), ' +
      'OpenAI API key, and a signed-in Firebase session. ' +
      'Run in staging with VITE_API_BASE_URL and WEBHOOK_SECRET set.',
  )

  test('5 tickets ingested → cluster forms → draft created → reviewer approves → published', async ({
    page,
    request,
  }) => {
    // -----------------------------------------------------------------------
    // Step 1: Ingest 5 tickets that are semantically similar via the webhook.
    // -----------------------------------------------------------------------
    const ticketIds: string[] = []
    for (let i = 0; i < 5; i++) {
      const payload = makeTicketPayload({
        subject: `User cannot log in after password reset (variant ${i + 1})`,
      })
      ticketIds.push(payload.id)

      const res = await request.post(`${BACKEND_URL}${WEBHOOK_PATH}`, {
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          // In a real staging test the HMAC would be computed here.
          'X-Webhook-Secret': WEBHOOK_SECRET,
        },
      })

      expect(res.status()).toBe(200)
    }

    // -----------------------------------------------------------------------
    // Step 2: Wait for the clustering + synthesis workers to complete.
    //         Poll the drafts API until a PENDING_REVIEW draft appears
    //         (max 60 s — workers are async).
    // -----------------------------------------------------------------------
    let draftId: string | null = null
    const deadline = Date.now() + 60_000

    while (Date.now() < deadline) {
      const res = await request.get(`${BACKEND_URL}/api/v1/drafts?status=PENDING_REVIEW`)
      const body = await res.json()

      if (body.data && body.data.length > 0) {
        draftId = body.data[0].id
        break
      }

      await page.waitForTimeout(3000)
    }

    expect(draftId, 'A PENDING_REVIEW draft should have been created within 60 s').not.toBeNull()

    // -----------------------------------------------------------------------
    // Step 3: Navigate to the draft as an authenticated reviewer and approve.
    // -----------------------------------------------------------------------
    await page.goto(`/dashboard/drafts/${draftId}`)

    // Verify draft content was synthesised
    const contentArea = page.getByLabel('Draft content')
    await expect(contentArea).not.toBeEmpty()

    // Approve
    await page.getByRole('button', { name: /approve/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()

    // Should redirect back to dashboard
    await expect(page).toHaveURL(/\/dashboard$/)

    // The approved draft should no longer appear in the PENDING_REVIEW list
    await expect(page.getByText('No drafts pending review')).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 4: Verify the draft was published (publishedUrl set on the record).
    // -----------------------------------------------------------------------
    const detailRes = await request.get(`${BACKEND_URL}/api/v1/drafts/${draftId}`)
    const detail = await detailRes.json()

    expect(detail.status).toBe('APPROVED')
    expect(typeof detail.publishedUrl).toBe('string')
    expect(detail.publishedUrl.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Idempotency — requires backend + DB
// ---------------------------------------------------------------------------

test.describe('Webhook idempotency', () => {
  test.fixme(
    true,
    'Requires running backend with PostgreSQL. ' +
      'Run in staging with VITE_API_BASE_URL and WEBHOOK_SECRET set.',
  )

  test('duplicate ticket ingestion returns 200 with the existing ticket id', async ({
    request,
  }) => {
    const payload = makeTicketPayload({ id: 'idempotency-test-ticket-001' })

    // First ingestion
    const first = await request.post(`${BACKEND_URL}${WEBHOOK_PATH}`, {
      data: payload,
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
    })
    expect(first.status()).toBe(200)
    const firstBody = await first.json()

    // Second ingestion of the same external ID
    const second = await request.post(`${BACKEND_URL}${WEBHOOK_PATH}`, {
      data: payload,
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
    })
    expect(second.status()).toBe(200)
    const secondBody = await second.json()

    // Both responses should reference the same internal ticket id
    expect(secondBody.id).toBe(firstBody.id)
  })
})

// ---------------------------------------------------------------------------
// Webhook security — requires backend
// ---------------------------------------------------------------------------

test.describe('Webhook security', () => {
  test.fixme(
    true,
    'Requires running backend. ' +
      'Run in staging with VITE_API_BASE_URL and WEBHOOK_SECRET set.',
  )

  test('webhook request with invalid signature returns 401', async ({ request }) => {
    const payload = makeTicketPayload()

    const res = await request.post(`${BACKEND_URL}${WEBHOOK_PATH}`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': 'definitely-wrong-secret',
      },
    })

    expect(res.status()).toBe(401)
  })
})
