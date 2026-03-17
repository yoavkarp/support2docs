import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

// Mock prisma before importing the router
vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    ticket: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// Mock the BullMQ queue so no real Redis connection is made
vi.mock('../../../lib/queue.js', () => ({
  ticketQueue: {
    add: vi.fn(),
  },
}))

import express from 'express'
import request from 'supertest'
import { webhooksRouter } from '../webhooks.js'
import { prisma } from '../../../lib/prisma.js'
import { ticketQueue } from '../../../lib/queue.js'

const DEFAULT_ORG = { id: 'org-default', name: 'Default', slug: 'default', logoUrl: null, createdAt: new Date() }

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
    // Default org mocks — getOrCreateOrg path
    vi.mocked(prisma.organization.findFirst).mockResolvedValue(DEFAULT_ORG)
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(DEFAULT_ORG)
    vi.mocked(prisma.organization.create).mockResolvedValue(DEFAULT_ORG)
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

  // --- Queue integration ---

  it('enqueues a process-ticket job with the created ticket id after successful ingestion', async () => {
    const createdId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.ticket.create).mockResolvedValue({
      id: createdId,
      sourceId: 'src-123',
      source: 'zendesk',
      subject: 'Cannot login',
      transcript: 'User: help\nAgent: sure',
      status: 'PENDING',
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(ticketQueue.add).mockResolvedValue({ id: 'job-1' } as never)

    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(validPayload))
      .send(validPayload)

    expect(res.status).toBe(201)
    expect(ticketQueue.add).toHaveBeenCalledOnce()
    expect(ticketQueue.add).toHaveBeenCalledWith('process-ticket', expect.objectContaining({ ticketId: createdId }))
  })

  it('does NOT enqueue when the ticket is a duplicate (existing sourceId)', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({
      id: 'existing-uuid',
      sourceId: 'src-123',
      source: 'zendesk',
      subject: 'Cannot login',
      transcript: 'User: help\nAgent: sure',
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
    expect(ticketQueue.add).not.toHaveBeenCalled()
  })

  it('does NOT enqueue when signature verification fails', async () => {
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', 'sha256=badhex')
      .send(validPayload)

    expect(res.status).toBe(401)
    expect(ticketQueue.add).not.toHaveBeenCalled()
  })

  // --- Org resolution ---

  it('uses default org when X-Org-Id header is absent', async () => {
    const createdId = 'f47ac10b-58cc-4372-a567-0e02b2c3d001'
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.ticket.create).mockResolvedValue({
      id: createdId, sourceId: 'src-org-1', source: 'zendesk',
      subject: 'Test', transcript: 'test', status: 'PENDING',
      clusterId: null, createdAt: new Date(), updatedAt: new Date(),
    })
    vi.mocked(ticketQueue.add).mockResolvedValue({ id: 'job-org-1' } as never)

    const payload = { id: 'src-org-1', source: 'zendesk', subject: 'Test', transcript: 'test' }
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(payload))
      .send(payload)

    expect(res.status).toBe(201)
    // getOrCreateOrg() was used — organization.findFirst was called
    expect(prisma.organization.findFirst).toHaveBeenCalled()
    // orgId from default org is passed through to the queue
    expect(ticketQueue.add).toHaveBeenCalledWith(
      'process-ticket',
      expect.objectContaining({ ticketId: createdId, orgId: DEFAULT_ORG.id }),
    )
  })

  it('uses org from X-Org-Id header when the org exists', async () => {
    // X-Org-Id must be a valid UUID (A01 — UUID validation added in Phase 9)
    const knownOrg = { id: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789', name: 'Known', slug: 'known', logoUrl: null, createdAt: new Date() }
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(knownOrg)
    const createdId = 'f47ac10b-58cc-4372-a567-0e02b2c3d002'
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.ticket.create).mockResolvedValue({
      id: createdId, sourceId: 'src-org-2', source: 'zendesk',
      subject: 'Test', transcript: 'test', status: 'PENDING',
      clusterId: null, createdAt: new Date(), updatedAt: new Date(),
    })
    vi.mocked(ticketQueue.add).mockResolvedValue({ id: 'job-org-2' } as never)

    const payload = { id: 'src-org-2', source: 'zendesk', subject: 'Test', transcript: 'test' }
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(payload))
      .set('x-org-id', knownOrg.id)
      .send(payload)

    expect(res.status).toBe(201)
    expect(ticketQueue.add).toHaveBeenCalledWith(
      'process-ticket',
      expect.objectContaining({ ticketId: createdId, orgId: knownOrg.id }),
    )
  })

  it('returns 400 when X-Org-Id is not a valid UUID', async () => {
    const payload = { id: 'src-org-3', source: 'zendesk', subject: 'Test', transcript: 'test' }
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(payload))
      .set('x-org-id', 'not-a-uuid')
      .send(payload)

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error', 'X-Org-Id must be a valid UUID')
    expect(ticketQueue.add).not.toHaveBeenCalled()
  })

  it('returns 400 when X-Org-Id header points to an unknown org', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

    const payload = { id: 'src-org-4', source: 'zendesk', subject: 'Test', transcript: 'test' }
    const res = await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(payload))
      .set('x-org-id', 'ffffffff-ffff-4fff-bfff-ffffffffffff')
      .send(payload)

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error', 'Unknown org — X-Org-Id not found')
    expect(ticketQueue.add).not.toHaveBeenCalled()
  })

  it('enqueues a job whose ticketId is the uuid returned by prisma.ticket.create', async () => {
    const differentPayload = {
      id: 'src-456',
      source: 'intercom',
      subject: 'Payment fails',
      transcript: 'User: I cannot pay\nAgent: let me check',
    }
    const returnedId = 'c1a5fc62-13d1-4e2a-9b0e-2f4a3b7c8d9e'
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.ticket.create).mockResolvedValue({
      id: returnedId,
      sourceId: 'src-456',
      source: 'intercom',
      subject: 'Payment fails',
      transcript: 'User: I cannot pay\nAgent: let me check',
      status: 'PENDING',
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(ticketQueue.add).mockResolvedValue({ id: 'job-2' } as never)

    await request(app)
      .post('/webhooks/ticket-closed')
      .set('x-webhook-signature', sign(differentPayload))
      .send(differentPayload)

    expect(ticketQueue.add).toHaveBeenCalledWith('process-ticket', expect.objectContaining({ ticketId: returnedId }))
  })
})
