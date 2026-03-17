import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useApproveDraft, useDiscardDraft } from '@/hooks/useDrafts'

interface ApprovButtonProps {
  draftId: string
  onSuccess: () => void
}

export function ApproveButton({ draftId, onSuccess }: ApprovButtonProps) {
  const { mutate, isPending } = useApproveDraft()

  function handleApprove() {
    mutate(draftId, { onSuccess })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="success" disabled={isPending} aria-label="Approve draft">
          {isPending ? 'Approving...' : 'Approve'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve and publish draft?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to approve and publish this draft? This will send it to the
            configured knowledge base endpoint.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleApprove}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Approve and publish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface DiscardButtonProps {
  draftId: string
  onSuccess: () => void
}

export function DiscardButton({ draftId, onSuccess }: DiscardButtonProps) {
  const { mutate, isPending } = useDiscardDraft()

  function handleDiscard() {
    mutate(draftId, { onSuccess })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isPending} aria-label="Discard draft">
          {isPending ? 'Discarding...' : 'Discard'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently discard the draft. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDiscard}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
