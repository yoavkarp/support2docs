import { Worker } from 'bullmq'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
})

const JobDataSchema = z.object({
  draftId: z.string().uuid(),
  requestId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// A10 — SSRF mitigation for KB_PUBLISH_URL
//
// z.string().url() only validates URL syntax — it accepts private/cloud-metadata
// addresses such as http://169.254.169.254 (AWS IMDS), http://localhost, or
// internal Docker network IPs.  We add a custom refinement that:
//   1. Requires the https: protocol in production (http: allowed only when
//      NODE_ENV is not 'production', so local dev against http://localhost still works).
//   2. Blocks all private/loopback/link-local IPv4 and IPv6 ranges.
//   3. Blocks the cloud metadata hostname used by AWS, GCP, Azure and Ali Cloud.
//
// If KB_PUBLISH_URL is absent, publishing is skipped gracefully so local dev
// without a KB endpoint is unaffected.
// ---------------------------------------------------------------------------

const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1$|fc|fd|fe80)/i

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'instance-data',          // AWS Windows metadata alias
])

function isSafePublishUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  // Require https in production; allow http only in non-production environments.
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return false
  }
  // Block non-http(s) schemes entirely (file://, ftp://, data://, javascript://).
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false
  }
  const hostname = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(hostname)) return false
  if (PRIVATE_IP_RE.test(hostname)) return false
  return true
}

const KB_PUBLISH_URL_SCHEMA = z
  .string()
  .url()
  .refine(isSafePublishUrl, {
    message:
      'KB_PUBLISH_URL must use https and must not point to a private, loopback, or cloud-metadata address (SSRF prevention)',
  })
  .optional()

interface PublishResponseBody {
  url?: string
  id?: string
  [key: string]: unknown
}

/**
 * Creates and starts the publish BullMQ worker.
 * Each job fetches an APPROVED draft and POSTs it to KB_PUBLISH_URL.
 * On success the returned url/id is persisted back to Draft.publishedUrl.
 * BullMQ will retry up to 3 times with exponential backoff on failure.
 */
export function startPublishWorker(): Worker {
  const redisEnv = RedisEnvSchema.parse(process.env)

  // Validate KB_PUBLISH_URL once at worker startup (not per-job) so the warning
  // appears only once in logs rather than on every job execution.
  const kbPublishUrlResult = KB_PUBLISH_URL_SCHEMA.safeParse(process.env['KB_PUBLISH_URL'])
  const kbPublishUrl: string | undefined = kbPublishUrlResult.success
    ? kbPublishUrlResult.data
    : undefined

  if (!kbPublishUrl) {
    logger.warn(
      'KB_PUBLISH_URL is not set or invalid — publish worker will skip actual HTTP publishing',
    )
  }

  const worker = new Worker(
    'publish',
    async (job) => {
      const parsed = JobDataSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.warn(
          { jobId: job.id, details: parsed.error.flatten() },
          'Invalid publish job data — skipping',
        )
        return
      }

      const { draftId, requestId } = parsed.data
      logger.info({ draftId, requestId }, 'Starting publish for draft')

      // 1. Fetch draft
      const draft = await prisma.draft.findUnique({ where: { id: draftId } })
      if (!draft) {
        logger.warn({ draftId, requestId }, 'Draft not found — skipping publish')
        return
      }

      // 2. POST to KB endpoint (skip gracefully if URL not configured)
      if (!kbPublishUrl) {
        logger.info({ draftId, requestId }, 'KB_PUBLISH_URL not configured — skipping HTTP publish')
        return
      }

      const response = await fetch(kbPublishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, title: draft.title, content: draft.content }),
      })

      // 3. On non-2xx throw so BullMQ triggers retry (max 3 attempts, exponential backoff)
      if (!response.ok) {
        throw new Error(
          `KB publish request failed: ${response.status} ${response.statusText}`,
        )
      }

      // 4. Parse response for url or id field and persist publishedUrl.
      //    A10/A03 — validate the returned URL before persisting: only allow
      //    https: (or http: in non-production) and block private/JS URIs so
      //    that a compromised KB endpoint cannot inject a javascript: or
      //    data: href that would be rendered as a clickable link in the UI.
      let publishedUrl: string | undefined
      try {
        const body = (await response.json()) as PublishResponseBody
        const candidate =
          typeof body.url === 'string'
            ? body.url
            : typeof body.id === 'string'
              ? `${kbPublishUrl}/${body.id}`
              : undefined
        if (candidate !== undefined) {
          if (isSafePublishUrl(candidate)) {
            publishedUrl = candidate
          } else {
            logger.warn({ draftId, requestId, candidate }, 'KB publish response contained an unsafe URL — publishedUrl not stored')
          }
        }
      } catch {
        // Response body is not JSON — that's acceptable; just leave publishedUrl empty
        logger.warn({ draftId, requestId }, 'KB publish response was not JSON — publishedUrl not stored')
      }

      if (publishedUrl) {
        await prisma.draft.update({
          where: { id: draftId },
          data: { publishedUrl },
        })
        logger.info({ draftId, requestId, publishedUrl }, 'Draft published and URL persisted')
      } else {
        logger.info({ draftId, requestId }, 'Draft published (no URL returned)')
      }
    },
    {
      connection: {
        host: redisEnv.REDIS_HOST,
        port: redisEnv.REDIS_PORT,
        ...(redisEnv.REDIS_PASSWORD !== undefined && { password: redisEnv.REDIS_PASSWORD }),
      },
    },
  )

  worker.on('failed', (job, err) => {
    const requestId = (job?.data as { requestId?: string } | undefined)?.requestId
    logger.error({ jobId: job?.id, requestId, err }, 'Publish worker job failed')
  })

  return worker
}
