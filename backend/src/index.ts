import 'dotenv/config'
import { z } from 'zod'
import { logger } from './lib/logger.js'

// ---------------------------------------------------------------------------
// 2.0 — Startup env validation: fail fast before anything else loads.
// ---------------------------------------------------------------------------
const StartupEnvSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  // A10 — fail-fast at startup rather than at first embedding/synthesis call.
  OPENAI_API_KEY: z.string().min(1),
  // KB_PUBLISH_URL is optional (omit to disable publishing in local dev).
  KB_PUBLISH_URL: z.string().url().optional(),
})

const startupEnvResult = StartupEnvSchema.safeParse(process.env)
if (!startupEnvResult.success) {
  logger.error(
    { details: startupEnvResult.error.flatten() },
    'Missing or empty required environment variables — shutting down'
  )
  process.exit(1)
}

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { rateLimit } from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import Redis from 'ioredis'
import { v1Router } from './routes/v1/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestIdMiddleware } from './middleware/requestId.js'
import { startTicketWorker } from './workers/ticketWorker.js'
import { startEmbeddingWorker } from './workers/embeddingWorker.js'
import { startClusteringWorker } from './workers/clusteringWorker.js'
import { startSynthesisWorker } from './workers/synthesisWorker.js'
import { startPublishWorker } from './workers/publishWorker.js'

const app = express()
const PORT = process.env.PORT ?? 3001

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------
app.use(helmet())
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
const isDev = process.env.NODE_ENV !== 'production'
app.use(cors({
  origin: (origin, cb) => {
    // In dev, allow any localhost origin regardless of port
    if (!origin) return cb(null, true)
    if (isDev && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true)
    if (allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
}))

// 2.0 — X-Request-Id propagation (A09): must come before routes and logging.
app.use(requestIdMiddleware)

// 2.0 — Body size: reduced from 200kb to 50kb globally.
// Capture raw body buffer for webhook HMAC verification (A08) before JSON parsing.
app.use(
  express.json({
    limit: '50kb',
    verify: (req, _res, buf) => {
      // Attach raw body to the request for HMAC signature verification in the webhook route.
      (req as unknown as { rawBody: Buffer }).rawBody = buf
    },
  })
)
app.use(pinoHttp({ logger }))

// ---------------------------------------------------------------------------
// A04 — Redis-backed rate limiting so counters are shared across all process
// instances in multi-process / horizontally-scaled deployments.
// Falls back gracefully: if Redis is unreachable the limiter still enforces
// limits using the default in-memory store (express-rate-limit behaviour).
// ---------------------------------------------------------------------------
const rateLimitRedis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
})

rateLimitRedis.on('error', (err: unknown) => {
  logger.warn({ err }, 'Rate-limit Redis client error')
})

// ---------------------------------------------------------------------------
// 2.0 — Rate limiting (A04 / A06)
// ---------------------------------------------------------------------------

// Webhook endpoint: stricter limit — 100 req/min per IP.
const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — webhook rate limit exceeded' },
  store: new RedisStore({
    // ioredis exposes `call` as a variadic method; the cast satisfies the
    // SendCommand type that rate-limit-redis expects.
    sendCommand: (...args: string[]) => rateLimitRedis.call(args[0] as string, ...args.slice(1)) as Promise<RedisReply>,
    prefix: 'rl:wh:',
  }),
})

// All other /api/v1/* routes: 300 req/min per IP.
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — API rate limit exceeded' },
  store: new RedisStore({
    sendCommand: (...args: string[]) => rateLimitRedis.call(args[0] as string, ...args.slice(1)) as Promise<RedisReply>,
    prefix: 'rl:api:',
  }),
})

app.use('/api/v1/webhooks', webhookRateLimiter)
app.use('/api/v1', apiRateLimiter)

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

app.use('/api/v1', v1Router)
app.use(errorHandler)

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  logger.info(`Backend listening on port ${PORT}`)
  // 2.2 — Start the BullMQ ticket-processing worker after the HTTP server is up.
  startTicketWorker()
  // 3.x — Start Phase 3 AI pipeline workers.
  startEmbeddingWorker()
  startClusteringWorker()
  startSynthesisWorker()
  // 4.4 — Start Phase 4 publish worker.
  startPublishWorker()
})

export default app
