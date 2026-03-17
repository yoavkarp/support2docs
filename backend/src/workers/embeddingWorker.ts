import { Worker } from 'bullmq'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { openai } from '../lib/openai.js'
import { logger } from '../lib/logger.js'
import { clusteringQueue } from '../lib/queue.js'

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
})

const JobDataSchema = z.object({
  ticketId: z.string().uuid(),
  requestId: z.string().optional(),
})

// A05 — Whitelist of valid OpenAI embedding model identifiers.
// Any other string (typo, injection) is rejected at worker startup, not silently
// passed to the OpenAI API where it would either fail with an opaque error or
// (if a new model is added without review) use an unintended model.
const ALLOWED_EMBEDDING_MODELS = ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'] as const
const embeddingModel = z
  .enum(ALLOWED_EMBEDDING_MODELS)
  .default('text-embedding-3-small')
  .parse(process.env['EMBEDDING_MODEL'])

/**
 * Creates and starts the embedding-processing BullMQ worker.
 * Each job fetches a ticket transcript, generates an OpenAI embedding,
 * persists it to the pgvector column, and enqueues the ticket for clustering.
 */
export function startEmbeddingWorker(): Worker {
  const redisEnv = RedisEnvSchema.parse(process.env)

  const worker = new Worker(
    'embedding-processing',
    async (job) => {
      const parsed = JobDataSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.warn({ jobId: job.id, details: parsed.error.flatten() }, 'Invalid embedding job data — skipping')
        return
      }

      const { ticketId, requestId } = parsed.data
      logger.info({ ticketId, requestId }, 'Generating embedding for ticket')

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

      const response = await openai.embeddings.create({
        model: embeddingModel,
        input: ticket.transcript,
      })

      const embeddingVector = response.data[0]!.embedding

      await prisma.$executeRaw`
        UPDATE "Ticket"
        SET embedding = ${JSON.stringify(embeddingVector)}::vector,
            status = 'VECTORIZED',
            "updatedAt" = NOW()
        WHERE id = ${ticketId}::uuid
      `

      logger.info({ ticketId, requestId }, 'Embedding stored — enqueueing for clustering')
      await clusteringQueue.add('cluster-ticket', { ticketId, requestId })
    },
    {
      connection: {
        host: redisEnv.REDIS_HOST,
        port: redisEnv.REDIS_PORT,
        ...(redisEnv.REDIS_PASSWORD !== undefined && { password: redisEnv.REDIS_PASSWORD }),
      },
      concurrency: 1,
      limiter: { max: 1, duration: 2000 },
    }
  )

  worker.on('failed', (job, err) => {
    const requestId = (job?.data as { requestId?: string } | undefined)?.requestId
    logger.error({ jobId: job?.id, requestId, err }, 'Embedding worker job failed')
  })

  return worker
}
