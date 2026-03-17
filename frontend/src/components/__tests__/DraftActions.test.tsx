import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApproveButton, DiscardButton } from '../DraftActions'

const mockApproveMutate = vi.fn()
const mockDiscardMutate = vi.fn()

vi.mock('@/hooks/useDrafts', () => ({
  useApproveDraft: vi.fn(() => ({ mutate: mockApproveMutate, isPending: false })),
  useDiscardDraft: vi.fn(() => ({ mutate: mockDiscardMutate, isPending: false })),
}))

describe('ApproveButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Approve button', () => {
    render(<ApproveButton draftId="draft-1" onSuccess={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Approve draft' })).toBeInTheDocument()
  })

  it('opens confirmation dialog when clicked', async () => {
    render(<ApproveButton draftId="draft-1" onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }))
    await waitFor(() => {
      expect(screen.getByText('Approve and publish draft?')).toBeInTheDocument()
    })
  })

  it('calls mutate with draftId on dialog confirm', async () => {
    const onSuccess = vi.fn()
    render(<ApproveButton draftId="draft-1" onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }))
    await waitFor(() => screen.getByText('Approve and publish'))
    fireEvent.click(screen.getByText('Approve and publish'))
    expect(mockApproveMutate).toHaveBeenCalledWith('draft-1', { onSuccess })
  })

  it('shows loading state while isPending', async () => {
    const { useApproveDraft } = await import('@/hooks/useDrafts')
    vi.mocked(useApproveDraft).mockReturnValue({ mutate: mockApproveMutate, isPending: true } as unknown as ReturnType<typeof useApproveDraft>)
    render(<ApproveButton draftId="draft-1" onSuccess={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Approve draft' })).toBeDisabled()
    expect(screen.getByText('Approving...')).toBeInTheDocument()
  })
})

describe('DiscardButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Discard button', () => {
    render(<DiscardButton draftId="draft-1" onSuccess={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeInTheDocument()
  })

  it('opens confirmation dialog when clicked', async () => {
    render(<DiscardButton draftId="draft-1" onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    await waitFor(() => {
      expect(screen.getByText('Discard draft?')).toBeInTheDocument()
    })
  })

  it('calls mutate with draftId on dialog confirm', async () => {
    const onSuccess = vi.fn()
    render(<DiscardButton draftId="draft-1" onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    await waitFor(() => screen.getAllByText('Discard'))
    // Click the confirm button in the dialog (not the trigger)
    const discardButtons = screen.getAllByText('Discard')
    fireEvent.click(discardButtons[discardButtons.length - 1])
    expect(mockDiscardMutate).toHaveBeenCalledWith('draft-1', { onSuccess })
  })

  it('shows loading state while isPending', async () => {
    const { useDiscardDraft } = await import('@/hooks/useDrafts')
    vi.mocked(useDiscardDraft).mockReturnValue({ mutate: mockDiscardMutate, isPending: true } as unknown as ReturnType<typeof useDiscardDraft>)
    render(<DiscardButton draftId="draft-1" onSuccess={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeDisabled()
    expect(screen.getByText('Discarding...')).toBeInTheDocument()
  })
})
