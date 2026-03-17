import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock bullmq before the module under test loads it.
// vi.mock factories are hoisted — we cannot reference variables declared
// outside the factory. Instead we use vi.fn() with a class-like pattern
// and retrieve the captured args via the mock's call history.
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
  // Queue must be mocked because ticketWorker imports embeddingQueue from
  // queue.ts, which calls new Queue(...) at module load time.
  const QueueMock = vi.fn(function (
    this: { add: ReturnType<typeof vi.fn> },
    _queueName: string,
    _opts: unknown,
  ) {
    this.add = vi.fn()
  })
  return { Worker: WorkerMock, Queue: QueueMock }
})

// ---------------------------------------------------------------------------
// Mock the logger so we can assert on log calls without real transports.
// ---------------------------------------------------------------------------
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { Worker } from 'bullmq'
import { logger } from '../../lib/logger.js'
import { startTicketWorker } from '../ticketWorker.js'

// Helpers for extracting args from the Worker constructor mock
function getLastWorkerCall() {
  const calls = vi.mocked(Worker).mock.calls
  if (calls.length === 0) throw new Error('Worker was never constructed')
  return calls[calls.length - 1] as [string, (job: { id: string; data: unknown }) => Promise<void>, { connection: { host: string; port: number } }]
}

describe('startTicketWorker()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['REDIS_HOST'] = 'test-redis'
    process.env['REDIS_PORT'] = '6380'
  })

  it('creates a BullMQ Worker on the ticket-processing queue', () => {
    startTicketWorker()
    expect(Worker).toHaveBeenCalledOnce()
    const [queueName] = getLastWorkerCall()
    expect(queueName).toBe('ticket-processing')
  })

  it('returns the Worker instance', () => {
    const result = startTicketWorker()
    // The mock constructor returns the instance via `new`, so result should be truthy
    expect(result).toBeTruthy()
    // It should have the `on` method registered in the mock
    expect(typeof result.on).toBe('function')
  })

  it('connects to Redis using REDIS_HOST and REDIS_PORT from env', () => {
    startTicketWorker()
    const [, , opts] = getLastWorkerCall()
    expect(opts.connection).toEqual({ host: 'test-redis', port: 6380 })
  })

  it('connects to localhost:6379 when env vars are absent', () => {
    delete process.env['REDIS_HOST']
    delete process.env['REDIS_PORT']
    startTicketWorker()
    const [, , opts] = getLastWorkerCall()
    expect(opts.connection).toEqual({ host: 'localhost', port: 6379 })
  })

  it('registers a failed event listener on the worker', () => {
    const worker = startTicketWorker()
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  it('logs ticketId at info level when job data contains a valid uuid', async () => {
    startTicketWorker()
    const [, processor] = getLastWorkerCall()

    const validJob = { id: 'job-1', data: { ticketId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } }
    await processor(validJob)

    expect(logger.info).toHaveBeenCalledWith(
      { ticketId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
      'Ticket received — enqueueing for embedding'
    )
  })

  it('logs a warning and does NOT throw when job data has a non-uuid ticketId', async () => {
    startTicketWorker()
    const [, processor] = getLastWorkerCall()

    const badJob = { id: 'job-2', data: { ticketId: 'not-a-uuid' } }
    await expect(processor(badJob)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-2' }),
      'Invalid job data — skipping'
    )
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('logs a warning and does NOT throw when job data is missing ticketId entirely', async () => {
    startTicketWorker()
    const [, processor] = getLastWorkerCall()

    const emptyJob = { id: 'job-3', data: {} }
    await expect(processor(emptyJob)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('logs a warning and does NOT throw when job data is null', async () => {
    startTicketWorker()
    const [, processor] = getLastWorkerCall()

    const nullDataJob = { id: 'job-4', data: null as unknown }
    await expect(processor(nullDataJob)).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('failed event handler logs an error with jobId and err', () => {
    const worker = startTicketWorker()
    const onCalls = vi.mocked(worker.on).mock.calls
    const failedCall = onCalls.find((c) => c[0] === 'failed')
    expect(failedCall).toBeDefined()

    const failedHandler = failedCall![1] as (job: { id: string } | undefined, err: Error) => void
    const fakeErr = new Error('Redis disconnected')
    failedHandler({ id: 'job-5' }, fakeErr)

    expect(logger.error).toHaveBeenCalledWith(
      { jobId: 'job-5', err: fakeErr },
      'Ticket worker job failed'
    )
  })

  it('failed event handler handles an undefined job gracefully', () => {
    const worker = startTicketWorker()
    const onCalls = vi.mocked(worker.on).mock.calls
    const failedCall = onCalls.find((c) => c[0] === 'failed')
    const failedHandler = failedCall![1] as (job: undefined, err: Error) => void

    const fakeErr = new Error('Unknown error')
    expect(() => failedHandler(undefined, fakeErr)).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      { jobId: undefined, err: fakeErr },
      'Ticket worker job failed'
    )
  })
})
