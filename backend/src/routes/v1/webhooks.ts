import { Router } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../lib/prisma.js'
import { ticketQueue } from '../../lib/queue.js'

export const webhooksRouter = Router()

// A05 — All external fields are bounded to prevent storage-amplification attacks.
// The global 50kb body-size limit provides a first layer of defence; these
// per-field max() constraints are the second layer and match what the DB schema
// can reasonably store.
const TicketClosedPayloadSchema = z.object({
  id: z.string().min(1).max(255),
  source: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  transcript: z.string().min(1).max(40_000),
})

/**
 * Verify the HMAC-SHA256 signature sent by Zendesk / Intercom.
 * The sender must set the header:  X-Webhook-Signature: sha256=<hex-digest>
 * The digest is computed over the raw request body using WEBHOOK_SECRET.
 *
 * Returns true only when the signature is present, well-formed, and matches.
 * Uses timingSafeEqual to prevent timing-oracle attacks.
 */
function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) {
    // If no secret is configured, reject all requests to prevent accidental open access.
    return false
  }
  if (!signatureHeader?.startsWith('sha256=')) {
    return false
  }
  const provided = signatureHeader.slice(7) // strip "sha256=" prefix
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    // Buffer lengths differ — signature is wrong
    return false
  }
}

webhooksRouter.post('/ticket-closed', async (req, res, next) => {
  try {
    // --- A08: Integrity — verify HMAC signature before touching the payload ---
    const rawBody: Buffer = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body))
    const signatureHeader = req.headers['x-webhook-signature'] as string | undefined
    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      res.status(401).json({ error: 'Invalid or missing webhook signature' })
      return
    }

    const parsed = TicketClosedPayloadSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
      return
    }

    const { id: sourceId, source, subject, transcript } = parsed.data

    const existing = await prisma.ticket.findUnique({ where: { sourceId } })
    if (existing) {
      res.status(200).json({ message: 'Duplicate — already ingested', id: existing.id })
      return
    }

    const ticket = await prisma.ticket.create({
      data: { id: uuidv4(), sourceId, source, subject, transcript },
    })

    await ticketQueue.add('process-ticket', {
      ticketId: ticket.id,
      requestId: res.locals['requestId'] as string | undefined,
    })

    res.status(201).json({ id: ticket.id })
  } catch (err) {
    next(err)
  }
})
