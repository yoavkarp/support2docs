import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useDrafts } from '@/hooks/useDrafts'
import { DraftCard } from '@/components/DraftCard'
import { Skeleton } from '@/components/ui/skeleton'

function DraftListSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading drafts"
      aria-busy="true"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: drafts, isLoading, isError } = useDrafts('PENDING_REVIEW')

  useEffect(() => {
    document.title = 'Dashboard | Support2Docs'
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-semibold">Support2Docs</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <button
              onClick={() => signOut(auth)}
              className="text-sm text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">KB Drafts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-generated knowledge base drafts pending your review
        </p>

        <section className="mt-6" aria-label="Pending review drafts">
          {isLoading && <DraftListSkeleton />}

          {isError && (
            <p role="alert" className="text-sm text-destructive">
              Failed to load drafts. Please refresh the page.
            </p>
          )}

          {!isLoading && !isError && drafts && drafts.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="text-lg font-medium">No drafts pending review</p>
              <p className="mt-1 text-sm text-muted-foreground">
                New drafts will appear here when a cluster of 5+ similar tickets is detected.
              </p>
            </div>
          )}

          {!isLoading && !isError && drafts && drafts.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onClick={() => navigate(`/dashboard/drafts/${draft.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
