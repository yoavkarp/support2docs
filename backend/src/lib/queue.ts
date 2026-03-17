import { Queue } from 'bullmq'
import { z } from 'zod'

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  // A02 — Redis authentication. Optional so local dev without a password still works;
  // set REDIS_PASSWORD in production to match the requirepass value in docker-compose.
  REDIS_PASSWORD: z.string().optional(),
})

const redisEnv = RedisEnvSchema.parse(process.env)

const connection = {
  host: redisEnv.REDIS_HOST,
  port: redisEnv.REDIS_PORT,
  ...(redisEnv.REDIS_PASSWORD !== undefined && { password: redisEnv.REDIS_PASSWORD }),
}

const retryJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
} as const

export const ticketQueue = new Queue('ticket-processing', { connection })

export const embeddingQueue = new Queue('embedding-processing', {
  connection,
  defaultJobOptions: retryJobOptions,
})

export const clusteringQueue = new Queue('clustering', {
  connection,
  defaultJobOptions: retryJobOptions,
})

export const synthesisQueue = new Queue('synthesis', {
  connection,
  defaultJobOptions: retryJobOptions,
})

export const publishQueue = new Queue('publish', {
  connection,
  defaultJobOptions: retryJobOptions,
})
