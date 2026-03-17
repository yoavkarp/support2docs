import { Worker } from 'bullmq'
import { z } from 'zod'
import { logger } from '../lib/logger.js'
import { embeddingQueue } from '../lib/queue.js'

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
})

const JobDataSchema = z.object({
  ticketId: z.string().uuid(),
  requestId: z.string().optional(),
})

/**
 * Creates and returns the ticket-processing BullMQ worker.
 * The worker is NOT started automatically on import — call startTicketWorker() from index.ts.
 */
export function startTicketWorker(): Worker {
  const redisEnv = RedisEnvSchema.parse(process.env)

  const worker = new Worker(
    'ticket-processing',
    async (job) => {
      const parsed = JobDataSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.warn({ jobId: job.id, details: parsed.error.flatten() }, 'Invalid job data — skipping')
        return
      }
      const { ticketId, requestId } = parsed.data
      logger.info({ ticketId, requestId }, 'Ticket received — enqueueing for embedding')
      await embeddingQueue.add('generate-embedding', { ticketId, requestId })
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
    logger.error({ jobId: job?.id, requestId, err }, 'Ticket worker job failed')
  })

  return worker
}
