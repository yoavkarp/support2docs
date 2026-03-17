import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export function DraftCard({ draft, onClick }: DraftCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
      aria-label={`Draft: ${draft.title}, status: ${statusLabel(draft.status)}`}
    >
      <Card className="transition-shadow hover:shadow-md hover:border-primary/50 cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-base">{draft.title}</CardTitle>
            <Badge variant={statusVariant(draft.status)} className="shrink-0">
              {statusLabel(draft.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <dt className="sr-only">Source tickets</dt>
              <dd>{draft.cluster._count.tickets} tickets</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="sr-only">Created date</dt>
              <dd>{new Date(draft.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </button>
  )
}
