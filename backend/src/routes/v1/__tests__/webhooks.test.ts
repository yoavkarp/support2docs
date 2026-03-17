import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

// Mock prisma before importing the router
vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    ticket: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import express from 'express'
import request from 'supertest'
import { webhooksRouter } from '../webhooks.js'
import { prisma } from '../../../lib/prisma.js'

const TEST_SECRET = 'test-webhook-secret'

// Mirror the rawBody capture middleware from the main app
const app = express()
app.use(
  express.json({
    verify: (req, _res, buf) => {
      ;(req as unknown as { rawBody: Buffer }).rawBody = buf
    },
  })
)
app.use('/webhooks', webhooksRouter)

/** Build a valid HMAC-SHA256 signature header for the given payload */
function sign(body: object): string {
  const raw = JSON.stringify(body)
  const digest = createHmac('sha256', TEST_SECRET).update(raw).digest('hex')
  return `sha256=${digest}`
}

describe('POST /webhooks/ticket-closed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['WEBHOOK_SECRET'] = TEST_SECRET
  })

  const validPayload = {
    id: 'src-123',
    source: 'zendesk',
    subject: 'Cannot login',
    transcript: 'User: help\nAgent: sure',
  }

  // --- A08: HMAC signature validation ---

  it('returns 401 when WEBHOOK_SECRET is not configured', async () => {
    delete process.env['WEBHOOK_SECRET']
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(validPayload))
      .send(validPayload)
    expect(res.status).toBe(401)
  })

  it('returns 401 when no signature header is provided', async () => {
    const res = await request(app).post('/webhooks/ticket-closed').send(validPayload)
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature header has wrong prefix', async () => {
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', 'md5=badsig')
      .send(validPayload)
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature is tampered', async () => {
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', 'sha256=deadbeef')
      .send(validPayload)
    expect(res.status).toBe(401)
  })

  // --- Payload validation ---

  it('returns 400 for invalid payload (missing fields)', async () => {
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign({}))
      .send({})
    expect(res.status).toBe(400)
  })

  // --- Happy paths ---

  it('creates a ticket and returns 201 for valid signed payload', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.ticket.create).mockResolvedValue({
      id: 'uuid-abc',
      sourceId: 'src-123',
      source: 'zendesk',
      subject: 'Cannot login',
      transcript: 'User: help\nAgent: sure',
      embedding: null,
      status: 'PENDING',
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(validPayload))
      .send(validPayload)
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })

  it('returns 200 without creating a duplicate for repeated sourceId', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({
      id: 'existing-uuid',
      sourceId: 'src-123',
      source: 'zendesk',
      subject: 'Cannot login',
      transcript: 'User: help\nAgent: sure',
      embedding: null,
      status: 'PENDING',
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(validPayload))
      .send(validPayload)
    expect(res.status).toBe(200)
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })
})
