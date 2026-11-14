import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Copy, ExternalLink, FileText, FileUser, FolderOpen, IdCard, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { WORK_MODES, type Application, type ApplicationPatch, type JobFields } from '@shared/applications'
import { invoke, useErrorToast, useLanguages } from '@/lib/api'
import { appKeys, formatDate, hostOf, useApps, useUpdateApp } from '@/lib/apps'
import { usePrefs } from '@/lib/prefs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, inputClass } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { StatusPill, StatusSelect } from '@/components/apps/StatusSelect'
import { RequirementsEditor } from '@/components/apps/RequirementsEditor'
import { FilesTab } from './FilesTab'

type Tab = 'job' | 'notes' | 'files'

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={!value}
      aria-label={t('apps.copy', { name: label })}
      title={t('apps.copyShort')}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1200)
        })
      }}
      className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-card border-ui border-soft bg-surface text-muted hover:border-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

/** A field that saves itself when it loses focus. */
function InlineField({
  label,
  value,
  onSave,
  type = 'text',
  dir = 'auto',
  copy = true,
  children
}: {
  label: string
  value: string
  onSave: (v: string) => void
  type?: 'text' | 'date' | 'url'
  dir?: 'auto' | 'ltr'
  copy?: boolean
  children?: ReactNode
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft.trim() !== value) onSave(draft.trim())
  }
  return (
    <div>
      <div className="mt-4 mb-1.5 text-[11.5px] font-semibold text-muted">{label}</div>
      <div className="flex items-center gap-2">
        {children ?? (
          <input
            type={type}
            dir={dir}
            value={draft}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setDraft(value)
                e.currentTarget.blur()
              }
            }}
            className={clsx(inputClass, 'h-[38px]')}
          />
        )}
        {copy && <CopyButton value={value} label={label} />}
      </div>
    </div>
  )
}

function JobInfo({ app, save }: { app: Application; save: (patch: ApplicationPatch) => void }) {
  const { t } = useTranslation()
  const { data: languages = [] } = useLanguages()
  const [desc, setDesc] = useState(app.jobDescription)
  useEffect(() => setDesc(app.jobDescription), [app.jobDescription])

  const text = (key: keyof JobFields & string, label: string, extra?: { type?: 'date'; dir?: 'ltr' }) => (
    <InlineField key={key} label={t(label)} value={String(app[key] ?? '')} onSave={(v) => save({ [key]: v })} {...extra} />
  )
  const langs =
    languages.some((l) => l.id === app.language) || !app.language
      ? languages
      : [...languages, { id: app.language, name: app.language, dir: 'ltr' as const, builtin: false }]

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6">
        {text('company', 'apps.company')}
        {text('jobTitle', 'apps.role')}
        {text('location', 'apps.location')}
        <InlineField label={t('apps.workMode')} value={t(`workMode.${app.workMode}`)} onSave={() => {}} copy={false}>
          <div className="relative w-full">
            <select
              value={app.workMode}
              aria-label={t('apps.workMode')}
              onChange={(e) => save({ workMode: e.target.value as JobFields['workMode'] })}
              className={clsx(inputClass, 'h-[38px] cursor-pointer appearance-none pe-9')}
            >
              {WORK_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`workMode.${m}`)}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </InlineField>
        {text('deadline', 'apps.deadline', { type: 'date' })}
        {text('salary', 'apps.salary')}
        {text('contactPerson', 'apps.contact')}
        {text('companyAddress', 'apps.address')}
        {text('source', 'apps.source')}
        <InlineField label={t('apps.language')} value={app.language} onSave={() => {}} copy={false}>
          <div className="relative w-full">
            <select
              value={app.language}
              aria-label={t('apps.language')}
              onChange={(e) => save({ language: e.target.value })}
              className={clsx(inputClass, 'h-[38px] cursor-pointer appearance-none pe-9')}
            >
              {!app.language && <option value="">—</option>}
              {langs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </InlineField>
      </div>
      <InlineField
        label={t('apps.link')}
        value={app.applicationLink}
        onSave={(v) => save({ applicationLink: v })}
        type="url"
        dir="ltr"
      />

      <div className="mt-6 mb-2 text-[11.5px] font-semibold text-muted">{t('apps.requirements')}</div>
      <RequirementsEditor value={app.requirements} onChange={(v) => save({ requirements: v })} />

      <div className="mt-6 mb-1.5 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-muted">{t('apps.description')}</span>
        <CopyButton value={app.jobDescription} label={t('apps.description')} />
      </div>
      <textarea
        dir="auto"
        rows={9}
        value={desc}
        aria-label={t('apps.description')}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => desc !== app.jobDescription && save({ jobDescription: desc })}
        className="w-full resize-y rounded-card border-ui border-soft bg-field px-4 py-3 text-[13px] leading-relaxed outline-none focus:border-strong"
      />
    </div>
  )
}

