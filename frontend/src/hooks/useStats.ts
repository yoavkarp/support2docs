import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Stats {
  totalDrafts: number
  totalApproved: number
  totalDiscarded: number
  totalPending: number
  approvedThisWeek: number
  avgReviewTimeMinutes: number
  estimatedHoursSaved: number
  estimatedTicketsDeflected: number
}

export interface ReviewerRow {
  userId: string
  userEmail: string
  approved: number
  discarded: number
  edited: number
}

export function useStats() {
  return useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => apiFetch<Stats>('/api/v1/stats'),
    staleTime: 30_000,
  })
}

export function useStatsByReviewer() {
  return useQuery<ReviewerRow[]>({
    queryKey: ['stats', 'by-reviewer'],
    queryFn: () => apiFetch<ReviewerRow[]>('/api/v1/stats/by-reviewer'),
    staleTime: 30_000,
  })
}
