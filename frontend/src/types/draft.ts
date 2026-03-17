export type DraftStatus = 'PENDING_REVIEW' | 'APPROVED' | 'DISCARDED'

export interface Draft {
  id: string
  title: string
  content: string
  status: DraftStatus
  publishedUrl: string | null
  createdAt: string
  updatedAt: string
  clusterId: string
  cluster: {
    _count: { tickets: number }
  }
}

export interface TicketSummary {
  id: string
  subject: string
  source: string
  createdAt: string
}

export interface DraftDetail extends Omit<Draft, 'cluster'> {
  cluster: {
    id: string
    tickets: TicketSummary[]
  }
}
