import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    draft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock queue exports
// ---------------------------------------------------------------------------
vi.mock('../../lib/queue.js', () => ({
  publishQueue: { add: vi.fn() },
  embeddingQueue: { add: vi.fn() },
  clusteringQueue: { add: vi.fn() },
  synthesisQueue: { add: vi.fn() },
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
import { logger } from '../../lib/logger.js'

const DRAFT_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const KB_PUBLISH_URL = 'https://kb.example.com/publish'

const mockDraft = {
  id: DRAFT_UUID,
  title: 'How to reset password',
  content: 'Step 1: Go to login page...',
  status: 'APPROVED',
  clusterId: 'cluster-1',
  publishedUrl: null,
}

function getLastWorkerProcessor() {
  const calls = vi.mocked(Worker).mock.calls
  if (calls.length === 0) throw new Error('Worker was never constructed')
  const lastCall = calls[calls.length - 1] as [string, (job: { id: string; data: unknown }) => Promise<void>, unknown]
  return lastCall[1]
}

describe('startPublishWorker()', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    process.env['REDIS_HOST'] = 'localhost'
    process.env['REDIS_PORT'] = '6379'
    process.env['KB_PUBLISH_URL'] = KB_PUBLISH_URL
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env['KB_PUBLISH_URL']
  })

  it('creates a BullMQ Worker on the publish queue', async () => {
    const { startPublishWorker } = await import('../publishWorker.js')
    startPublishWorker()
    const calls = vi.mocked(Worker).mock.calls
    expect(calls[calls.length - 1]![0]).toBe('publish')
  })

  it('registers a failed event listener', async () => {
    const { startPublishWorker } = await import('../publishWorker.js')
    const worker = startPublishWorker()
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  describe('processor — successful publish', () => {
    it('POSTs to KB_PUBLISH_URL with draft id, title and content', async () => {
      vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
      vi.mocked(prisma.draft.update).mockResolvedValue({ ...mockDraft, publishedUrl: `${KB_PUBLISH_URL}/123` } as never)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: `${KB_PUBLISH_URL}/123` }),
      })
      globalThis.fetch = mockFetch

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-1', data: { draftId: DRAFT_UUID } })

      expect(mockFetch).toHaveBeenCalledWith(
        KB_PUBLISH_URL,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining(mockDraft.title),
        }),
      )
    })

    it('persists the returned url to Draft.publishedUrl', async () => {
      const publishedUrl = `${KB_PUBLISH_URL}/article-456`
      vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
      vi.mocked(prisma.draft.update).mockResolvedValue({ ...mockDraft, publishedUrl } as never)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: publishedUrl }),
      })

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-2', data: { draftId: DRAFT_UUID } })

      expect(prisma.draft.update).toHaveBeenCalledWith({
        where: { id: DRAFT_UUID },
        data: { publishedUrl },
      })
    })

    it('builds publishedUrl from id field when url field absent', async () => {
      vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)
      vi.mocked(prisma.draft.update).mockResolvedValue(mockDraft as never)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'article-789' }),
      })

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-3', data: { draftId: DRAFT_UUID } })

      expect(prisma.draft.update).toHaveBeenCalledWith({
        where: { id: DRAFT_UUID },
        data: { publishedUrl: `${KB_PUBLISH_URL}/article-789` },
      })
    })
  })

  describe('processor — KB_PUBLISH_URL missing', () => {
    it('logs a warning and skips HTTP call when KB_PUBLISH_URL is not set', async () => {
      delete process.env['KB_PUBLISH_URL']

      const mockFetch = vi.fn()
      globalThis.fetch = mockFetch

      vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-4', data: { draftId: DRAFT_UUID } })

      expect(mockFetch).not.toHaveBeenCalled()
      // logger.warn called once at startup for missing URL
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('KB_PUBLISH_URL'),
      )
    })
  })

  describe('processor — non-2xx response', () => {
    it('throws so BullMQ can retry', async () => {
      vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-5', data: { draftId: DRAFT_UUID } }),
      ).rejects.toThrow(/KB publish request failed: 503/)
    })
  })

  describe('processor — network error', () => {
    it('throws for BullMQ retry when fetch rejects', async () => {
      vi.mocked(prisma.draft.findUnique).mockResolvedValue(mockDraft as never)

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-6', data: { draftId: DRAFT_UUID } }),
      ).rejects.toThrow('ECONNREFUSED')
    })
  })

  describe('processor — draft not found', () => {
    it('logs a warning and skips publish when draft does not exist in DB', async () => {
      vi.mocked(prisma.draft.findUnique).mockResolvedValue(null)

      const mockFetch = vi.fn()
      globalThis.fetch = mockFetch

      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-7', data: { draftId: DRAFT_UUID } })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ draftId: DRAFT_UUID }),
        expect.stringContaining('not found'),
      )
    })
  })

  describe('processor — invalid job data', () => {
    it('logs a warning and skips when draftId is not a uuid', async () => {
      const { startPublishWorker } = await import('../publishWorker.js')
      startPublishWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-8', data: { draftId: 'not-a-uuid' } }),
      ).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-8' }),
        expect.stringContaining('Invalid'),
      )
      expect(prisma.draft.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('failed event handler', () => {
    it('logs an error', async () => {
      const { startPublishWorker } = await import('../publishWorker.js')
      const worker = startPublishWorker()
      const onCalls = vi.mocked(worker.on).mock.calls
      const failedCall = onCalls.find((c) => c[0] === 'failed')
      expect(failedCall).toBeDefined()

      const handler = failedCall![1] as (job: { id: string } | undefined, err: Error) => void
      const fakeErr = new Error('Publish failed')
      handler({ id: 'job-9' }, fakeErr)

      expect(logger.error).toHaveBeenCalledWith(
        { jobId: 'job-9', err: fakeErr },
        'Publish worker job failed',
      )
    })
  })
})
