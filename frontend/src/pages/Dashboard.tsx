import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDrafts } from '@/hooks/useDrafts'
import { DraftCard } from '@/components/DraftCard'
import { StatsView } from '@/components/StatsView'
import { Skeleton } from '@/components/ui/skeleton'
import type { Draft, DraftStatus } from '@/types/draft'

type FilterTab = 'ALL' | DraftStatus

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING_REVIEW' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Discarded', value: 'DISCARDED' },
]

function DraftListSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading drafts"
      aria-busy="true"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border p-6 space-y-3"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  )
}

function filterDrafts(drafts: Draft[], tab: FilterTab): Draft[] {
  if (tab === 'ALL') return drafts
  return drafts.filter((d) => d.status === tab)
}

function statusParamToTab(param: string | null): FilterTab {
  if (
    param === 'PENDING_REVIEW' ||
    param === 'APPROVED' ||
    param === 'DISCARDED'
  ) {
    return param
  }
  return 'ALL'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view')
  const isStatsView = view === 'stats'
  const activeTab = statusParamToTab(searchParams.get('status'))

  // Fetch all drafts — filtering is done client-side to support per-tab counts
  const { data: drafts, isLoading, isError } = useDrafts()

  useEffect(() => {
    document.title = isStatsView ? 'Stats | Support2Docs' : 'Dashboard | Support2Docs'
  }, [isStatsView])

  function handleTabChange(tab: FilterTab) {
    const next = new URLSearchParams(searchParams)
    if (tab === 'ALL') {
      next.delete('status')
    } else {
      next.set('status', tab)
    }
    setSearchParams(next)
  }

  const filteredDrafts = drafts ? filterDrafts(drafts, activeTab) : []

  function countForTab(tab: FilterTab): number {
    if (!drafts) return 0
    return tab === 'ALL' ? drafts.length : drafts.filter((d) => d.status === tab).length
  }

  return (
    <main
      className="flex-1 px-6 py-8"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-5xl mx-auto">
        {isStatsView ? (
          <>
            <h1
              className="text-2xl font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Stats & ROI
            </h1>
            <p
              className="mt-1 text-sm mb-8"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Pipeline performance and reviewer activity
            </p>
            <StatsView />
          </>
        ) : (
          <>
            <h1
              className="text-2xl font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              KB Drafts
            </h1>
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              AI-generated knowledge base drafts pending your review
            </p>

            {/* Status filter tabs */}
            <div
              className="flex gap-1 mt-6 mb-4 p-1 rounded-lg w-fit"
              role="tablist"
              aria-label="Filter drafts by status"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              {FILTER_TABS.map(({ label, value }) => {
                const isActive = activeTab === value
                const count = countForTab(value)
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleTabChange(value)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    style={
                      isActive
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
                    {label}
                    {!isLoading && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold"
                        style={
                          isActive
                            ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                            : { backgroundColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                        }
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <section
              className="mt-2"
              aria-label={`${activeTab === 'ALL' ? 'All' : activeTab.toLowerCase()} drafts`}
            >
              {isLoading && <DraftListSkeleton />}

              {isError && (
                <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                  Failed to load drafts. Please refresh the page.
                </p>
              )}

              {!isLoading && !isError && filteredDrafts.length === 0 && (
                <div
                  className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <p
                    className="text-lg font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {activeTab === 'ALL'
                      ? 'No drafts yet'
                      : `No ${activeTab === 'PENDING_REVIEW' ? 'pending' : activeTab.toLowerCase()} drafts`}
                  </p>
                  <p
                    className="mt-1 text-sm"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {activeTab === 'ALL' || activeTab === 'PENDING_REVIEW'
                      ? 'New drafts will appear here when a cluster of 5+ similar tickets is detected.'
                      : 'No drafts match this filter.'}
                  </p>
                </div>
              )}

              {!isLoading && !isError && filteredDrafts.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredDrafts.map((draft) => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      onClick={() => navigate(`/dashboard/drafts/${draft.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
