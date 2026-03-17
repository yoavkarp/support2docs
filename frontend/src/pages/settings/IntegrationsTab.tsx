import { useState, useEffect, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useOrgSettings, useUpdateOrgSettings, type OrgSettings } from '@/hooks/useOrg'
import { Skeleton } from '@/components/ui/skeleton'

function PasswordField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 transition-colors hover:text-[var(--color-text-primary)]"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
        aria-label={label}
      />
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
        aria-label={label}
      />
    </div>
  )
}

function buildInitialForm(data: OrgSettings): OrgSettings {
  return {
    zendeskSubdomain: data.zendeskSubdomain ?? '',
    // Secret fields are always initialised empty so that saving without
    // touching them sends an empty string, which the backend interprets as
    // "leave unchanged" (omitted) rather than overwriting with the masked hint.
    zendeskApiKey: '',
    intercomToken: '',
    kbPublishUrl: data.kbPublishUrl ?? '',
    clusterThreshold: data.clusterThreshold,
    minClusterSize: data.minClusterSize,
  }
}

export function IntegrationsTab() {
  const { data, isLoading } = useOrgSettings()
  const mutation = useUpdateOrgSettings()

  const [form, setForm] = useState<OrgSettings>({
    zendeskSubdomain: '',
    zendeskApiKey: '',
    intercomToken: '',
    kbPublishUrl: '',
    clusterThreshold: 0.65,
    minClusterSize: 5,
  })
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (data) setForm(buildInitialForm(data))
  }, [data])

  function setField<K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)
    try {
      await mutation.mutateAsync(form)
      setSuccessMsg('Settings saved')
    } catch {
      setErrorMsg('Failed to save settings. Please try again.')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading settings" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-4 w-32" style={{ backgroundColor: 'var(--color-border)' }} />
            <Skeleton className="h-9 w-full" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
      <TextField
        id="zendeskSubdomain"
        label="Zendesk Subdomain"
        value={form.zendeskSubdomain ?? ''}
        placeholder="your-company"
        onChange={(v) => setField('zendeskSubdomain', v)}
      />
      <PasswordField
        id="zendeskApiKey"
        label="Zendesk API Key"
        value={form.zendeskApiKey ?? ''}
        placeholder={data?.zendeskApiKey ? String(data.zendeskApiKey) : 'Enter API key'}
        onChange={(v) => setField('zendeskApiKey', v)}
      />
      <PasswordField
        id="intercomToken"
        label="Intercom Token"
        value={form.intercomToken ?? ''}
        placeholder={data?.intercomToken ? String(data.intercomToken) : 'Enter token'}
        onChange={(v) => setField('intercomToken', v)}
      />
      <TextField
        id="kbPublishUrl"
        label="KB Publish URL"
        value={form.kbPublishUrl ?? ''}
        placeholder="https://..."
        onChange={(v) => setField('kbPublishUrl', v)}
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          id="clusterThreshold"
          label="Cluster Threshold"
          value={form.clusterThreshold}
          min={0.1}
          max={1.0}
          step={0.05}
          onChange={(v) => setField('clusterThreshold', v)}
        />
        <NumberField
          id="minClusterSize"
          label="Min Cluster Size"
          value={form.minClusterSize}
          min={1}
          max={50}
          step={1}
          onChange={(v) => setField('minClusterSize', v)}
        />
      </div>

      {successMsg && (
        <p
          role="status"
          className="text-sm"
          style={{ color: 'var(--color-accent)' }}
        >
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        {mutation.isPending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
