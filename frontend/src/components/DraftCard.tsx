import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/formatRelative'
import type { Draft, DraftStatus } from '@/types/draft'

interface DraftCardProps {
  draft: Draft
  onClick: () => void
}

function statusVariant(status: DraftStatus) {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'pending' as const
    case 'APPROVED':
      return 'approved' as const
    case 'DISCARDED':
      return 'discarded' as const
  }
}

function statusLabel(status: DraftStatus) {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Pending Review'
    case 'APPROVED':
      return 'Approved'
    case 'DISCARDED':
      return 'Discarded'
  }
}

/**
 * Strips common Markdown syntax from a string, returning plain text suitable
 * for use in a content preview.
 */
function stripMarkdown(text: string): string {
  return text
    // Fenced code blocks (```...```)
    .replace(/```[\s\S]*?```/g, '')
    // Inline code (`...`)
    .replace(/`[^`]*`/g, '')
    // Images ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Links [text](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // ATX headings (# ## ###...)
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic (**text**, __text__, *text*, _text_)
    .replace(/(\*{1,2}|_{1,2})([^*_]+)\1/g, '$2')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Blockquotes
    .replace(/^>\s?/gm, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

export function DraftCard({ draft, onClick }: DraftCardProps) {
  const preview = stripMarkdown(draft.content)

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border p-5 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] hover:shadow-md"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-elevated)'
        e.currentTarget.style.borderColor = 'var(--color-accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
      aria-label={`Draft: ${draft.title}, status: ${statusLabel(draft.status)}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3
          className="line-clamp-2 text-base font-semibold leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {draft.title}
        </h3>
        <Badge variant={statusVariant(draft.status)} className="shrink-0 mt-0.5">
          {statusLabel(draft.status)}
        </Badge>
      </div>

      {/* Content preview */}
      {preview && (
        <p
          className="line-clamp-2 text-sm mb-3 leading-relaxed"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Content preview"
        >
          {preview}
        </p>
      )}

      {/* Meta */}
      <dl className="flex flex-col gap-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Source tickets</dt>
          <dd>{draft.cluster._count.tickets} tickets</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Created date</dt>
          <dd>{formatRelative(draft.createdAt)}</dd>
        </div>
      </dl>
    </button>
  )
}
