import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DraftDetail from '../DraftDetail'
import type { DraftDetail as DraftDetailType } from '@/types/draft'

vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }))

const mockUseDraft = vi.fn()
const mockUseUpdateDraft = vi.fn()
const mockUseApproveDraft = vi.fn()
const mockUseDiscardDraft = vi.fn()

vi.mock('@/hooks/useDrafts', () => ({
  useDraft: (...args: unknown[]) => mockUseDraft(...args),
  useUpdateDraft: () => mockUseUpdateDraft(),
  useApproveDraft: () => mockUseApproveDraft(),
  useDiscardDraft: () => mockUseDiscardDraft(),
}))

vi.mock('@/hooks/useFirestoreDraft', () => ({
  useFirestoreDraft: vi.fn(() => ({ firestoreData: null, isLive: false })),
}))

const baseDraft: DraftDetailType = {
  id: 'draft-1',
  title: 'How to reset your password',
  content: 'Step 1: go to the login page...',
  status: 'PENDING_REVIEW',
  publishedUrl: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  clusterId: 'cluster-1',
  cluster: {
    id: 'cluster-1',
    tickets: [
      {
        id: 'ticket-1',
        subject: 'Cannot login',
        source: 'zendesk',
        createdAt: '2026-01-10T08:00:00Z',
      },
    ],
  },
}

function renderDraftDetail(id = 'draft-1') {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/drafts/${id}`]}>
      <Routes>
        <Route path="/dashboard/drafts/:id" element={<DraftDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DraftDetail', () => {
  beforeEach(() => {
    mockUseUpdateDraft.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseApproveDraft.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseDiscardDraft.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('sets document.title to "Draft Review | Support2Docs"', () => {
    mockUseDraft.mockReturnValue({ data: baseDraft, isLoading: false, isError: false })
    renderDraftDetail()
    expect(document.title).toBe('Draft Review | Support2Docs')
  })

  it('shows loading skeleton while fetching', () => {
    mockUseDraft.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderDraftDetail()
    expect(screen.getByLabelText('Loading draft')).toBeInTheDocument()
  })

  it('shows error when fetch fails', () => {
    mockUseDraft.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderDraftDetail()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders the draft title in an input', () => {
    mockUseDraft.mockReturnValue({ data: baseDraft, isLoading: false, isError: false })
    renderDraftDetail()
    const input = screen.getByLabelText('Title') as HTMLInputElement
    expect(input.value).toBe('How to reset your password')
  })

  it('renders the draft content in a textarea', () => {
    mockUseDraft.mockReturnValue({ data: baseDraft, isLoading: false, isError: false })
    renderDraftDetail()
    const textarea = screen.getByLabelText('Draft content') as HTMLTextAreaElement
    expect(textarea.value).toBe('Step 1: go to the login page...')
  })

  it('renders source tickets', () => {
    mockUseDraft.mockReturnValue({ data: baseDraft, isLoading: false, isError: false })
    renderDraftDetail()
    expect(screen.getByText('Cannot login')).toBeInTheDocument()
    expect(screen.getByText('zendesk')).toBeInTheDocument()
  })

  it('shows Approve and Discard buttons for PENDING_REVIEW drafts', () => {
    mockUseDraft.mockReturnValue({ data: baseDraft, isLoading: false, isError: false })
    renderDraftDetail()
    expect(screen.getByRole('button', { name: 'Approve draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeInTheDocument()
  })

  it('does not show action buttons for APPROVED drafts', () => {
    mockUseDraft.mockReturnValue({
      data: { ...baseDraft, status: 'APPROVED' },
      isLoading: false,
      isError: false,
    })
    renderDraftDetail()
    expect(screen.queryByRole('button', { name: 'Approve draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument()
  })

  it('shows published URL link when present', () => {
    mockUseDraft.mockReturnValue({
      data: {
        ...baseDraft,
        status: 'APPROVED',
        publishedUrl: 'https://kb.example.com/articles/1',
      },
      isLoading: false,
      isError: false,
    })
    renderDraftDetail()
    const link = screen.getByRole('link', { name: /view published article/i })
    expect(link).toHaveAttribute('href', 'https://kb.example.com/articles/1')
  })

  it('does not render published URL link for non-https URLs', () => {
    mockUseDraft.mockReturnValue({
      data: {
        ...baseDraft,
        status: 'APPROVED',
        publishedUrl: 'http://kb.example.com/articles/1',
      },
      isLoading: false,
      isError: false,
    })
    renderDraftDetail()
    expect(screen.queryByRole('link', { name: /view published article/i })).not.toBeInTheDocument()
  })

  it('does not render published URL link for javascript: URLs', () => {
    mockUseDraft.mockReturnValue({
      data: {
        ...baseDraft,
        status: 'APPROVED',
        publishedUrl: 'javascript:alert(1)',
      },
      isLoading: false,
      isError: false,
    })
    renderDraftDetail()
    expect(screen.queryByRole('link', { name: /view published article/i })).not.toBeInTheDocument()
  })

  it('shows Live badge when Firestore connection is active', async () => {
    const { useFirestoreDraft } = await import('@/hooks/useFirestoreDraft')
    vi.mocked(useFirestoreDraft).mockReturnValue({ firestoreData: null, isLive: true })
    mockUseDraft.mockReturnValue({ data: baseDraft, isLoading: false, isError: false })
    renderDraftDetail()
    expect(screen.getByLabelText('Live Firestore sync active')).toBeInTheDocument()
  })
})
