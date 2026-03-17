import { useState, useRef, useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  FileText,
  LayoutDashboard,
  BarChart3,
  Settings,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
} from 'lucide-react'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { toggleTheme, getTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useOrgs, useCreateOrg, type OrgSummary } from '@/hooks/useOrg'
import { useActiveOrg } from '@/contexts/OrgContext'

interface AppLayoutProps {
  children: ReactNode
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function getUserInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ---------------------------------------------------------------------------
// OrgSwitcher
// ---------------------------------------------------------------------------

interface OrgSwitcherProps {
  collapsed: boolean
}

function OrgSwitcher({ collapsed }: OrgSwitcherProps) {
  const { activeOrgId, setActiveOrgId } = useActiveOrg()
  const { data: orgs } = useOrgs()
  const createOrg = useCreateOrg()

  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeOrg: OrgSummary | undefined =
    orgs?.find((o) => o.id === activeOrgId) ?? orgs?.[0]

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowCreate(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus input when create form appears
  useEffect(() => {
    if (showCreate) inputRef.current?.focus()
  }, [showCreate])

  function handleSelectOrg(org: OrgSummary) {
    setActiveOrgId(org.id)
    setOpen(false)
    setShowCreate(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    await createOrg.mutateAsync({ name: trimmed })
    setNewName('')
    setOpen(false)
    setShowCreate(false)
  }

  const displayName = activeOrg?.name ?? 'Select org'

  return (
    <div
      className="relative px-2 py-2 border-b shrink-0"
      style={{ borderColor: 'var(--color-border)' }}
      ref={dropdownRef}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors',
          'hover:bg-[var(--color-surface-elevated)]',
          collapsed ? 'justify-center' : '',
        )}
        aria-label="Switch organization"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {/* Org logo / initials avatar */}
        <div
          className="flex items-center justify-center rounded w-6 h-6 shrink-0 font-bold text-white overflow-hidden"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {activeOrg ? (
            activeOrg.logoUrl ? (
              <img
                src={activeOrg.logoUrl}
                alt={activeOrg.name}
                className="w-6 h-6 rounded object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              getInitials(activeOrg.name)
            )
          ) : (
            '??'
          )}
        </div>
        {!collapsed && (
          <>
            <span
              className="flex-1 truncate text-left font-medium"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {displayName}
            </span>
            <ChevronDown
              size={14}
              className={cn('shrink-0 transition-transform', open ? 'rotate-180' : '')}
              style={{ color: 'var(--color-text-muted)' }}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute left-2 right-2 top-full mt-1 z-50 rounded-md border shadow-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          role="listbox"
          aria-label="Organizations"
        >
          {orgs && orgs.length > 0 && (
            <ul className="py-1" role="presentation">
              {orgs.map((org) => (
                <li key={org.id} role="option" aria-selected={org.id === activeOrg?.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectOrg(org)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors',
                      'hover:bg-[var(--color-surface-elevated)]',
                    )}
                  >
                    <div
                      className="flex items-center justify-center rounded w-5 h-5 shrink-0 font-bold text-white overflow-hidden"
                      style={{ backgroundColor: 'var(--color-accent)', fontSize: '0.75rem' }}
                    >
                      {org.logoUrl ? (
                        <img
                          src={org.logoUrl}
                          alt={org.name}
                          className="w-5 h-5 rounded object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        getInitials(org.name)
                      )}
                    </div>
                    <span
                      className="flex-1 truncate text-left"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {org.name}
                    </span>
                    {org.id === activeOrg?.id && (
                      <Check
                        size={14}
                        style={{ color: 'var(--color-accent)' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Divider */}
          <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />

          {/* New team option */}
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors',
                'hover:bg-[var(--color-surface-elevated)]',
              )}
            >
              <Plus size={14} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <span style={{ color: 'var(--color-text-muted)' }}>New team</span>
            </button>
          ) : (
            <form onSubmit={(e) => { void handleCreate(e) }} className="p-2 flex gap-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Team name"
                aria-label="New team name"
                className={cn(
                  'flex-1 min-w-0 rounded px-2 py-1 text-xs border outline-none',
                  'focus:ring-1 focus:ring-[var(--color-accent)]',
                )}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={createOrg.isPending || !newName.trim()}
                className={cn(
                  'shrink-0 rounded px-2 py-1 text-xs font-medium text-white transition-colors',
                  'disabled:opacity-50',
                )}
                style={{ backgroundColor: 'var(--color-accent)' }}
                aria-label="Create team"
              >
                {createOrg.isPending ? '...' : 'Create'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AppLayout
// ---------------------------------------------------------------------------

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme)

  function handleThemeToggle() {
    const next = toggleTheme()
    setTheme(next)
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login')
  }

  const sidebarWidth = collapsed ? 'w-14' : 'w-60'

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col shrink-0 transition-all duration-200 border-r',
          sidebarWidth,
        )}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        aria-label="Sidebar navigation"
      >
        {/* Logo row */}
        <div
          className={cn(
            'flex items-center gap-2 h-14 px-3 border-b shrink-0',
            collapsed ? 'justify-center' : 'justify-between',
          )}
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText
              className="shrink-0"
              size={22}
              style={{ color: 'var(--color-accent)' }}
              aria-hidden="true"
            />
            {!collapsed && (
              <span
                className="font-semibold text-sm truncate"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Support2Docs
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--color-surface-elevated)]"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
            ) : (
              <ChevronLeft size={14} style={{ color: 'var(--color-text-muted)' }} />
            )}
          </button>
        </div>

        {/* Org switcher */}
        <OrgSwitcher collapsed={collapsed} />

        {/* Nav links */}
        <nav className="flex flex-col gap-1 p-2 flex-1" aria-label="Main navigation">
          <NavLink
            to="/dashboard"
            className={({ isActive, isPending: _p }) => {
              const active = isActive && !window.location.search.includes('view=stats')
              return cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center' : '',
                active
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]',
              )
            }}
            aria-label="Dashboard"
          >
            <LayoutDashboard size={18} className="shrink-0" aria-hidden="true" />
            {!collapsed && <span>Dashboard</span>}
          </NavLink>

          <NavLink
            to="/dashboard?view=stats"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center' : '',
                isActive && window.location.search.includes('view=stats')
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]',
              )
            }
            aria-label="Stats"
          >
            <BarChart3 size={18} className="shrink-0" aria-hidden="true" />
            {!collapsed && <span>Stats</span>}
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center' : '',
                isActive
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]',
              )
            }
            aria-label="Settings"
          >
            <Settings size={18} className="shrink-0" aria-hidden="true" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
        </nav>

        {/* Bottom section: theme toggle + user */}
        <div
          className="border-t p-2 space-y-1"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {/* Theme toggle */}
          <button
            onClick={handleThemeToggle}
            className={cn(
              'flex items-center gap-3 w-full rounded-md px-2 py-2 text-sm transition-colors',
              'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]',
              collapsed ? 'justify-center' : '',
            )}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <Sun size={18} className="shrink-0" aria-hidden="true" />
            ) : (
              <Moon size={18} className="shrink-0" aria-hidden="true" />
            )}
            {!collapsed && (
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            )}
          </button>

          {/* User info + sign out */}
          {user && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-2',
                collapsed ? 'justify-center' : '',
              )}
            >
              {/* Avatar */}
              <div
                className="flex items-center justify-center rounded-full w-7 h-7 shrink-0 text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
                aria-hidden="true"
              >
                {getUserInitials(user.email ?? 'U')}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs truncate"
                    style={{ color: 'var(--color-text-muted)' }}
                    title={user.email ?? ''}
                  >
                    {user.email}
                  </p>
                </div>
              )}
              {!collapsed && (
                <button
                  onClick={handleSignOut}
                  className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--color-surface-elevated)]"
                  aria-label="Sign out"
                >
                  <LogOut size={14} style={{ color: 'var(--color-text-muted)' }} />
                </button>
              )}
            </div>
          )}

          {/* Collapsed sign-out */}
          {user && collapsed && (
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center w-full rounded-md px-2 py-2 text-sm transition-colors text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
              aria-label="Sign out"
            >
              <LogOut size={18} className="shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
