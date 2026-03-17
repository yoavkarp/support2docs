import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useDraft } from '@/hooks/useDrafts'
import { useDraftEditor } from '@/hooks/useDraftEditor'
import { useFirestoreDraft } from '@/hooks/useFirestoreDraft'
import { ApproveButton, DiscardButton } from '@/components/DraftActions'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight } from 'lucide-react'

type ContentMode = 'edit' | 'preview'

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading draft">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  )
}

export default function DraftDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: draft, isLoading, isError } = useDraft(id)
  const { firestoreData, isLive } = useFirestoreDraft(id)
  const [contentMode, setContentMode] = useState<ContentMode>('edit')

  useEffect(() => {
    document.title = 'Draft Review | Support2Docs'
  }, [])

  const editor = useDraftEditor({
    draftId: id,
    initialTitle: draft?.title ?? '',
    initialContent: draft?.content ?? '',
    firestoreTitle: firestoreData?.title,
    firestoreContent: firestoreData?.content,
  })

  function handleActionSuccess() {
    navigate('/dashboard')
  }

  if (isLoading) {
    return (
      <main
        className="flex-1 px-6 py-8"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <div className="max-w-3xl mx-auto">
          <DetailSkeleton />
        </div>
      </main>
    )
  }

  if (isError || !draft) {
    return (
      <main
        className="flex-1 px-6 py-8"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <div className="max-w-3xl mx-auto">
          <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
            Failed to load draft.{' '}
            <Link
              to="/dashboard"
              className="underline"
              style={{ color: 'var(--color-accent)' }}
            >
              Back to dashboard
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main
      className="flex-1 px-6 py-8"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-sm">
            <li>
              <Link
                to="/dashboard"
                className="transition-colors hover:underline"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Dashboard
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
            </li>
            <li
              className="truncate max-w-xs font-medium"
              style={{ color: 'var(--color-text-primary)' }}
              aria-current="page"
            >
              {draft.title}
            </li>
          </ol>
        </nav>

        {/* Live / saving indicators */}
        <div className="flex items-center gap-2">
          {isLive && (
            <Badge variant="approved" aria-label="Live Firestore sync active">
              Live
            </Badge>
          )}
          {editor.isSaving && (
            <span
              className="text-xs"
              aria-live="polite"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Saving...
            </span>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <label
            htmlFor="draft-title"
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Title
          </label>
          <Input
            id="draft-title"
            value={editor.title}
            onChange={(e) => editor.handleTitleChange(e.target.value)}
            onBlur={editor.handleBlurSave}
            placeholder="Draft title"
            className="border focus:ring-1"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>

        {/* Content with Edit/Preview toggle */}
        <div className="space-y-2">
          {/* Toggle header */}
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Content
            </span>
            <div
              className="flex gap-1 p-0.5 rounded-md"
              role="tablist"
              aria-label="Content editing mode"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              {(['edit', 'preview'] as ContentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={contentMode === mode}
                  onClick={() => setContentMode(mode)}
                  className="px-3 py-1 rounded text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  style={
                    contentMode === mode
                      ? {
                          backgroundColor: 'var(--color-accent)',
                          color: '#fff',
                        }
                      : {
                          backgroundColor: 'transparent',
                          color: 'var(--color-text-muted)',
                        }
                  }
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Edit mode */}
          {contentMode === 'edit' && (
            <Textarea
              id="draft-content"
              value={editor.content}
              onChange={(e) => editor.handleContentChange(e.target.value)}
              onBlur={editor.handleBlurSave}
              className="min-h-[400px] font-mono text-sm border focus:ring-1"
              placeholder="Draft content..."
              aria-label="Draft content"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          )}

          {/* Preview mode */}
          {contentMode === 'preview' && (
            <div
              className="min-h-[400px] rounded-md border px-4 py-3 text-sm overflow-auto"
              aria-label="Markdown preview"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              {editor.content ? (
                <div className="markdown-preview">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1
                          className="text-2xl font-bold mt-6 mb-3 leading-tight"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2
                          className="text-xl font-semibold mt-5 mb-2 leading-snug"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3
                          className="text-lg font-semibold mt-4 mb-2"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p
                          className="mb-3 leading-relaxed"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul
                          className="list-disc list-inside mb-3 space-y-1"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol
                          className="list-decimal list-inside mb-3 space-y-1"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      code: ({ children }) => (
                        <code
                          className="rounded px-1 py-0.5 text-xs font-mono"
                          style={{
                            backgroundColor: 'var(--color-border)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre
                          className="rounded-md p-3 mb-3 overflow-x-auto text-xs font-mono"
                          style={{
                            backgroundColor: 'var(--color-border)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote
                          className="border-l-4 pl-4 mb-3 italic"
                          style={{
                            borderColor: 'var(--color-accent)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          {children}
                        </blockquote>
                      ),
                      hr: () => (
                        <hr
                          className="my-4"
                          style={{ borderColor: 'var(--color-border)' }}
                        />
                      ),
                    }}
                  >
                    {editor.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p
                  className="text-sm italic"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Nothing to preview yet.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Published URL */}
        {draft.publishedUrl && isSafeUrl(draft.publishedUrl) && (
          <a
            href={draft.publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm underline-offset-4 hover:underline"
            style={{ color: 'var(--color-accent)' }}
            aria-label="View published article (opens in new tab)"
          >
            View published article &rarr;
          </a>
        )}

        {/* Source tickets */}
        <section aria-label="Source tickets">
          <h2
            className="text-base font-semibold mb-3"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Source tickets ({draft.cluster.tickets.length})
          </h2>
          <ul className="space-y-2">
            {draft.cluster.tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-start justify-between rounded-md border px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {ticket.subject}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Badge variant="secondary">{ticket.source}</Badge>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Actions */}
        {draft.status === 'PENDING_REVIEW' && (
          <div className="flex gap-3 pt-2" role="group" aria-label="Draft actions">
            <ApproveButton draftId={draft.id} onSuccess={handleActionSuccess} />
            <DiscardButton draftId={draft.id} onSuccess={handleActionSuccess} />
          </div>
        )}
      </div>
    </main>
  )
}