function Notes({ app, save }: { app: Application; save: (patch: ApplicationPatch) => void }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(app.notes)
  const saved = useRef(app.notes)
  useEffect(() => {
    setNotes(app.notes)
    saved.current = app.notes
  }, [app.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave a moment after typing stops, and on the way out.
  useEffect(() => {
    if (notes === saved.current) return
    const timer = window.setTimeout(() => {
      saved.current = notes
      save({ notes })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [notes, save])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-muted">{t('apps.notes')}</span>
        <span className="flex items-center gap-3">
          <span className="label-mono">{notes === saved.current ? t('apps.saved') : t('apps.saving')}</span>
          <MicButton
            onText={(spoken) => setNotes((cur) => (cur.trim() ? `${cur.trimEnd()}\n${spoken}` : spoken))}
            className="h-9"
          />
        </span>
      </div>
      <textarea
        dir="auto"
        rows={14}
        value={notes}
        aria-label={t('apps.notes')}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('apps.notesPlaceholder')}
        className="w-full resize-y rounded-card border-ui border-soft bg-field px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:text-muted focus:border-strong"
      />
    </div>
  )
}

function DeleteBar({ app }: { app: Application }) {
  const { t } = useTranslation()
  const { prefs } = usePrefs()
  const navigate = useNavigate()
  const client = useQueryClient()
  const onError = useErrorToast()
  const [asking, setAsking] = useState(false)
  const [trash, setTrash] = useState(true)
  const [busy, setBusy] = useState(false)

  async function remove(): Promise<void> {
    setBusy(true)
    try {
      await invoke('apps:delete', app.id, trash)
      client.setQueryData<Application[]>(appKeys.list, (list) => list?.filter((a) => a.id !== app.id))
      client.removeQueries({ queryKey: appKeys.files(app.id) })
      toast.success(t('apps.deleted'))
      navigate('/applications', { replace: true })
    } catch (err) {
      onError(err)
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 border-t border-soft pt-4">
      {asking ? (
        <div className="rounded-card border-ui border-strong bg-[color-mix(in_srgb,var(--pink)_45%,var(--surface))] px-4 py-4">
          <b className="block text-[13.5px] font-semibold">{t('apps.deleteConfirm')}</b>
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={trash} onChange={(e) => setTrash(e.target.checked)} />
            {t('apps.trashFolder')}
          </label>
          <div className="mt-3.5 flex gap-3">
            <Button size="sm" onClick={() => setAsking(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void remove()}>
              <Trash2 />
              {t('apps.deleteYes')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
          >
            <Trash2 size={14} />
            {t('apps.delete')}
          </button>
          <span className="label-mono">{t('apps.addedOn', { date: formatDate(app.dateAdded, prefs.language) })}</span>
        </div>
      )}
    </div>
  )
}

function Detail({ app }: { app: Application }) {
  const { t } = useTranslation()
  const onError = useErrorToast()
  const update = useUpdateApp()
  const [tab, setTab] = useState<Tab>('job')
  const [savedAt, setSavedAt] = useState(0)
  const mutate = update.mutate
  const save = useMemo(
    () => (patch: ApplicationPatch) => mutate({ id: app.id, patch }, { onSuccess: () => setSavedAt(Date.now()) }),
    [mutate, app.id]
  )
  useEffect(() => setTab('job'), [app.id])
  const host = hostOf(app.applicationLink)

  return (
    <section className="rounded-card border-ui border-strong bg-surface px-7 py-6">
      <div className="flex items-center justify-between">
        <span className="label-mono" dir="ltr">
          #{String(app.number).padStart(3, '0')}
        </span>
        <Link to="/applications" replace aria-label={t('common.close')} className="text-muted hover:text-ink">
          <X size={18} />
        </Link>
      </div>
      <div className="mt-3 flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-muted" dir="auto">
            {app.company || t('apps.noCompany')}
          </div>
          <h2 className="mt-1 font-head text-[28px] leading-tight font-bold" dir="auto">
            {app.jobTitle || t('apps.noTitle')}
          </h2>
          <div className="mt-1.5 text-[13px] text-muted" dir="auto">
            {[app.location, app.workMode !== 'unknown' && t(`workMode.${app.workMode}`)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <StatusSelect size="lg" value={app.status} onChange={(status) => save({ status })} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {app.applicationLink && (
          <a
            href={app.applicationLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[38px] items-center gap-2 rounded-card border-ui border-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink no-underline hover:bg-field"
          >
            <ExternalLink size={15} />
            {t('apps.openPosting')}
            {host && <span className="font-normal text-muted">{host}</span>}
          </a>
        )}
        <Button size="sm" className="!h-[38px]" onClick={() => invoke('apps:openFolder', app.id).catch(onError)}>
          <FolderOpen />
          {t('apps.openFolder')}
        </Button>
        {/* Straight to this job's documents, instead of the menu and picking the job again. */}
        {(
          [
            ['/cv', 'cvStudio', FileUser],
            ['/cover-letter', 'coverLetter', FileText],
            ['/reference', 'reference', IdCard]
          ] as const
        ).map(([to, key, Icon]) => (
          <Link
            key={to}
            to={`${to}?app=${app.id}`}
            className="inline-flex h-[38px] items-center gap-2 rounded-card border-ui border-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink no-underline hover:bg-field"
          >
            <Icon size={15} />
            {t(`nav.${key}`)}
          </Link>
        ))}
        {savedAt > 0 && (
          <span className="label-mono ms-auto flex items-center gap-1.5">
            <Check size={13} />
            {t('apps.saved')}
          </span>
        )}
      </div>

      <div role="tablist" className="mt-6 flex gap-1 border-b border-soft">
        {(['job', 'notes', 'files'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              '-mb-px cursor-pointer border-b-2 px-3.5 py-2.5 text-[13px]',
              tab === id ? 'border-strong font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
            )}
          >
            {t(`apps.tab.${id}`)}
          </button>
        ))}
      </div>
      <div className="pt-2">
        {tab === 'job' && <JobInfo app={app} save={save} />}
        {tab === 'notes' && <Notes app={app} save={save} />}
        {tab === 'files' && (
          <div className="pt-4">
            <FilesTab app={app} />
          </div>
        )}
      </div>
      <DeleteBar app={app} />
    </section>
  )
}

export function ApplicationsView() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: apps = [], isPending } = useApps()
  const [query, setQuery] = useState('')
  const current = apps.find((a) => a.id === id)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? apps.filter((a) => [a.company, a.jobTitle, a.location].some((v) => v.toLowerCase().includes(q))) : apps
  }, [apps, query])

  return (
    <>
      <PageHeader
        page="applications"
        back="/"
        actions={
          <Button variant="primary" onClick={() => navigate('/applications/new')}>
            <Plus />
            {t('apps.add')}
          </Button>
        }
      />
      <div className="grid grid-cols-[minmax(0,320px)_minmax(0,1fr)] items-start gap-6">
        <aside className="flex flex-col gap-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('dash.search')}
              aria-label={t('dash.search')}
              className={clsx(inputClass, 'ps-9')}
            />
          </div>
          <ul className="flex flex-col gap-2.5">
            {shown.map((a) => (
              <li key={a.id}>
                <NavLink
                  to={`/applications/${a.id}`}
                  replace
                  className={({ isActive }) =>
                    clsx(
                      'block rounded-card border-ui px-4 py-3 text-ink no-underline',
                      isActive ? 'border-strong bg-surface shadow-hard' : 'border-soft bg-surface hover:border-strong'
                    )
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <b className="truncate text-[13.5px] font-semibold" dir="auto">
                      {a.company || t('apps.noCompany')}
                    </b>
                    <span className="font-mono text-[10.5px] text-muted" dir="ltr">
                      #{String(a.number).padStart(3, '0')}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted" dir="auto">
                    {a.jobTitle}
                  </div>
                  <div className="mt-2.5">
                    <StatusPill status={a.status} />
                  </div>
                </NavLink>
              </li>
            ))}
          </ul>
          {!isPending && shown.length === 0 && (
            <p className="px-1 py-4 text-[12.5px] text-muted">{apps.length ? t('dash.noMatch') : t('apps.empty')}</p>
          )}
        </aside>
        {current ? (
          <Detail app={current} />
        ) : (
          <section className="flex min-h-[320px] flex-col items-center justify-center rounded-card border-ui border-dashed border-soft px-6 text-center">
            <b className="font-head text-[18px] font-bold">{id && !isPending ? t('apps.gone') : t('apps.pick')}</b>
            <p className="mt-1.5 text-[13px] text-muted">{t('apps.pickSub')}</p>
          </section>
        )}
      </div>
    </>
  )
}
