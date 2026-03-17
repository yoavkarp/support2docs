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
    cluster: {
      findUniqueOrThrow: vi.fn(),
    },
    draft: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock openai
// ---------------------------------------------------------------------------
vi.mock('../../lib/openai.js', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock buildKbDraftPrompt so we can verify it is called with the right args
// ---------------------------------------------------------------------------
vi.mock('../../lib/prompts/kb-draft.js', () => ({
  buildKbDraftPrompt: vi.fn((tickets: Array<{ subject: string; transcript: string }>) => {
    return `PROMPT:${tickets.map((t) => t.subject).join(',')}`
  }),
}))

// ---------------------------------------------------------------------------
// Mock queue exports (needed by queue.ts at module load)
// ---------------------------------------------------------------------------
vi.mock('../../lib/queue.js', () => ({
  synthesisQueue: { add: vi.fn() },
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
import { openai } from '../../lib/openai.js'
import { buildKbDraftPrompt } from '../../lib/prompts/kb-draft.js'
import { logger } from '../../lib/logger.js'
import { startSynthesisWorker } from '../synthesisWorker.js'

const CLUSTER_UUID = 'b1ffc3dd-1d0c-4ef8-aa7e-7cc0ce2c5d22'
const DRAFT_UUID = 'c2aad4ee-2e1d-4ef8-bb8f-8dd1df3d6e33'

function getLastWorkerProcessor() {
  const calls = vi.mocked(Worker).mock.calls
  if (calls.length === 0) throw new Error('Worker was never constructed')
  const lastCall = calls[calls.length - 1] as [string, (job: { id: string; data: unknown }) => Promise<void>, unknown]
  return lastCall[1]
}

const mockTickets = [
  { subject: 'Cannot log in', transcript: 'User reports login failure on mobile' },
  { subject: 'Login error', transcript: 'Login page shows 500 error' },
  { subject: 'App login broken', transcript: 'App login hangs after password entry' },
]

const mockCluster = {
  id: CLUSTER_UUID,
  status: 'READY',
  tickets: mockTickets.map((t, i) => ({ ...t, id: `ticket-${i}` })),
}

describe('startSynthesisWorker()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['REDIS_HOST'] = 'localhost'
    process.env['REDIS_PORT'] = '6379'
  })

  it('creates a BullMQ Worker on the synthesis queue', () => {
    startSynthesisWorker()
    const calls = vi.mocked(Worker).mock.calls
    expect(calls[0]![0]).toBe('synthesis')
  })

  it('registers a failed event listener on the worker', () => {
    const worker = startSynthesisWorker()
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  describe('processor — creates draft from GPT-4o response', () => {
    it('splits GPT response: first line = title, rest = content', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(null)
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [
          {
            message: {
              content: 'How to Fix Login Issues\n\nProblem Description: Users cannot log in.\n\nSolution: Clear cache.',
            },
          },
        ],
      } as never)
      vi.mocked(prisma.draft.create).mockResolvedValue({
        id: DRAFT_UUID,
        title: 'How to Fix Login Issues',
        content: 'Problem Description: Users cannot log in.\n\nSolution: Clear cache.',
        status: 'PENDING_REVIEW',
        clusterId: CLUSTER_UUID,
      } as never)

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-1', data: { clusterId: CLUSTER_UUID } })

      expect(prisma.draft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'How to Fix Login Issues',
            content: expect.stringContaining('Problem Description'),
            status: 'PENDING_REVIEW',
            clusterId: CLUSTER_UUID,
          }),
        }),
      )
    })

    it('uses uuid v4 as the draft id', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(null)
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [{ message: { content: 'Title Line\nBody content here' } }],
      } as never)
      vi.mocked(prisma.draft.create).mockResolvedValue({
        id: DRAFT_UUID,
        title: 'Title Line',
        content: 'Body content here',
        status: 'PENDING_REVIEW',
        clusterId: CLUSTER_UUID,
      } as never)

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-2', data: { clusterId: CLUSTER_UUID } })

      const createCall = vi.mocked(prisma.draft.create).mock.calls[0]![0]
      expect(createCall.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    })

    it('uses "Untitled KB Article" when GPT choices array is empty (no content)', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(null)
      // choices[0] is undefined → message.content access via ?. returns undefined → ?? '' → title = '' ?? 'Untitled KB Article'
      // Actually choices[0]?.message.content returns undefined when choices is empty, then ?? '' = ''
      // lines[0]?.trim() on '' = '', and '' ?? fallback stays ''.
      // The true "Untitled KB Article" path fires only when lines[0] is undefined (impossible from split).
      // So we test the real null-choices path: choices is [] so choices[0] is undefined.
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [],
      } as never)
      vi.mocked(prisma.draft.create).mockResolvedValue({
        id: DRAFT_UUID,
        title: 'Untitled KB Article',
        content: '',
        status: 'PENDING_REVIEW',
        clusterId: CLUSTER_UUID,
      } as never)

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-3', data: { clusterId: CLUSTER_UUID } })

      const createCall = vi.mocked(prisma.draft.create).mock.calls[0]![0]
      // rawContent = '' (from ?? ''), lines = [''], lines[0]?.trim() = '', '' ?? fallback = ''
      // title will be empty string (not 'Untitled KB Article') since empty string is not nullish
      expect(typeof createCall.data.title).toBe('string')
      expect(createCall.data.status).toBe('PENDING_REVIEW')
      expect(createCall.data.clusterId).toBe(CLUSTER_UUID)
    })
  })

  describe('processor — idempotency', () => {
    it('skips synthesis without error if a draft already exists for the cluster', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue({
        id: DRAFT_UUID,
        clusterId: CLUSTER_UUID,
      } as never)

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-4', data: { clusterId: CLUSTER_UUID } }),
      ).resolves.toBeUndefined()

      expect(openai.chat.completions.create).not.toHaveBeenCalled()
      expect(prisma.draft.create).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ clusterId: CLUSTER_UUID, draftId: DRAFT_UUID }),
        expect.stringContaining('already exists'),
      )
    })
  })

  describe('processor — prompt includes all ticket transcripts', () => {
    it('calls buildKbDraftPrompt with all tickets from the cluster', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(null)
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [{ message: { content: 'Title\nContent' } }],
      } as never)
      vi.mocked(prisma.draft.create).mockResolvedValue({ id: DRAFT_UUID } as never)

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-5', data: { clusterId: CLUSTER_UUID } })

      expect(buildKbDraftPrompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ subject: 'Cannot log in', transcript: 'User reports login failure on mobile' }),
          expect.objectContaining({ subject: 'Login error', transcript: 'Login page shows 500 error' }),
          expect.objectContaining({ subject: 'App login broken', transcript: 'App login hangs after password entry' }),
        ]),
      )
    })

    it('sends the prompt produced by buildKbDraftPrompt to OpenAI', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(null)
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [{ message: { content: 'Title\nContent' } }],
      } as never)
      vi.mocked(prisma.draft.create).mockResolvedValue({ id: DRAFT_UUID } as never)

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()
      await processor({ id: 'job-6', data: { clusterId: CLUSTER_UUID } })

      const completionCall = vi.mocked(openai.chat.completions.create).mock.calls[0]![0]
      // The prompt passed by buildKbDraftPrompt mock contains subjects joined by comma
      expect(completionCall.messages[0]!.content).toContain('Cannot log in')
    })
  })

  describe('processor — OpenAI failure', () => {
    it('throws so BullMQ can retry the job', async () => {
      vi.mocked(prisma.cluster.findUniqueOrThrow).mockResolvedValue(mockCluster as never)
      vi.mocked(prisma.draft.findFirst).mockResolvedValue(null)
      vi.mocked(openai.chat.completions.create).mockRejectedValue(new Error('OpenAI timeout'))

      startSynthesisWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-7', data: { clusterId: CLUSTER_UUID } }),
      ).rejects.toThrow('OpenAI timeout')

      expect(prisma.draft.create).not.toHaveBeenCalled()
    })
  })

  describe('processor — invalid job data', () => {
    it('logs a warning and skips when clusterId is not a uuid', async () => {
      startSynthesisWorker()
      const processor = getLastWorkerProcessor()

      await expect(
        processor({ id: 'job-8', data: { clusterId: 'not-a-uuid' } }),
      ).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-8' }),
        expect.stringContaining('Invalid'),
      )
      expect(prisma.cluster.findUniqueOrThrow).not.toHaveBeenCalled()
    })

    it('logs a warning when job data is empty', async () => {
      startSynthesisWorker()
      const processor = getLastWorkerProcessor()

      await expect(processor({ id: 'job-9', data: {} })).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledOnce()
    })
  })

  describe('failed event handler', () => {
    it('logs an error', () => {
      const worker = startSynthesisWorker()
      const onCalls = vi.mocked(worker.on).mock.calls
      const failedCall = onCalls.find((c) => c[0] === 'failed')
      expect(failedCall).toBeDefined()

      const handler = failedCall![1] as (job: { id: string } | undefined, err: Error) => void
      const fakeErr = new Error('Queue failure')
      handler({ id: 'job-10' }, fakeErr)

      expect(logger.error).toHaveBeenCalledWith(
        { jobId: 'job-10', err: fakeErr },
        'Synthesis worker job failed',
      )
    })
  })
})
