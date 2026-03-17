import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { IntegrationsTab } from './settings/IntegrationsTab'
import { TeamTab } from './settings/TeamTab'
import { ManageTeamsTab } from './settings/ManageTeamsTab'

type SettingsTab = 'integrations' | 'team' | 'teams'

const TABS: { label: string; value: SettingsTab }[] = [
  { label: 'Integrations', value: 'integrations' },
  { label: 'Team', value: 'team' },
  { label: 'Manage Teams', value: 'teams' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations')

  useEffect(() => {
    document.title = 'Settings | Support2Docs'
  }, [])

  return (
    <main
      className="flex-1 px-6 py-8"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-3xl mx-auto">
        <h1
          className="text-2xl font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Settings
        </h1>
        <p
          className="mt-1 text-sm mb-6"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Manage integrations and your team
        </p>

        {/* Tab bar */}
        <div
          className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
          role="tablist"
          aria-label="Settings sections"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          {TABS.map(({ label, value }) => {
            const isActive = activeTab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${value}`}
                id={`settings-tab-${value}`}
                onClick={() => setActiveTab(value)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
                )}
                style={
                  isActive
                    ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
                    : { backgroundColor: 'transparent', color: 'var(--color-text-muted)' }
                }
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Tab panels */}
        <div
          id="settings-panel-integrations"
          role="tabpanel"
          aria-labelledby="settings-tab-integrations"
          hidden={activeTab !== 'integrations'}
        >
          <div
            className="rounded-lg border p-6"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <h2
              className="text-base font-semibold mb-5"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Integration Settings
            </h2>
            <IntegrationsTab />
          </div>
        </div>

        <div
          id="settings-panel-team"
          role="tabpanel"
          aria-labelledby="settings-tab-team"
          hidden={activeTab !== 'team'}
        >
          <TeamTab />
        </div>

        <div
          id="settings-panel-teams"
          role="tabpanel"
          aria-labelledby="settings-tab-teams"
          hidden={activeTab !== 'teams'}
        >
          <ManageTeamsTab />
        </div>
      </div>
    </main>
  )
}
