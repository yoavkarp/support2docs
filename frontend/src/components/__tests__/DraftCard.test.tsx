import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftCard } from '../DraftCard'
import type { Draft } from '@/types/draft'

const baseDraft: Draft = {
  id: 'draft-1',
  title: 'How to reset your password',
  content: 'Some content',
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

  it('renders the created date', () => {
    render(<DraftCard draft={baseDraft} onClick={vi.fn()} />)
    const formatted = new Date('2026-01-15T10:00:00Z').toLocaleDateString()
    expect(screen.getByText(formatted)).toBeInTheDocument()
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
})
