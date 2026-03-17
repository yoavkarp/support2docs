import { Worker } from 'bullmq'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { openai } from '../lib/openai.js'
import { logger } from '../lib/logger.js'
import { clusteringQueue } from '../lib/queue.js'

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
})

const JobDataSchema = z.object({
  ticketId: z.string().uuid(),
  requestId: z.string().optional(),
})

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
        model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
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
      },
    }
  )

  worker.on('failed', (job, err) => {
    const requestId = (job?.data as { requestId?: string } | undefined)?.requestId
    logger.error({ jobId: job?.id, requestId, err }, 'Embedding worker job failed')
  })

  return worker
}
