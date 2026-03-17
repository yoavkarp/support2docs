import { Worker } from 'bullmq'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { DraftEventAction } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { openai } from '../lib/openai.js'
import { logger } from '../lib/logger.js'
import { buildKbDraftPrompt } from '../lib/prompts/kb-draft.js'
import { decrypt } from '../lib/crypto.js'

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
  orgId: z.string().uuid().optional(),
  requestId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Helper: resolve the first org in the system.
// Workers run outside a user request context, so we cannot use the
// user-scoped getOrCreateUserOrg() used by org.ts route handlers.
// Legacy jobs that were enqueued without an orgId fall back to the first org.
// ---------------------------------------------------------------------------
async function getFirstOrg(): Promise<{ id: string } | null> {
  return prisma.organization.findFirst()
}

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

      const { clusterId, orgId: jobOrgId, requestId } = parsed.data
      logger.info({ clusterId, requestId }, 'Starting synthesis for cluster')

      // 1. Resolve org and fetch its settings (fall back to first org for legacy jobs
      //    that were enqueued without an explicit orgId).
      const fallbackOrg = jobOrgId == null ? await getFirstOrg() : null
      if (jobOrgId == null && fallbackOrg == null) {
        logger.warn({ clusterId, requestId }, 'No orgId in job and no org in DB — skipping synthesis')
        return
      }
      const resolvedOrgId = jobOrgId ?? (fallbackOrg as { id: string }).id
      const orgSettings = await prisma.organizationSettings.findUnique({
        where: { orgId: resolvedOrgId },
      })

      // Resolve effective thresholds from org settings or env var fallbacks
      const clusterThreshold =
        orgSettings?.clusterThreshold ?? parseFloat(process.env['CLUSTER_THRESHOLD'] ?? '0.65')
      const minClusterSize =
        orgSettings?.minClusterSize ?? parseInt(process.env['MIN_CLUSTER_SIZE'] ?? '5', 10)
      const kbPublishUrl =
        orgSettings?.kbPublishUrl ?? process.env['KB_PUBLISH_URL'] ?? null
      // A10 — Guard against decrypt() throwing when a value was stored as
      // plaintext in dev-mode (no ORG_SECRETS_KEY) and the worker is later
      // started with ORG_SECRETS_KEY set (prod).  In that case Node's AES-GCM
      // decipher throws ERR_CRYPTO_INVALID_AUTH_TAG on decipher.final().
      // We fall back to the env-var value so the job can still proceed, and
      // log a warning so operators know a key rotation / re-save is needed.
      let zendeskApiKey: string | null = process.env['ZENDESK_API_KEY'] ?? null
      if (orgSettings?.zendeskApiKey) {
        try {
          zendeskApiKey = decrypt(orgSettings.zendeskApiKey)
        } catch (decryptErr) {
          logger.warn({ clusterId, resolvedOrgId, err: decryptErr }, 'Failed to decrypt zendeskApiKey — falling back to env var; re-save the org settings to re-encrypt')
        }
      }
      let intercomToken: string | null = process.env['INTERCOM_TOKEN'] ?? null
      if (orgSettings?.intercomToken) {
        try {
          intercomToken = decrypt(orgSettings.intercomToken)
        } catch (decryptErr) {
          logger.warn({ clusterId, resolvedOrgId, err: decryptErr }, 'Failed to decrypt intercomToken — falling back to env var; re-save the org settings to re-encrypt')
        }
      }

      logger.info(
        { clusterId, resolvedOrgId, clusterThreshold, minClusterSize, kbPublishUrl: !!kbPublishUrl, zendeskApiKey: !!zendeskApiKey, intercomToken: !!intercomToken },
        'Resolved org settings for synthesis',
      )

      // 2. Fetch cluster with tickets
      const cluster = await prisma.cluster.findUniqueOrThrow({
        where: { id: clusterId },
        include: { tickets: true },
      })

      // 3. Idempotency: skip if a draft already exists for this cluster
      const existingDraft = await prisma.draft.findFirst({ where: { clusterId } })
      if (existingDraft) {
        logger.info({ clusterId, requestId, draftId: existingDraft.id }, 'Draft already exists for cluster — skipping synthesis')
        return
      }

      // 4. Build prompt from cluster tickets
      const ticketInputs = (cluster.tickets as TicketRecord[]).map((t) => ({
        subject: t.subject,
        transcript: t.transcript,
      }))
      const prompt = buildKbDraftPrompt(ticketInputs)

      // 5. Call OpenAI GPT-4o
      const completion = await openai.chat.completions.create({
        model: synthesisModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      })

      const rawContent = completion.choices[0]?.message.content ?? ''

      // 6. Parse response — first line is title, rest is content
      const lines = rawContent.split('\n')
      const title = lines[0]?.trim() ?? 'Untitled KB Article'
      const content = lines.slice(1).join('\n').trimStart()

      // 7. Persist draft — stamp orgId for org-scoped data isolation
      const draft = await prisma.draft.create({
        data: {
          id: uuidv4(),
          title,
          content,
          clusterId,
          status: 'PENDING_REVIEW',
          orgId: resolvedOrgId,
        },
      })

      // 8. Record CREATED event for audit trail / reviewer attribution — stamp orgId
      await prisma.draftEvent.create({
        data: {
          id: uuidv4(),
          draftId: draft.id,
          action: DraftEventAction.CREATED,
          userId: 'system',
          userEmail: 'system',
          orgId: resolvedOrgId,
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
