import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDraft } from '@/hooks/useDrafts'
import { useDraftEditor } from '@/hooks/useDraftEditor'
import { useFirestoreDraft } from '@/hooks/useFirestoreDraft'
import { ApproveButton, DiscardButton } from '@/components/DraftActions'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
      <div className="mx-auto max-w-3xl px-4 py-8">
        <DetailSkeleton />
      </div>
    )
  }

  if (isError || !draft) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p role="alert" className="text-sm text-destructive">
          Failed to load draft.{' '}
          <Link to="/dashboard" className="underline">
            Back to dashboard
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to drafts
          </Link>
          <div className="flex items-center gap-2">
            {isLive && (
              <Badge variant="approved" aria-label="Live Firestore sync active">
                Live
              </Badge>
            )}
            {editor.isSaving && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                Saving...
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <label htmlFor="draft-title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="draft-title"
            value={editor.title}
            onChange={(e) => editor.handleTitleChange(e.target.value)}
            onBlur={editor.handleBlurSave}
            placeholder="Draft title"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="draft-content" className="text-sm font-medium">
            Content
          </label>
          <Textarea
            id="draft-content"
            value={editor.content}
            onChange={(e) => editor.handleContentChange(e.target.value)}
            onBlur={editor.handleBlurSave}
            className="min-h-[400px] font-mono text-sm"
            placeholder="Draft content..."
            aria-label="Draft content"
          />
        </div>

        {draft.publishedUrl && isSafeUrl(draft.publishedUrl) && (
          <a
            href={draft.publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-primary underline-offset-4 hover:underline"
            aria-label="View published article (opens in new tab)"
          >
            View published article &rarr;
          </a>
        )}

        <section aria-label="Source tickets">
          <h2 className="text-base font-semibold mb-3">
            Source tickets ({draft.cluster.tickets.length})
          </h2>
          <ul className="space-y-2">
            {draft.cluster.tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-start justify-between rounded-md border px-4 py-3 text-sm"
              >
                <span className="font-medium">{ticket.subject}</span>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Badge variant="secondary">{ticket.source}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {draft.status === 'PENDING_REVIEW' && (
          <div className="flex gap-3 pt-2" role="group" aria-label="Draft actions">
            <ApproveButton draftId={draft.id} onSuccess={handleActionSuccess} />
            <DiscardButton draftId={draft.id} onSuccess={handleActionSuccess} />
          </div>
        )}
      </main>
    </div>
  )
}
