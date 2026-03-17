import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftCard } from '../DraftCard'
import type { Draft } from '@/types/draft'

const NOW = new Date('2026-03-17T12:00:00Z').getTime()

const baseDraft: Draft = {
  id: 'draft-1',
  title: 'How to reset your password',
  content: 'Some content here to preview.',
  status: 'PENDING_REVIEW',
  publishedUrl: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  clusterId: 'cluster-1',
  cluster: { _count: { tickets: 5 } },
}

describe('DraftCard', () => {
  it('renders the draft title', () => {
    render(<DraftCard draft={baseDraft} onClick={vi.fn()} />)
    expect(screen.getByText('How to reset your password')).toBeInTheDocument()
  })

  it('renders the ticket count', () => {
    render(<DraftCard draft={baseDraft} onClick={vi.fn()} />)
    expect(screen.getByText('5 tickets')).toBeInTheDocument()
  })

  it('renders PENDING_REVIEW status badge', () => {
    render(<DraftCard draft={baseDraft} onClick={vi.fn()} />)
    expect(screen.getByText('Pending Review')).toBeInTheDocument()
  })

  it('renders APPROVED status badge', () => {
    render(<DraftCard draft={{ ...baseDraft, status: 'APPROVED' }} onClick={vi.fn()} />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('renders DISCARDED status badge', () => {
    render(<DraftCard draft={{ ...baseDraft, status: 'DISCARDED' }} onClick={vi.fn()} />)
    expect(screen.getByText('Discarded')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<DraftCard draft={baseDraft} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /draft: how to reset your password/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('has accessible aria-label including title and status', () => {
    render(<DraftCard draft={baseDraft} onClick={vi.fn()} />)
    expect(
      screen.getByRole('button', {
        name: 'Draft: How to reset your password, status: Pending Review',
      })
    ).toBeInTheDocument()
  })

  describe('Content preview', () => {
    it('renders plain text content preview', () => {
      render(<DraftCard draft={baseDraft} onClick={vi.fn()} />)
      expect(screen.getByLabelText('Content preview')).toBeInTheDocument()
      expect(screen.getByLabelText('Content preview')).toHaveTextContent('Some content here to preview.')
    })

    it('strips markdown headings from content preview', () => {
      const draft = { ...baseDraft, content: '# Heading\n\nBody text here.' }
      render(<DraftCard draft={draft} onClick={vi.fn()} />)
      const preview = screen.getByLabelText('Content preview')
      expect(preview).not.toHaveTextContent('#')
      expect(preview).toHaveTextContent('Heading')
      expect(preview).toHaveTextContent('Body text here.')
    })

    it('strips bold markdown from content preview', () => {
      const draft = { ...baseDraft, content: 'This is **bold** and _italic_ text.' }
      render(<DraftCard draft={draft} onClick={vi.fn()} />)
      const preview = screen.getByLabelText('Content preview')
      expect(preview).toHaveTextContent('This is bold and italic text.')
      expect(preview).not.toHaveTextContent('**')
    })

    it('strips inline code (including content) from content preview', () => {
      const draft = { ...baseDraft, content: 'Run `npm install` to get started.' }
      render(<DraftCard draft={draft} onClick={vi.fn()} />)
      const preview = screen.getByLabelText('Content preview')
      // The stripMarkdown function removes the entire inline code token including its content
      expect(preview).toHaveTextContent('Run to get started.')
      expect(preview).not.toHaveTextContent('`')
    })

    it('strips markdown links and retains link text', () => {
      const draft = { ...baseDraft, content: 'Click [here](https://example.com) to learn more.' }
      render(<DraftCard draft={draft} onClick={vi.fn()} />)
      const preview = screen.getByLabelText('Content preview')
      expect(preview).toHaveTextContent('Click here to learn more.')
    })

    it('does not render preview for empty content', () => {
      const draft = { ...baseDraft, content: '' }
      render(<DraftCard draft={draft} onClick={vi.fn()} />)
      expect(screen.queryByLabelText('Content preview')).not.toBeInTheDocument()
    })
  })

  describe('Relative time', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('shows "just now" for timestamps within 60 seconds', () => {
      const justNow = new Date(NOW - 30 * 1000).toISOString()
      render(<DraftCard draft={{ ...baseDraft, createdAt: justNow }} onClick={vi.fn()} />)
      expect(screen.getByText('just now')).toBeInTheDocument()
    })

    it('shows "X minutes ago" for timestamps within 60 minutes', () => {
      const fiveMinutesAgo = new Date(NOW - 5 * 60 * 1000).toISOString()
      render(<DraftCard draft={{ ...baseDraft, createdAt: fiveMinutesAgo }} onClick={vi.fn()} />)
      expect(screen.getByText('5 minutes ago')).toBeInTheDocument()
    })

    it('shows singular "1 minute ago"', () => {
      const oneMinuteAgo = new Date(NOW - 65 * 1000).toISOString()
      render(<DraftCard draft={{ ...baseDraft, createdAt: oneMinuteAgo }} onClick={vi.fn()} />)
      expect(screen.getByText('1 minute ago')).toBeInTheDocument()
    })

    it('shows "X hours ago" for timestamps within 24 hours', () => {
      const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1000).toISOString()
      render(<DraftCard draft={{ ...baseDraft, createdAt: threeHoursAgo }} onClick={vi.fn()} />)
      expect(screen.getByText('3 hours ago')).toBeInTheDocument()
    })

    it('shows "X days ago" for timestamps within 7 days', () => {
      const twoDaysAgo = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString()
      render(<DraftCard draft={{ ...baseDraft, createdAt: twoDaysAgo }} onClick={vi.fn()} />)
      expect(screen.getByText('2 days ago')).toBeInTheDocument()
    })

    it('shows "X weeks ago" for timestamps older than 7 days', () => {
      const twoWeeksAgo = new Date(NOW - 14 * 24 * 60 * 60 * 1000).toISOString()
      render(<DraftCard draft={{ ...baseDraft, createdAt: twoWeeksAgo }} onClick={vi.fn()} />)
      expect(screen.getByText('2 weeks ago')).toBeInTheDocument()
    })
  })
})
