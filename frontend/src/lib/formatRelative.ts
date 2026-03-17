/**
 * Returns a human-readable relative time string for a given date.
 *
 * Rules:
 *   < 60 seconds  → "just now"
 *   < 60 minutes  → "X minutes ago"
 *   < 24 hours    → "X hours ago"
 *   < 7 days      → "X days ago"
 *   else           → "X weeks ago"
 */
export function formatRelative(date: Date | string): string {
  const then = typeof date === 'string' ? new Date(date) : date
  const nowMs = Date.now()
  const diffMs = nowMs - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) {
    return 'just now'
  }

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  }

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) {
    return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  }

  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  }

  const diffWeek = Math.floor(diffDay / 7)
  return `${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`
}
