import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock bullmq before the queue module loads it.
// The Queue constructor must be mockable as `new Queue(...)`, so we use
// a vi.fn() class mock with a constructor function signature.
// ---------------------------------------------------------------------------
vi.mock('bullmq', () => {
  const QueueMock = vi.fn(function (
    this: { name: string; add: ReturnType<typeof vi.fn> },
    name: string,
    _opts: unknown,
  ) {
    this.name = name
    this.add = vi.fn()
  })
  return { Queue: QueueMock }
})

import { Queue } from 'bullmq'

describe('ticketQueue (lib/queue.ts)', () => {
  it('creates a Queue with the name ticket-processing', async () => {
    const { ticketQueue } = await import('../queue.js')
    expect(ticketQueue).toBeDefined()
    // The mock constructor was called with 'ticket-processing' as first arg
    const calls = vi.mocked(Queue).mock.calls
    const firstCall = calls[0]
    expect(firstCall?.[0]).toBe('ticket-processing')
  })

  it('exports a Queue instance (truthy object)', async () => {
    const { ticketQueue } = await import('../queue.js')
    expect(ticketQueue).toBeTruthy()
    expect(typeof ticketQueue).toBe('object')
  })

  it('passes a connection object with host and port to the Queue constructor', async () => {
    await import('../queue.js')
    const calls = vi.mocked(Queue).mock.calls
    const opts = calls[0]?.[1] as { connection: { host: string; port: number } }
    expect(opts).toBeDefined()
    expect(opts.connection).toEqual(
      expect.objectContaining({
        host: expect.any(String),
        port: expect.any(Number),
      })
    )
  })

  it('uses localhost as the default REDIS_HOST when env var is absent', async () => {
    await import('../queue.js')
    const calls = vi.mocked(Queue).mock.calls
    const opts = calls[0]?.[1] as { connection: { host: string; port: number } }
    // Default value from the Zod schema when REDIS_HOST is not set
    const expectedHost = process.env['REDIS_HOST'] ?? 'localhost'
    expect(opts.connection.host).toBe(expectedHost)
  })

  it('uses 6379 as the default REDIS_PORT when env var is absent', async () => {
    await import('../queue.js')
    const calls = vi.mocked(Queue).mock.calls
    const opts = calls[0]?.[1] as { connection: { host: string; port: number } }
    const expectedPort = process.env['REDIS_PORT'] ? Number(process.env['REDIS_PORT']) : 6379
    expect(opts.connection.port).toBe(expectedPort)
  })

  it('port is a number (not a string) in the connection config', async () => {
    await import('../queue.js')
    const calls = vi.mocked(Queue).mock.calls
    const opts = calls[0]?.[1] as { connection: { host: string; port: number } }
    expect(typeof opts.connection.port).toBe('number')
  })
})
