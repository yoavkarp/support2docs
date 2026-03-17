import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock bullmq — Worker and Queue (queue.ts instantiates Queue at module load)
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
    },
    $executeRaw: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Mock openai
// ---------------------------------------------------------------------------
vi.mock('../../lib/openai.js', () => ({
  openai: {
    embeddings: {
      create: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock clusteringQueue (exported from queue.ts)
// ---------------------------------------------------------------------------
vi.mock('../../lib/queue.js', () => ({
  clusteringQueue: {
    add: vi.fn().mockResolvedValue(undefined),
  },
  embeddingQueue: { add: vi.fn() },
  synthesisQueue: { add: vi.fn() },
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
import { openai } from '../../lib/openai.js'
import { clusteringQueue } from '../../lib/queue.js'
import { logger } from '../../lib/logger.js'
import { startEmbeddingWorker } from '../embeddingWorker.js'

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

function getLastWorkerProcessor() {
  const calls = vi.mocked(Worker).mock.calls
  if (calls.length === 0) throw new Error('Worker was never constructed')
  const lastCall = calls[calls.length - 1] as [string, (job: { id: string; data: unknown }) => Promise<void>, unknown]
  return lastCall[1]
}

describe('startEmbeddingWorker()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['REDIS_HOST'] = 'localhost'
    process.env['REDIS_PORT'] = '6379'
  })

  it('creates a BullMQ Worker on the embedding-processing queue', () => {
    startEmbeddingWorker()
    expect(Worker).toHaveBeenCalledOnce()
    const calls = vi.mocked(Worker).mock.calls
    expect(calls[0]![0]).toBe('embedding-processing')
  })

  it('returns the Worker instance', () => {
    const result = startEmbeddingWorker()
    expect(result).toBeTruthy()
    expect(typeof result.on).toBe('function')
  })

  it('registers a failed event listener on the worker', () => {
    const worker = startEmbeddingWorker()
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  describe('processor — successful job', () => {
    it('fetches the ticket, calls OpenAI embeddings, stores via $executeRaw, and enqueues to clustering', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: VALID_UUID,
        transcript: 'User cannot log in',
      } as never)

      vi.mocked(openai.embeddings.create).mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      } as never)

      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)

      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()

      await processor({ id: 'job-1', data: { ticketId: VALID_UUID } })

      expect(prisma.ticket.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: VALID_UUID } })
      expect(openai.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'User cannot log in' }),
      )
      expect(prisma.$executeRaw).toHaveBeenCalledOnce()
      expect(clusteringQueue.add).toHaveBeenCalledWith('cluster-ticket', { ticketId: VALID_UUID })
    })

    it('passes the transcript from the ticket to the OpenAI embeddings call', async () => {
      const transcript = 'Password reset link expired for user@example.com'
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: VALID_UUID,
        transcript,
      } as never)
      vi.mocked(openai.embeddings.create).mockResolvedValue({
        data: [{ embedding: [0.5, 0.6] }],
      } as never)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never)

      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-2', data: { ticketId: VALID_UUID } })

      expect(openai.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({ input: transcript }),
      )
    })
  })

  describe('processor — OpenAI failure', () => {
    it('throws so BullMQ can retry the job', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockResolvedValue({
        id: VALID_UUID,
        transcript: 'some text',
      } as never)
      vi.mocked(openai.embeddings.create).mockRejectedValue(new Error('OpenAI 500'))

      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()

      await expect(processor({ id: 'job-3', data: { ticketId: VALID_UUID } })).rejects.toThrow('OpenAI 500')

      // Should not have attempted to store embedding or enqueue clustering
      expect(prisma.$executeRaw).not.toHaveBeenCalled()
      expect(clusteringQueue.add).not.toHaveBeenCalled()
    })
  })

  describe('processor — ticket not found', () => {
    it('throws (Prisma findUniqueOrThrow) so BullMQ can retry', async () => {
      vi.mocked(prisma.ticket.findUniqueOrThrow).mockRejectedValue(
        new Error('No Ticket found'),
      )

      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()

      await expect(processor({ id: 'job-4', data: { ticketId: VALID_UUID } })).rejects.toThrow('No Ticket found')

      expect(openai.embeddings.create).not.toHaveBeenCalled()
    })
  })

  describe('processor — invalid job data', () => {
    it('logs a warning and does NOT call OpenAI when ticketId is not a uuid', async () => {
      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-5', data: { ticketId: 'not-a-uuid' } }),
      ).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-5' }),
        expect.stringContaining('Invalid'),
      )
      expect(openai.embeddings.create).not.toHaveBeenCalled()
    })

    it('logs a warning when job data is an empty object', async () => {
      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()

      await expect(processor({ id: 'job-6', data: {} })).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledOnce()
      expect(openai.embeddings.create).not.toHaveBeenCalled()
    })

    it('logs a warning when job data is null', async () => {
      startEmbeddingWorker()
      const processor = getLastWorkerProcessor()

      await expect(processor({ id: 'job-7', data: null as unknown })).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledOnce()
      expect(openai.embeddings.create).not.toHaveBeenCalled()
    })
  })

  describe('failed event handler', () => {
    it('logs an error with jobId and err', () => {
      const worker = startEmbeddingWorker()
      const onCalls = vi.mocked(worker.on).mock.calls
      const failedCall = onCalls.find((c) => c[0] === 'failed')
      expect(failedCall).toBeDefined()

      const handler = failedCall![1] as (job: { id: string } | undefined, err: Error) => void
      const fakeErr = new Error('Redis timeout')
      handler({ id: 'job-8' }, fakeErr)

      expect(logger.error).toHaveBeenCalledWith(
        { jobId: 'job-8', err: fakeErr },
        'Embedding worker job failed',
      )
    })

    it('handles undefined job gracefully', () => {
      const worker = startEmbeddingWorker()
      const onCalls = vi.mocked(worker.on).mock.calls
      const failedCall = onCalls.find((c) => c[0] === 'failed')
      const handler = failedCall![1] as (job: undefined, err: Error) => void

      const fakeErr = new Error('Unknown')
      expect(() => handler(undefined, fakeErr)).not.toThrow()
      expect(logger.error).toHaveBeenCalledWith(
        { jobId: undefined, err: fakeErr },
        'Embedding worker job failed',
      )
    })
  })
})
