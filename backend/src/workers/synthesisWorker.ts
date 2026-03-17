import { Worker } from 'bullmq'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma.js'
import { openai } from '../lib/openai.js'
import { logger } from '../lib/logger.js'
import { buildKbDraftPrompt } from '../lib/prompts/kb-draft.js'

interface TicketRecord {
  subject: string
  transcript: string
}

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
})

const JobDataSchema = z.object({
  clusterId: z.string().uuid(),
  requestId: z.string().optional(),
})

// A05 — Whitelist of valid OpenAI synthesis model identifiers.
// Any other string (typo, injection) is rejected at worker startup rather than
// silently passed to the OpenAI API.
const ALLOWED_SYNTHESIS_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] as const
const synthesisModel = z
  .enum(ALLOWED_SYNTHESIS_MODELS)
  .default('gpt-4o')
  .parse(process.env['SYNTHESIS_MODEL'])

/**
 * Creates and starts the synthesis BullMQ worker.
 * Each job fetches a READY cluster's tickets, calls GPT-4o to generate
 * a KB article, and persists the result as a Draft with PENDING_REVIEW status.
 * Idempotent: if a draft already exists for the cluster, it is skipped.
 */
export function startSynthesisWorker(): Worker {
  const redisEnv = RedisEnvSchema.parse(process.env)

  const worker = new Worker(
    'synthesis',
    async (job) => {
      const parsed = JobDataSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.warn({ jobId: job.id, details: parsed.error.flatten() }, 'Invalid synthesis job data — skipping')
        return
      }

      const { clusterId, requestId } = parsed.data
      logger.info({ clusterId, requestId }, 'Starting synthesis for cluster')

      // 1. Fetch cluster with tickets
      const cluster = await prisma.cluster.findUniqueOrThrow({
        where: { id: clusterId },
        include: { tickets: true },
      })

      // 2. Idempotency: skip if a draft already exists for this cluster
      const existingDraft = await prisma.draft.findFirst({ where: { clusterId } })
      if (existingDraft) {
        logger.info({ clusterId, requestId, draftId: existingDraft.id }, 'Draft already exists for cluster — skipping synthesis')
        return
      }

      // 3. Build prompt from cluster tickets
      const ticketInputs = (cluster.tickets as TicketRecord[]).map((t) => ({
        subject: t.subject,
        transcript: t.transcript,
      }))
      const prompt = buildKbDraftPrompt(ticketInputs)

      // 4. Call OpenAI GPT-4o
      const completion = await openai.chat.completions.create({
        model: synthesisModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      })

      const rawContent = completion.choices[0]?.message.content ?? ''

      // 5. Parse response — first line is title, rest is content
      const lines = rawContent.split('\n')
      const title = lines[0]?.trim() ?? 'Untitled KB Article'
      const content = lines.slice(1).join('\n').trimStart()

      // 6. Persist draft
      const draft = await prisma.draft.create({
        data: {
          id: uuidv4(),
          title,
          content,
          clusterId,
          status: 'PENDING_REVIEW',
        },
      })

      logger.info({ draftId: draft.id, clusterId, requestId }, 'Draft created')
    },
    {
      connection: {
        host: redisEnv.REDIS_HOST,
        port: redisEnv.REDIS_PORT,
        ...(redisEnv.REDIS_PASSWORD !== undefined && { password: redisEnv.REDIS_PASSWORD }),
      },
    }
  )

  worker.on('failed', (job, err) => {
    const requestId = (job?.data as { requestId?: string } | undefined)?.requestId
    logger.error({ jobId: job?.id, requestId, err }, 'Synthesis worker job failed')
  })

  return worker
}
