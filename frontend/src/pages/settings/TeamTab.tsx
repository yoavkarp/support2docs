import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import {
  useOrgMembers,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
  type OrgMember,
} from '@/hooks/useOrg'
import { useAuth } from '@/hooks/useAuth'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/formatRelative'

function getInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function MemberRowActions({
  member,
  currentUserEmail,
  currentUserIsAdmin,
}: {
  member: OrgMember
  currentUserEmail: string | null
  currentUserIsAdmin: boolean
}) {
  const removeMutation = useRemoveMember()
  const roleUpdateMutation = useUpdateMemberRole()
  const isSelf = member.userEmail === currentUserEmail

  async function handleRemove() {
    if (!member.userId) return
    if (!window.confirm(`Remove ${member.userEmail} from the team?`)) return
    await removeMutation.mutateAsync(member.userId)
  }

  async function handleRoleToggle() {
    if (!member.userId) return
    const newRole = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'
    await roleUpdateMutation.mutateAsync({ userId: member.userId, role: newRole })
  }

  return (
    <div className="flex items-center gap-2">
      {currentUserIsAdmin && !isSelf && member.userId && (
        <button
          type="button"
          onClick={() => void handleRoleToggle()}
          disabled={roleUpdateMutation.isPending}
          className="text-xs px-2 py-1 rounded-md border transition-colors hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          {member.role === 'ADMIN' ? 'Make Member' : 'Make Admin'}
        </button>
      )}
      {!isSelf && member.userId && (
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={removeMutation.isPending}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          style={{ color: 'var(--color-danger, #ef4444)' }}
          aria-label={`Remove ${member.userEmail}`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function InviteForm() {
  const [email, setEmail] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const mutation = useInviteMember()

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)
    try {
      await mutation.mutateAsync({ email: email.trim() })
      setSuccessMsg(`Invitation sent to ${email.trim()}`)
      setEmail('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.toLowerCase().includes('already a member')) {
        setErrorMsg('Already a member')
      } else if (msg.toLowerCase().includes('admin')) {
        setErrorMsg('You need admin access to invite members.')
      } else {
        setErrorMsg(msg || 'Failed to send invitation. Please try again.')
      }
    }
  }

  return (
    <div
      className="mt-6 p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Invite team member
      </h3>
      <form onSubmit={(e) => void handleInvite(e)} className="flex gap-2" noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          required
          aria-label="Email address to invite"
          className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={mutation.isPending || !email.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {mutation.isPending ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      {successMsg && (
        <p role="status" className="mt-2 text-sm" style={{ color: 'var(--color-accent)' }}>
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p
          role="alert"
          className="mt-2 text-sm"
          style={{ color: 'var(--color-danger, #ef4444)' }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  )
}

export function TeamTab() {
  const { data: members, isLoading } = useOrgMembers()
  const { user } = useAuth()

  const currentUserEmail = user?.email ?? null
  const currentUserIsAdmin =
    members?.find((m) => m.userEmail === currentUserEmail)?.role === 'ADMIN'

  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading team members" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
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
        style={{ borderColor: 'var(--color-border)' }}
      >
        <table className="w-full" aria-label="Team members">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-surface)' }}>
              {['Member', 'Role', 'Joined', ''].map((col) => (
                <th
                  key={col}
                  className="text-left text-xs font-semibold uppercase tracking-wide px-4 py-3"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ backgroundColor: 'var(--color-bg)' }}>
            {(!members || members.length === 0) && (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 text-center text-sm"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  No team members yet.
                </td>
              </tr>
            )}
            {members?.map((member) => (
              <tr
                key={member.userId ?? member.userEmail}
                className="border-b last:border-0"
                style={{ borderBottomColor: 'var(--color-border)' }}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center rounded-full w-8 h-8 shrink-0 text-xs font-semibold text-white"
                      style={{ backgroundColor: 'var(--color-accent)' }}
                      aria-hidden="true"
                    >
                      {getInitials(member.userEmail)}
                    </div>
                    <div className="min-w-0">
                      <span
                        className="text-sm font-medium truncate block"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {member.userEmail}
                      </span>
                      {member.userId === null && (
                        <span
                          className="text-xs rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: 'var(--color-border)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          Invited
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className="text-xs font-medium rounded-full px-2.5 py-1"
                    style={
                      member.role === 'ADMIN'
                        ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
                        : {
                            backgroundColor: 'var(--color-border)',
                            color: 'var(--color-text-muted)',
                          }
                    }
                  >
                    {member.role === 'ADMIN' ? 'Admin' : 'Member'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {formatRelative(member.joinedAt)}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <MemberRowActions
                    member={member}
                    currentUserEmail={currentUserEmail}
                    currentUserIsAdmin={currentUserIsAdmin}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InviteForm />
    </div>
  )
}
