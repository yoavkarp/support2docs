import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock bullmq
// ---------------------------------------------------------------------------
vi.mock('bullmq', () => {
  const WorkerMock = vi.fn(function (
    this: { on: ReturnType<typeof vi.fn> },
    _queueName: string,
    _processor: unknown,
    _opts: unknown,
  ) {
    this.on = vi.fn()
  })
  const QueueMock = vi.fn(function (
    this: { add: ReturnType<typeof vi.fn> },
    _queueName: string,
    _opts: unknown,
  ) {
    this.add = vi.fn().mockResolvedValue(undefined)
  })
  return { Worker: WorkerMock, Queue: QueueMock }
})

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    ticket: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    cluster: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Mock synthesisQueue
// ---------------------------------------------------------------------------
vi.mock('../../lib/queue.js', () => ({
  synthesisQueue: {
    add: vi.fn().mockResolvedValue(undefined),
  },
  embeddingQueue: { add: vi.fn() },
  clusteringQueue: { add: vi.fn() },
  publishQueue: { add: vi.fn() },
  ticketQueue: { add: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { Worker } from 'bullmq'
import { prisma } from '../../lib/prisma.js'
import { synthesisQueue } from '../../lib/queue.js'
import { logger } from '../../lib/logger.js'
import { startClusteringWorker } from '../clusteringWorker.js'

const TICKET_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const CLUSTER_UUID = 'b1ffc3dd-1d0c-4ef8-aa7e-7cc0ce2c5d22'
const NEIGHBOR_UUID = 'c2aad4ee-2e1d-4ef8-bb8f-8dd1df3d6e33'

function getLastWorkerProcessor() {
  const calls = vi.mocked(Worker).mock.calls
  if (calls.length === 0) throw new Error('Worker was never constructed')
  const lastCall = calls[calls.length - 1] as [string, (job: { id: string; data: unknown }) => Promise<void>, unknown]
  return lastCall[1]
}

describe('startClusteringWorker()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['REDIS_HOST'] = 'localhost'
    process.env['REDIS_PORT'] = '6379'
    // Defaults: threshold 0.85, minTickets 5
    delete process.env['CLUSTERING_SIMILARITY_THRESHOLD']
    delete process.env['CLUSTERING_MIN_TICKETS']
  })

  it('creates a BullMQ Worker on the clustering queue', () => {
    startClusteringWorker()
    const calls = vi.mocked(Worker).mock.calls
    expect(calls[0]![0]).toBe('clustering')
  })

  it('returns the Worker instance', () => {
    const result = startClusteringWorker()
    expect(result).toBeTruthy()
    expect(typeof result.on).toBe('function')
  })

  describe('processor — no neighbors found, creates new cluster', () => {
    it('creates a new cluster and assigns the ticket when there are no neighbors', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'VECTORIZED',
        clusterId: null,
      } as never)

      // No neighbors found
      vi.mocked(prisma.$queryRaw).mockResolvedValue([])
      vi.mocked(prisma.cluster.create).mockResolvedValue({ id: CLUSTER_UUID, status: 'FORMING' } as never)
      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(1)

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-1', data: { ticketId: TICKET_UUID } })

      expect(prisma.cluster.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FORMING' }) }),
      )
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [TICKET_UUID] } },
          data: { clusterId: CLUSTER_UUID, status: 'CLUSTERED' },
        }),
      )
    })

    it('does NOT enqueue synthesis when member count is below threshold', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'VECTORIZED',
        clusterId: null,
      } as never)
      vi.mocked(prisma.$queryRaw).mockResolvedValue([])
      vi.mocked(prisma.cluster.create).mockResolvedValue({ id: CLUSTER_UUID, status: 'FORMING' } as never)
      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(3) // below threshold of 5

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-2', data: { ticketId: TICKET_UUID } })

      expect(synthesisQueue.add).not.toHaveBeenCalled()
      expect(prisma.cluster.update).not.toHaveBeenCalled()
    })
  })

  describe('processor — neighbors found, count < threshold (5)', () => {
    it('assigns ticket to existing neighbor cluster but does NOT enqueue synthesis', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'VECTORIZED',
        clusterId: null,
      } as never)

      // One neighbor found in similarity query
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ id: NEIGHBOR_UUID, similarity: 0.92 }]) // neighbors
        .mockResolvedValueOnce([{ id: NEIGHBOR_UUID, clusterId: CLUSTER_UUID }]) // neighborsWithCluster
        .mockResolvedValueOnce([]) // unassignedNeighborIds (neighbor already in cluster)

      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(4) // below threshold

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-3', data: { ticketId: TICKET_UUID } })

      expect(prisma.cluster.create).not.toHaveBeenCalled() // joined existing cluster
      expect(synthesisQueue.add).not.toHaveBeenCalled()
    })
  })

  describe('processor — neighbors found, count >= threshold (5)', () => {
    it('sets cluster status to READY and enqueues synthesis', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'VECTORIZED',
        clusterId: null,
      } as never)

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ id: NEIGHBOR_UUID, similarity: 0.95 }])
        .mockResolvedValueOnce([{ id: NEIGHBOR_UUID, clusterId: CLUSTER_UUID }])
        .mockResolvedValueOnce([])

      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(5) // exactly at threshold
      vi.mocked(prisma.cluster.update).mockResolvedValue({ id: CLUSTER_UUID, status: 'READY' } as never)

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-4', data: { ticketId: TICKET_UUID } })

      expect(prisma.cluster.update).toHaveBeenCalledWith({
        where: { id: CLUSTER_UUID },
        data: { status: 'READY' },
      })
      expect(synthesisQueue.add).toHaveBeenCalledWith('synthesize-draft', { clusterId: CLUSTER_UUID })
    })

    it('fires synthesis when count exceeds threshold (e.g. 7 tickets)', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'VECTORIZED',
        clusterId: null,
      } as never)

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ id: NEIGHBOR_UUID, similarity: 0.91 }])
        .mockResolvedValueOnce([{ id: NEIGHBOR_UUID, clusterId: CLUSTER_UUID }])
        .mockResolvedValueOnce([])

      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(7) // above threshold
      vi.mocked(prisma.cluster.update).mockResolvedValue({ id: CLUSTER_UUID, status: 'READY' } as never)

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-5', data: { ticketId: TICKET_UUID } })

      expect(synthesisQueue.add).toHaveBeenCalledOnce()
    })
  })

  describe('processor — ticket already in cluster', () => {
    it('uses the existing clusterId rather than creating a new cluster', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'CLUSTERED',
        clusterId: CLUSTER_UUID,
      } as never)

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([]) // no new neighbors
        .mockResolvedValueOnce([]) // empty unassigned list

      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(2)

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-6', data: { ticketId: TICKET_UUID } })

      expect(prisma.cluster.create).not.toHaveBeenCalled()
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { clusterId: CLUSTER_UUID, status: 'CLUSTERED' },
        }),
      )
    })
  })

  describe('processor — skips non-vectorized ticket', () => {
    it('logs a warning and returns when ticket status is PENDING', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'PENDING',
        clusterId: null,
      } as never)

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-7', data: { ticketId: TICKET_UUID } })

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: TICKET_UUID, status: 'PENDING' }),
        expect.any(String),
      )
      expect(prisma.$queryRaw).not.toHaveBeenCalled()
    })
  })

  describe('processor — invalid job data', () => {
    it('logs a warning and does not process when ticketId is not a uuid', async () => {
      startClusteringWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-8', data: { ticketId: 'bad-id' } }),
      ).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-8' }),
        expect.stringContaining('Invalid'),
      )
      expect(prisma.ticket.findUniqueOrThrow).not.toHaveBeenCalled()
    })

    it('handles missing job data gracefully', async () => {
      startClusteringWorker()
      const processor = getLastWorkerProcessor()

      await expect(processor({ id: 'job-9', data: {} })).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledOnce()
    })
  })

  describe('processor — configurable threshold via env', () => {
    it('uses CLUSTERING_MIN_TICKETS env var to set synthesis threshold', async () => {
      process.env['CLUSTERING_MIN_TICKETS'] = '3'

      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: TICKET_UUID,
        status: 'VECTORIZED',
        clusterId: null,
      } as never)

      vi.mocked(prisma.$queryRaw).mockResolvedValue([])
      vi.mocked(prisma.cluster.create).mockResolvedValue({ id: CLUSTER_UUID, status: 'FORMING' } as never)
      vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)
      vi.mocked(prisma.ticket.count).mockResolvedValue(3) // meets custom threshold of 3
      vi.mocked(prisma.cluster.update).mockResolvedValue({ id: CLUSTER_UUID, status: 'READY' } as never)

      startClusteringWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-10', data: { ticketId: TICKET_UUID } })

      expect(synthesisQueue.add).toHaveBeenCalledOnce()
    })
  })

  describe('failed event handler', () => {
    it('logs an error', () => {
      const worker = startClusteringWorker()
      const onCalls = vi.mocked(worker.on).mock.calls
      const failedCall = onCalls.find((c) => c[0] === 'failed')
      expect(failedCall).toBeDefined()

      const handler = failedCall![1] as (job: { id: string } | undefined, err: Error) => void
      const fakeErr = new Error('DB crash')
      handler({ id: 'job-11' }, fakeErr)

      expect(logger.error).toHaveBeenCalledWith(
        { jobId: 'job-11', err: fakeErr },
        'Clustering worker job failed',
      )
    })
  })
})
