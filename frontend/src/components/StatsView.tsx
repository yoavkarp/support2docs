import { Clock, CheckCircle, XCircle, Ticket, TrendingUp, Users } from 'lucide-react'
import { useStats, useStatsByReviewer } from '@/hooks/useStats'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------
interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

function MetricCard({ icon, label, value, sub, accent }: MetricCardProps) {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: accent ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </span>
      </div>
      <p className="text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function MetricCardSkeleton() {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reviewer leaderboard
// ---------------------------------------------------------------------------
function ReviewerLeaderboard() {
  const { data: reviewers, isLoading, isError } = useStatsByReviewer()

  return (
    <section aria-label="Reviewer leaderboard">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} style={{ color: 'var(--color-text-muted)' }} />
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          Reviewer Leaderboard
        </h2>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
          Failed to load reviewer stats.
        </p>
      )}

      {!isLoading && !isError && reviewers && reviewers.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No reviews yet — data appears once reviewers approve or discard drafts.
        </p>
      )}

      {!isLoading && !isError && reviewers && reviewers.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <table className="w-full text-sm" aria-label="Reviewer stats table">
            <thead>
              <tr
                className="text-xs uppercase tracking-wide border-b"
                style={{
                  backgroundColor: 'var(--color-surface-elevated)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <th className="text-left px-4 py-3 font-medium">Reviewer</th>
                <th className="text-right px-4 py-3 font-medium">Approved</th>
                <th className="text-right px-4 py-3 font-medium">Discarded</th>
                <th className="text-right px-4 py-3 font-medium">Edited</th>
              </tr>
            </thead>
            <tbody>
              {reviewers.map((r, idx) => (
                <tr
                  key={r.userId}
                  className="border-b last:border-0"
                  style={{
                    backgroundColor: idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-surface-elevated)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="font-medium">{r.userEmail}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--color-success)' }}>
                    {r.approved}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--color-danger)' }}>
                    {r.discarded}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-muted)' }}>
                    {r.edited}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main StatsView
// ---------------------------------------------------------------------------
export function StatsView() {
  const { data: stats, isLoading, isError } = useStats()

  return (
    <div className="space-y-8">
      {/* ROI headline */}
      <div className="flex items-center gap-2">
        <TrendingUp size={18} style={{ color: 'var(--color-accent)' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          ROI Overview
        </h2>
      </div>

      {/* Metric cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ROI metrics">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : isError ? (
          <p className="col-span-4 text-sm" style={{ color: 'var(--color-danger)' }}>
            Failed to load stats. Please refresh.
          </p>
        ) : stats ? (
          <>
            <MetricCard
              icon={<Clock size={16} />}
              label="Hours Saved"
              value={stats.estimatedHoursSaved}
              sub={`${stats.totalApproved} approved × 45 min avg`}
              accent
            />
            <MetricCard
              icon={<Ticket size={16} />}
              label="Tickets Deflected"
              value={stats.estimatedTicketsDeflected.toLocaleString()}
              sub={`${stats.totalApproved} articles × 125 avg deflections`}
              accent
            />
            <MetricCard
              icon={<CheckCircle size={16} />}
              label="Drafts Approved"
              value={stats.totalApproved}
              sub={`${stats.approvedThisWeek} this week`}
            />
            <MetricCard
              icon={<XCircle size={16} />}
              label="Drafts Discarded"
              value={stats.totalDiscarded}
              sub={`${stats.totalPending} pending review`}
            />
          </>
        ) : null}
      </div>

      {/* Avg review time */}
      {stats && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Average review time:{' '}
          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {stats.avgReviewTimeMinutes > 0
              ? `${stats.avgReviewTimeMinutes} min`
              : 'No data yet'}
          </span>
        </p>
      )}

      {/* Reviewer leaderboard */}
      <ReviewerLeaderboard />
    </div>
  )
}
