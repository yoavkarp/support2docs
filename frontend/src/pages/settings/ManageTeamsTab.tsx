import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Trash2, Pencil, Camera, Loader2 } from 'lucide-react'
import {
  useOrgs,
  useCreateOrg,
  useDeleteOrg,
  usePatchOrg,
  type OrgSummary,
} from '@/hooks/useOrg'
import { useActiveOrg } from '@/contexts/OrgContext'
import { Skeleton } from '@/components/ui/skeleton'
import { uploadOrgLogo } from '@/lib/uploadOrgLogo'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

// ---------------------------------------------------------------------------
// LogoUpload — circular image preview with file-input trigger
// ---------------------------------------------------------------------------

interface LogoUploadProps {
  orgId: string
  currentLogoUrl: string | null
  orgName: string
  pendingLogoUrl: string | null
  onUpload: (url: string) => void
  onRemove: () => void
  onError: (msg: string) => void
}

function LogoUpload({
  orgId,
  currentLogoUrl,
  orgName,
  pendingLogoUrl,
  onUpload,
  onRemove,
  onError,
}: LogoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayUrl = pendingLogoUrl ?? currentLogoUrl

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be re-selected after an error
    e.target.value = ''

    if (file.size > MAX_FILE_SIZE_BYTES) {
      onError('Image must be under 2 MB')
      return
    }

    setUploading(true)
    onError('')
    try {
      const url = await uploadOrgLogo(orgId, file)
      onUpload(url)
    } catch {
      onError('Image upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      {/* Circular preview — clicking triggers file picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-12 h-12 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] group"
        style={{ backgroundColor: 'var(--color-accent)' }}
        aria-label="Upload logo"
        disabled={uploading}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={orgName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex items-center justify-center w-full h-full text-base font-bold text-white">
            {getInitials(orgName)}
          </span>
        )}

        {/* Spinner overlay while uploading */}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
            <Loader2 size={18} className="animate-spin text-white" aria-hidden="true" />
          </span>
        )}

        {/* Camera icon overlay on hover (not during upload) */}
        {!uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors rounded-full">
            <Camera
              size={16}
              className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-hidden="true"
            />
          </span>
        )}
      </button>

      {/* Remove link — only when a logo URL is set */}
      {(pendingLogoUrl !== null ? pendingLogoUrl : currentLogoUrl) && (
        <button
          type="button"
          onClick={onRemove}
          className="text-xs underline"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Remove
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        aria-hidden="true"
        onChange={(e) => void handleFileChange(e)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline edit form embedded in an org row
// ---------------------------------------------------------------------------

interface EditFormProps {
  org: OrgSummary
  onClose: () => void
}

function EditForm({ org, onClose }: EditFormProps) {
  const patchOrg = usePatchOrg()
  const [name, setName] = useState(org.name)
  // null = remove logo; undefined = no change from org.logoUrl
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null | undefined>(undefined)
  const [uploadError, setUploadError] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // Compute the logoUrl to send on save:
  // - if user uploaded a new image → pendingLogoUrl (string)
  // - if user removed the logo → null
  // - if no change → keep org.logoUrl (string | null)
  function resolvedLogoUrl(): string | null {
    if (pendingLogoUrl !== undefined) return pendingLogoUrl
    return org.logoUrl
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    setErrorMsg(null)
    try {
      await patchOrg.mutateAsync({
        orgId: org.id,
        name: trimmedName,
        logoUrl: resolvedLogoUrl(),
      })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update team'
      setErrorMsg(msg)
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-2 w-full"
      noValidate
      aria-label={`Edit ${org.name}`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        {/* Logo upload circle */}
        <LogoUpload
          orgId={org.id}
          orgName={name || org.name}
          currentLogoUrl={org.logoUrl}
          pendingLogoUrl={pendingLogoUrl === undefined ? null : pendingLogoUrl}
          onUpload={(url) => {
            setPendingLogoUrl(url)
            setUploadError('')
          }}
          onRemove={() => setPendingLogoUrl(null)}
          onError={(msg) => setUploadError(msg)}
        />

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {uploadError && (
            <p
              role="alert"
              className="text-xs"
              style={{ color: 'var(--color-danger, #ef4444)' }}
            >
              {uploadError}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* Team name input */}
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={1}
              maxLength={100}
              placeholder="Team name"
              aria-label="Team name"
              required
              className="flex-1 min-w-0 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />

            {/* Save */}
            <button
              type="submit"
              disabled={patchOrg.isPending || !name.trim()}
              className="shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {patchOrg.isPending ? 'Saving…' : 'Save'}
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-[var(--color-surface-elevated)]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="text-xs"
          style={{ color: 'var(--color-danger, #ef4444)' }}
        >
          {errorMsg}
        </p>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// OrgRow
// ---------------------------------------------------------------------------

interface OrgRowProps {
  org: OrgSummary
  isActive: boolean
  editingOrgId: string | null
  onStartEdit: (id: string) => void
  onCloseEdit: () => void
}

function OrgRow({ org, isActive, editingOrgId, onStartEdit, onCloseEdit }: OrgRowProps) {
  const deleteOrg = useDeleteOrg()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const isEditing = editingOrgId === org.id

  async function handleDelete() {
    setDeleteError(null)
    if (
      !window.confirm(
        `Delete "${org.name}"? This cannot be undone. Drafts created by this team will be detached but not deleted.`,
      )
    ) {
      return
    }
    try {
      await deleteOrg.mutateAsync(org.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete team'
      setDeleteError(msg)
    }
  }

  if (isEditing) {
    return (
      <li
        className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
        style={{ borderBottomColor: 'var(--color-border)' }}
      >
        <EditForm org={org} onClose={onCloseEdit} />
      </li>
    )
  }

  return (
    <li
      className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
      style={{ borderBottomColor: 'var(--color-border)' }}
    >
      {/* Org logo avatar */}
      <div
        className="flex items-center justify-center rounded-full w-8 h-8 shrink-0 font-bold text-white overflow-hidden"
        style={{ backgroundColor: 'var(--color-accent)' }}
        aria-hidden="true"
      >
        {org.logoUrl ? (
          <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xs">{getInitials(org.name)}</span>
        )}
      </div>

      {/* Org name + active badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-sm font-semibold truncate"
            style={{
              color: 'var(--color-text-primary)',
              fontWeight: isActive ? 700 : 600,
            }}
          >
            {org.name}
          </span>
          {isActive && (
            <span
              className="text-xs rounded-full px-2 py-0.5 font-medium"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
              }}
            >
              active
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {org.memberCount === 1 ? '1 member' : `${org.memberCount} members`}
        </p>
        {deleteError && (
          <p
            role="alert"
            className="text-xs mt-1"
            style={{ color: 'var(--color-danger, #ef4444)' }}
          >
            {deleteError}
          </p>
        )}
      </div>

      {/* Role badge */}
      <span
        className="text-xs font-medium rounded-full px-2.5 py-1 shrink-0"
        style={
          org.role === 'ADMIN'
            ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
            : {
                backgroundColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }
        }
      >
        {org.role === 'ADMIN' ? 'Admin' : 'Member'}
      </span>

      {/* Edit button — admin only */}
      {org.role === 'ADMIN' && (
        <button
          type="button"
          onClick={() => onStartEdit(org.id)}
          className="shrink-0 p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-elevated)]"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label={`Edit ${org.name}`}
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
      )}

      {/* Delete button — admin only */}
      {org.role === 'ADMIN' && (
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleteOrg.isPending}
          className="shrink-0 p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          style={{ color: 'var(--color-danger, #ef4444)' }}
          aria-label={`Delete ${org.name}`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// NewTeamForm
// ---------------------------------------------------------------------------

function NewTeamForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const createOrg = useCreateOrg()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setErrorMsg(null)
    try {
      await createOrg.mutateAsync({ name: trimmed })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create team'
      setErrorMsg(msg)
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex gap-2 items-start mt-4"
      noValidate
    >
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          aria-label="New team name"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        {errorMsg && (
          <p
            role="alert"
            className="text-xs mt-1"
            style={{ color: 'var(--color-danger, #ef4444)' }}
          >
            {errorMsg}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={createOrg.isPending || !name.trim()}
        className="shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        {createOrg.isPending ? 'Creating…' : 'Create'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 px-3 py-2 rounded-md text-sm transition-colors hover:bg-[var(--color-surface-elevated)]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Cancel
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// ManageTeamsTab
// ---------------------------------------------------------------------------

export function ManageTeamsTab() {
  const { data: orgs, isLoading } = useOrgs()
  const { activeOrgId } = useActiveOrg()
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading teams" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-14 w-full"
            style={{ backgroundColor: 'var(--color-border)' }}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div
          className="px-4 py-3 border-b"
          style={{ borderBottomColor: 'var(--color-border)' }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Your Teams
          </h2>
        </div>

        {(!orgs || orgs.length === 0) ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            No teams found.
          </p>
        ) : (
          <ul aria-label="Teams list">
            {orgs.map((org) => (
              <OrgRow
                key={org.id}
                org={org}
                isActive={org.id === (activeOrgId ?? orgs[0]?.id)}
                editingOrgId={editingOrgId}
                onStartEdit={(id) => setEditingOrgId(id)}
                onCloseEdit={() => setEditingOrgId(null)}
              />
            ))}
          </ul>
        )}
      </div>

      {showNewForm ? (
        <NewTeamForm onClose={() => setShowNewForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
            backgroundColor: 'transparent',
          }}
        >
          + New team
        </button>
      )}
    </div>
  )
}
