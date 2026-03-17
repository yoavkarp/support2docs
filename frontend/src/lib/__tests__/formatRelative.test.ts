import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelative } from '../formatRelative'

const NOW = new Date('2026-03-17T12:00:00Z').getTime()

describe('formatRelative', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('< 60 seconds — "just now"', () => {
    it('returns "just now" for 0 seconds ago', () => {
      const date = new Date(NOW)
      expect(formatRelative(date)).toBe('just now')
    })

    it('returns "just now" for 30 seconds ago', () => {
      const date = new Date(NOW - 30 * 1000)
      expect(formatRelative(date)).toBe('just now')
    })

    it('returns "just now" for 59 seconds ago', () => {
      const date = new Date(NOW - 59 * 1000)
      expect(formatRelative(date)).toBe('just now')
    })

    it('accepts an ISO string', () => {
      const isoString = new Date(NOW - 10 * 1000).toISOString()
      expect(formatRelative(isoString)).toBe('just now')
    })
  })

  describe('< 60 minutes — "X minutes ago"', () => {
    it('returns "1 minute ago" (singular) for exactly 60 seconds ago', () => {
      const date = new Date(NOW - 60 * 1000)
      expect(formatRelative(date)).toBe('1 minute ago')
    })

    it('returns "1 minute ago" (singular) for 65 seconds ago', () => {
      const date = new Date(NOW - 65 * 1000)
      expect(formatRelative(date)).toBe('1 minute ago')
    })

    it('returns "5 minutes ago" (plural) for 5 minutes ago', () => {
      const date = new Date(NOW - 5 * 60 * 1000)
      expect(formatRelative(date)).toBe('5 minutes ago')
    })

    it('returns "59 minutes ago" for 59 minutes ago', () => {
      const date = new Date(NOW - 59 * 60 * 1000)
      expect(formatRelative(date)).toBe('59 minutes ago')
    })
  })

  describe('< 24 hours — "X hours ago"', () => {
    it('returns "1 hour ago" (singular) for exactly 60 minutes ago', () => {
      const date = new Date(NOW - 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('1 hour ago')
    })

    it('returns "3 hours ago" (plural) for 3 hours ago', () => {
      const date = new Date(NOW - 3 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('3 hours ago')
    })

    it('returns "23 hours ago" for 23 hours ago', () => {
      const date = new Date(NOW - 23 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('23 hours ago')
    })
  })

  describe('< 7 days — "X days ago"', () => {
    it('returns "1 day ago" (singular) for exactly 24 hours ago', () => {
      const date = new Date(NOW - 24 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('1 day ago')
    })

    it('returns "2 days ago" (plural) for 2 days ago', () => {
      const date = new Date(NOW - 2 * 24 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('2 days ago')
    })

    it('returns "6 days ago" for 6 days ago', () => {
      const date = new Date(NOW - 6 * 24 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('6 days ago')
    })
  })

  describe('>= 7 days — "X weeks ago"', () => {
    it('returns "1 week ago" (singular) for exactly 7 days ago', () => {
      const date = new Date(NOW - 7 * 24 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('1 week ago')
    })

    it('returns "2 weeks ago" (plural) for 14 days ago', () => {
      const date = new Date(NOW - 14 * 24 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('2 weeks ago')
    })

    it('returns "4 weeks ago" for 30 days ago', () => {
      const date = new Date(NOW - 30 * 24 * 60 * 60 * 1000)
      expect(formatRelative(date)).toBe('4 weeks ago')
    })

    it('accepts an ISO string for old dates', () => {
      const isoString = new Date(NOW - 14 * 24 * 60 * 60 * 1000).toISOString()
      expect(formatRelative(isoString)).toBe('2 weeks ago')
    })
  })
})
