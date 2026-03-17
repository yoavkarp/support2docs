import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsView } from '../StatsView'
import type { Stats, ReviewerRow } from '@/hooks/useStats'

const mockUseStats = vi.fn()
const mockUseStatsByReviewer = vi.fn()

vi.mock('@/hooks/useStats', () => ({
  useStats: (...args: unknown[]) => mockUseStats(...args),
  useStatsByReviewer: (...args: unknown[]) => mockUseStatsByReviewer(...args),
}))

const mockStats: Stats = {
  totalDrafts: 20,
  totalApproved: 10,
  totalDiscarded: 3,
  totalPending: 7,
  approvedThisWeek: 2,
  avgReviewTimeMinutes: 15.5,
  estimatedHoursSaved: 7.5,
  estimatedTicketsDeflected: 1250,
}

const mockReviewers: ReviewerRow[] = [
  { userId: 'uid-1', userEmail: 'alice@example.com', approved: 8, discarded: 1, edited: 3 },
  { userId: 'uid-2', userEmail: 'bob@example.com', approved: 2, discarded: 2, edited: 1 },
]

describe('StatsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders metric card skeletons while stats are loading', () => {
      mockUseStats.mockReturnValue({ data: undefined, isLoading: true, isError: false })
      mockUseStatsByReviewer.mockReturnValue({ data: undefined, isLoading: true, isError: false })
      render(<StatsView />)
      // Skeletons are rendered — check the container label is present
      expect(screen.getByLabelText('ROI metrics')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error message when stats fetch fails', () => {
      mockUseStats.mockReturnValue({ data: undefined, isLoading: false, isError: true })
      mockUseStatsByReviewer.mockReturnValue({ data: [], isLoading: false, isError: false })
      render(<StatsView />)
      expect(screen.getByText(/failed to load stats/i)).toBeInTheDocument()
    })

    it('shows reviewer error when reviewer fetch fails', () => {
      mockUseStats.mockReturnValue({ data: mockStats, isLoading: false, isError: false })
      mockUseStatsByReviewer.mockReturnValue({ data: undefined, isLoading: false, isError: true })
      render(<StatsView />)
      expect(screen.getByText(/failed to load reviewer stats/i)).toBeInTheDocument()
    })
  })

  describe('MetricCard renders label + value', () => {
    beforeEach(() => {
      mockUseStats.mockReturnValue({ data: mockStats, isLoading: false, isError: false })
      mockUseStatsByReviewer.mockReturnValue({ data: [], isLoading: false, isError: false })
    })

    it('renders the "Hours Saved" metric card with correct value', () => {
      render(<StatsView />)
      expect(screen.getByText('Hours Saved')).toBeInTheDocument()
      expect(screen.getByText(mockStats.estimatedHoursSaved)).toBeInTheDocument()
    })

    it('renders the "Tickets Deflected" metric card with correct value', () => {
      render(<StatsView />)
      expect(screen.getByText('Tickets Deflected')).toBeInTheDocument()
      // value is formatted with toLocaleString
      expect(screen.getByText(mockStats.estimatedTicketsDeflected.toLocaleString())).toBeInTheDocument()
    })

    it('renders the "Drafts Approved" metric card with correct value', () => {
      render(<StatsView />)
      expect(screen.getByText('Drafts Approved')).toBeInTheDocument()
      expect(screen.getByText(mockStats.totalApproved)).toBeInTheDocument()
    })

    it('renders the "Drafts Discarded" metric card with correct value', () => {
      render(<StatsView />)
      expect(screen.getByText('Drafts Discarded')).toBeInTheDocument()
      expect(screen.getByText(mockStats.totalDiscarded)).toBeInTheDocument()
    })

    it('renders average review time when greater than 0', () => {
      render(<StatsView />)
      expect(screen.getByText(/15\.5 min/i)).toBeInTheDocument()
    })

    it('renders "No data yet" when avgReviewTimeMinutes is 0', () => {
      mockUseStats.mockReturnValue({
        data: { ...mockStats, avgReviewTimeMinutes: 0 },
        isLoading: false,
        isError: false,
      })
      render(<StatsView />)
      expect(screen.getByText('No data yet')).toBeInTheDocument()
    })

    it('renders the sub-text for hours saved', () => {
      render(<StatsView />)
      expect(screen.getByText(`${mockStats.totalApproved} approved × 45 min avg`)).toBeInTheDocument()
    })
  })

  describe('ReviewerLeaderboard', () => {
    beforeEach(() => {
      mockUseStats.mockReturnValue({ data: mockStats, isLoading: false, isError: false })
    })

    it('shows empty state message when no reviewers', () => {
      mockUseStatsByReviewer.mockReturnValue({ data: [], isLoading: false, isError: false })
      render(<StatsView />)
      expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument()
    })

    it('renders reviewer table with correct header columns', () => {
      mockUseStatsByReviewer.mockReturnValue({ data: mockReviewers, isLoading: false, isError: false })
      render(<StatsView />)
      expect(screen.getByRole('columnheader', { name: 'Reviewer' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Approved' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Discarded' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Edited' })).toBeInTheDocument()
    })

    it('renders a row for each reviewer', () => {
      mockUseStatsByReviewer.mockReturnValue({ data: mockReviewers, isLoading: false, isError: false })
      render(<StatsView />)
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    })

    it('renders correct approved/discarded/edited counts per reviewer', () => {
      mockUseStatsByReviewer.mockReturnValue({ data: mockReviewers, isLoading: false, isError: false })
      render(<StatsView />)
      const table = screen.getByRole('table', { name: 'Reviewer stats table' })
      expect(table).toBeInTheDocument()
      // Alice row
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      // Spot-check values appear in the document
      // Multiple cells may share numbers so just verify they appear
      const cells = screen.getAllByRole('cell')
      const cellTexts = cells.map((c) => c.textContent)
      expect(cellTexts).toContain('alice@example.com')
      expect(cellTexts).toContain('8')
      expect(cellTexts).toContain('bob@example.com')
      expect(cellTexts).toContain('2')
    })

    it('renders the reviewer leaderboard section heading', () => {
      mockUseStatsByReviewer.mockReturnValue({ data: mockReviewers, isLoading: false, isError: false })
      render(<StatsView />)
      expect(screen.getByText('Reviewer Leaderboard')).toBeInTheDocument()
    })
  })
})
