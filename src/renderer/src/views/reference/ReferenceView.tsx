import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Download, ExternalLink, LoaderCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { referenceDocFor } from '@shared/docs/reference'
import type { ReferenceState } from '@shared/documents'
import { EMPTY_PROFILE } from '@shared/profile'
import { EMPTY_REFEREE, type Referee } from '@shared/settings'
import { invoke, useErrorToast, useLanguages, useSettings } from '@/lib/api'
import { appKeys } from '@/lib/apps'
import { docKeys, useProfile } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, TextInput } from '@/components/ui'
import { DocPreview } from '@/components/docs/DocPreview'
import { AppPicker, NoApplications, SelectField, useChosenApp } from '@/components/docs/AppPicker'

const TITLES: Record<string, string[]> = {
  en: ['References', 'Professional references', 'Academic references'],
  ar: ['المراجع', 'المراجع المهنية', 'المراجع الأكاديمية'],
  de: ['Referenzen', 'Berufliche Referenzen', 'Akademische Referenzen']
}

function RefereeCard({
  referee,
  index,
  open,
  onToggle,
  onChange,
  onRemove
}: {
  referee: Referee
  index: number
  open: boolean
  onToggle: () => void
  onChange: (r: Referee) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const set = <K extends keyof Referee>(k: K, v: Referee[K]): void => onChange({ ...referee, [k]: v })
  const num = String(index + 1).padStart(2, '0')
  if (!open) {
    return (
      <div className="flex items-center gap-3 rounded-card border-ui border-soft bg-field px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="label-mono">{t('refs.reference', { n: num })}</div>
          <b className="mt-1 block truncate font-head text-[16px] font-bold" dir="auto">
            {referee.name || t('refs.unnamed')}
          </b>
          <span className="block truncate text-[12px] text-muted" dir="auto">
            {[referee.affiliation, referee.relationship].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button type="button" onClick={onToggle} className="flex cursor-pointer items-center gap-1 text-[12.5px] font-medium">
          {t('common.edit')} <ChevronDown size={14} />
        </button>
      </div>
    )
  }
  return (
    <div className="rounded-card border-ui border-strong bg-surface px-4 pt-3 pb-4">
      <div className="flex items-center justify-between">
        <span className="label-mono">{t('refs.reference', { n: num })}</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer text-[12.5px] font-medium text-[#a3352a] dark:text-[#f19a8c]"
          >
            {t('refs.remove')}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={t('refs.collapse')}
            className="cursor-pointer text-muted hover:text-ink"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-5">
        <div>
          <FieldLabel>{t('settings.refs.name')}</FieldLabel>
          <TextInput dir="auto" value={referee.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <FieldLabel>{t('settings.refs.relationship')}</FieldLabel>
          <TextInput dir="auto" value={referee.relationship} onChange={(e) => set('relationship', e.target.value)} />
        </div>
      </div>
      <FieldLabel>{t('settings.refs.affiliation')}</FieldLabel>
      <TextInput dir="auto" value={referee.affiliation} onChange={(e) => set('affiliation', e.target.value)} />
      <div className="grid grid-cols-2 gap-x-5">
        <div>
          <FieldLabel>{t('settings.refs.email')}</FieldLabel>
          <TextInput dir="ltr" value={referee.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <FieldLabel>{t('settings.refs.phone')}</FieldLabel>
          <TextInput dir="ltr" value={referee.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-5">
        <div>
          <FieldLabel>{t('settings.refs.address')}</FieldLabel>
          <TextInput dir="auto" value={referee.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <label className="mb-2.5 flex max-w-[150px] cursor-pointer items-center gap-2 text-[11.5px] font-medium">
          <input
            type="checkbox"
            checked={referee.includeRelationship}
            onChange={(e) => set('includeRelationship', e.target.checked)}
          />
          {t('refs.printRelationship')}
        </label>
      </div>
    </div>
  )
}

export function ReferenceView() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const { app, apps, setApp, isPending } = useChosenApp()
  const { data: profile = EMPTY_PROFILE } = useProfile()
  const { data: languages = [] } = useLanguages()
  const { data: settings } = useSettings()
  const { data: savedState } = useQuery({
    queryKey: docKeys.refs(app?.id ?? ''),
    queryFn: () => invoke('refs:get', app!.id),
    enabled: !!app,
    staleTime: 0
  })
  const [state, setState] = useState<ReferenceState | null>(null)
  const [open, setOpen] = useState(0)
  const [printing, setPrinting] = useState(false)
  const [lastFile, setLastFile] = useState<string | null>(null)
  const firstLoad = useRef(true)

  useEffect(() => {
    setState(savedState ?? null)
    firstLoad.current = true
    setLastFile(null)
  }, [savedState])

  // Save edits a moment after they stop.
  useEffect(() => {
    if (!state || !app) return
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    const timer = window.setTimeout(() => {
      invoke('refs:save', app.id, state)
        .then((s) => client.setQueryData(docKeys.refs(app.id), s))
        .catch(onError)
    }, 600)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const language = languages.find((l) => l.id === state?.language) ?? languages[0]
  const doc = useMemo(
    () =>
      app && state && language
        ? referenceDocFor({ job: app, title: state.title, referees: state.referees, profile, language, paper: settings?.paper })
        : null,
    [app, state, language, profile, settings?.paper]
  )

  if (!isPending && apps.length === 0) {
    return (
      <>
        <PageHeader page="reference" />
        <NoApplications />
      </>
    )
  }
  if (!app || !state) return <PageHeader page="reference" />

  const editReferees = (fn: (list: Referee[]) => Referee[]): void =>
    setState((s) => (s ? { ...s, custom: true, referees: fn(s.referees) } : s))

  async function print(): Promise<void> {
    if (!app || !state) return
    setPrinting(true)
    try {
      const saved = await invoke('refs:print', app.id, state)
      client.setQueryData(appKeys.files(app.id), saved.files)
      setLastFile(saved.fileId)
      toast.success(t('docs.savedToFolder', { name: saved.filename }))
    } catch (err) {
      onError(err)
    } finally {
      setPrinting(false)
    }
  }

  const titles = TITLES[language?.id ?? 'en'] ?? TITLES.en!

  return (
    <>
      <PageHeader page="reference" actions={<span className="label-mono me-4 self-end pb-2">{t('docs.savedOnDevice')}</span>} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,500px)] items-start gap-6">
        <section className="rounded-card border-ui border-strong bg-surface px-5 py-5">
          <div className="label-mono">{t('refs.kicker')}</div>
          <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-x-4">
            <div>
              <FieldLabel>{t('docs.application')}</FieldLabel>
              <AppPicker value={app.id} apps={apps} onChange={setApp} />
            </div>
            <div>
              <FieldLabel>{t('docs.language')}</FieldLabel>
              <SelectField
                label={t('docs.language')}
                value={state.language}
                onChange={(v) => setState({ ...state, language: v, title: '' })}
              >
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
          <FieldLabel htmlFor="ref-title">{t('refs.docTitle')}</FieldLabel>
          <div className="flex gap-3">
            <TextInput
              id="ref-title"
              dir="auto"
              value={state.title}
              placeholder={titles[0]}
              onChange={(e) => setState({ ...state, title: e.target.value })}
            />
            <SelectField
              label={t('refs.suggest')}
              value=""
              onChange={(v) => v && setState({ ...state, title: v })}
              className="w-[210px] shrink-0"
            >
              <option value="">{t('refs.suggest')}</option>
              {titles.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {state.referees.map((r, i) => (
              <RefereeCard
                key={r.id + i}
                referee={r}
                index={i}
                open={open === i}
                onToggle={() => setOpen(open === i ? -1 : i)}
                onChange={(next) => editReferees((list) => list.map((x, j) => (j === i ? next : x)))}
                onRemove={() => editReferees((list) => list.filter((_, j) => j !== i))}
              />
            ))}
            {state.referees.length === 0 && (
              <p className="rounded-card border-ui border-dashed border-soft px-4 py-5 text-center text-[12.5px] text-muted">
                {t('refs.none')}{' '}
                <Link to="/settings" className="font-semibold text-ink underline">
                  {t('refs.toSettings')}
                </Link>
              </p>
            )}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button
              onClick={() => {
                editReferees((list) => [...list, { ...EMPTY_REFEREE, id: `custom-${Date.now()}` }])
                setOpen(state.referees.length)
              }}
            >
              <Plus />
              {t('refs.add')}
            </Button>
            {state.custom && (
              <Button variant="ghost" className="ms-auto" onClick={() => setState({ ...state, custom: false })}>
                {t('refs.reset')}
              </Button>
            )}
          </div>
          <p className="label-mono mt-6">{state.custom ? t('refs.customNote') : t('refs.defaultsNote')}</p>
        </section>

        <section className="sticky top-6 rounded-card border-ui border-strong bg-purple px-5 py-5 text-paper-ink">
          <div className="flex items-center justify-between">
            <span className="label-mono !text-[#4a4560]">{t('docs.preview')}</span>
            <span className="label-mono !text-[#4a4560]">{settings?.paper ?? 'A4'}</span>
          </div>
          <div className="mt-4 max-h-[62vh] overflow-auto border-ui border-paper-ink bg-white">
            {doc && <DocPreview doc={doc} paper={settings?.paper} />}
          </div>
          <p className="mt-4 text-[12.5px]">{t('docs.savedToFiles')}</p>
          <div className="mt-3 flex gap-3">
            <Button variant="primary" className="flex-1" disabled={printing} onClick={() => void print()}>
              {printing ? <LoaderCircle className="animate-spin" /> : <Download />}
              {t('docs.printPdf')}
            </Button>
            {lastFile && (
              <Button variant="paper" onClick={() => invoke('files:open', lastFile).catch(onError)}>
                <ExternalLink />
                {t('docs.openPdf')}
              </Button>
            )}
          </div>
          {!profile.fullName && (
            <p className={clsx('mt-3 text-[12px]')}>
              {t('docs.noProfile')}{' '}
              <Link to="/profile" className="font-semibold text-paper-ink underline">
                {t('nav.profile')}
              </Link>
            </p>
          )}
        </section>
      </div>
    </>
  )
}
