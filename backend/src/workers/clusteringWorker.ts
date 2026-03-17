import { Worker } from 'bullmq'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { synthesisQueue } from '../lib/queue.js'

const RedisEnvSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
})

const ClusteringEnvSchema = z.object({
  CLUSTERING_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  CLUSTERING_MIN_TICKETS: z.coerce.number().int().min(1).default(5),
})

const JobDataSchema = z.object({
  ticketId: z.string().uuid(),
  requestId: z.string().optional(),
})

interface NeighborRow {
  id: string
  similarity: number
}

interface TicketClusterRow {
  id: string
  clusterId: string | null
}

/**
 * Creates and starts the clustering BullMQ worker.
 * Each job finds neighbor tickets via pgvector cosine similarity,
 * assigns them to a cluster, recomputes the centroid, and
 * triggers draft synthesis once the cluster reaches the minimum size.
 */
export function startClusteringWorker(): Worker {
  const redisEnv = RedisEnvSchema.parse(process.env)

  const worker = new Worker(
    'clustering',
    async (job) => {
      const parsed = JobDataSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.warn({ jobId: job.id, details: parsed.error.flatten() }, 'Invalid clustering job data — skipping')
        return
      }

      const { ticketId, requestId } = parsed.data

      const clusteringEnv = ClusteringEnvSchema.parse(process.env)
      const threshold = clusteringEnv.CLUSTERING_SIMILARITY_THRESHOLD
      const minTickets = clusteringEnv.CLUSTERING_MIN_TICKETS

      logger.info({ ticketId, requestId, threshold, minTickets }, 'Running clustering for ticket')

      // 1. Fetch the ticket — must be VECTORIZED or CLUSTERED
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
      if (ticket.status !== 'VECTORIZED' && ticket.status !== 'CLUSTERED') {
        logger.warn({ ticketId, requestId, status: ticket.status }, 'Ticket not in VECTORIZED/CLUSTERED status — skipping')
        return
      }

      // 2. Find neighbor tickets using pgvector cosine similarity
      const neighbors = await prisma.$queryRaw<NeighborRow[]>`
        SELECT id, 1 - (embedding <=> (
          SELECT embedding FROM "Ticket" WHERE id = ${ticketId}::uuid
        )) AS similarity
        FROM "Ticket"
        WHERE status IN ('VECTORIZED', 'CLUSTERED')
          AND id != ${ticketId}::uuid
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> (SELECT embedding FROM "Ticket" WHERE id = ${ticketId}::uuid)) >= ${threshold}
        ORDER BY similarity DESC
        LIMIT 50
      `

      logger.info({ ticketId, requestId, neighborCount: neighbors.length }, 'Found neighbor tickets')

      // Collect all neighbor IDs once for reuse
      const allNeighborIds = neighbors.map((n: NeighborRow) => n.id)

      // 3. Determine cluster membership
      let clusterId: string

      if (ticket.clusterId) {
        // Current ticket already has a cluster
        clusterId = ticket.clusterId
      } else {
        // Check if any neighbor belongs to an existing cluster
        const neighborsWithCluster: TicketClusterRow[] = allNeighborIds.length > 0
          ? await prisma.$queryRaw<TicketClusterRow[]>`
              SELECT id, "clusterId"
              FROM "Ticket"
              WHERE id = ANY(${allNeighborIds}::uuid[])
                AND "clusterId" IS NOT NULL
              LIMIT 1
            `
          : []

        if (neighborsWithCluster.length > 0 && neighborsWithCluster[0]!.clusterId) {
          clusterId = neighborsWithCluster[0]!.clusterId
        } else {
          // Create a new cluster
          const newCluster = await prisma.cluster.create({
            data: { id: uuidv4(), status: 'FORMING' },
          })
          clusterId = newCluster.id
          logger.info({ clusterId, requestId }, 'New cluster created')
        }
      }

      // 4. Find neighbor IDs not yet assigned to this cluster, then assign all
      const unassignedNeighborIds: string[] = allNeighborIds.length > 0
        ? (await prisma.$queryRaw<TicketClusterRow[]>`
            SELECT id, "clusterId"
            FROM "Ticket"
            WHERE id = ANY(${allNeighborIds}::uuid[])
              AND ("clusterId" IS NULL OR "clusterId" != ${clusterId}::uuid)
          `).map((r: TicketClusterRow) => r.id)
        : []

      const ticketsToAssign = [ticketId, ...unassignedNeighborIds]

      await prisma.ticket.updateMany({
        where: { id: { in: ticketsToAssign } },
        data: { clusterId, status: 'CLUSTERED' },
      })

      logger.info({ clusterId, requestId, assignedCount: ticketsToAssign.length }, 'Tickets assigned to cluster')

      // 5. Recompute cluster centroid (average of all member embeddings)
      await prisma.$executeRaw`
        UPDATE "Cluster"
        SET centroid = (
          SELECT AVG(embedding) FROM "Ticket" WHERE "clusterId" = ${clusterId}::uuid AND embedding IS NOT NULL
        ), "updatedAt" = NOW()
        WHERE id = ${clusterId}::uuid
      `

      // 6. Count cluster members and check threshold
      const memberCount = await prisma.ticket.count({ where: { clusterId } })

      logger.info({ clusterId, requestId, memberCount, minTickets }, 'Cluster member count after update')

      if (memberCount >= minTickets) {
        await prisma.cluster.update({
          where: { id: clusterId },
          data: { status: 'READY' },
        })
        logger.info({ clusterId, requestId, memberCount }, 'Cluster is READY — enqueueing synthesis')
        await synthesisQueue.add('synthesize-draft', { clusterId, requestId })
      }
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
    logger.error({ jobId: job?.id, requestId, err }, 'Clustering worker job failed')
  })

  return worker
}
