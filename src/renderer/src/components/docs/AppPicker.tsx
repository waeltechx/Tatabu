import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import type { Application } from '@shared/applications'
import { useApps } from '@/lib/apps'
import { inputClass } from '@/components/ui'

/** The application a document screen works on, kept in the URL (?app=…). Defaults to the newest one. */
export function useChosenApp(): {
  app: Application | undefined
  apps: Application[]
  setApp: (id: string) => void
  isPending: boolean
} {
  const { data: apps = [], isPending } = useApps()
  const [params, setParams] = useSearchParams()
  const id = params.get('app')
  const app = apps.find((a) => a.id === id) ?? apps[0]
  useEffect(() => {
    if (app && app.id !== id) setParams((p) => (p.set('app', app.id), p), { replace: true })
  }, [app, id, setParams])
  return { app, apps, isPending, setApp: (next) => setParams((p) => (p.set('app', next), p), { replace: true }) }
}

export function AppPicker({
  value,
  apps,
  onChange,
  className
}: {
  value: string
  apps: Application[]
  onChange: (id: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={clsx('relative', className)}>
      <select
        value={value}
        aria-label={t('docs.application')}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(inputClass, 'cursor-pointer appearance-none pe-9')}
      >
        {apps.map((a) => (
          <option key={a.id} value={a.id}>
            {[a.company || t('apps.noCompany'), a.jobTitle].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute end-[11px] top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function SelectField({
  value,
  onChange,
  label,
  children,
  className
}: {
  value: string
  onChange: (v: string) => void
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={clsx('relative', className)}>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(inputClass, 'cursor-pointer appearance-none pe-9')}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute end-[11px] top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}

/** Shown on document screens until there is at least one application. */
export function NoApplications() {
  const { t } = useTranslation()
  return (
    <section className="flex min-h-[280px] flex-col items-center justify-center rounded-card border-ui border-dashed border-soft px-6 text-center">
      <b className="font-head text-[18px] font-bold">{t('docs.noApps')}</b>
      <p className="mt-1.5 max-w-[420px] text-[13px] text-muted">{t('docs.noAppsSub')}</p>
      <a href="#/applications/new" className="mt-4 text-[13px] font-semibold text-ink underline">
        {t('apps.add')}
      </a>
    </section>
  )
}
