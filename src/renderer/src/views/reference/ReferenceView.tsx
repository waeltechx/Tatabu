import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Download, ExternalLink, LoaderCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
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
    const secondary = [referee.affiliation, referee.relationship].filter(Boolean).join(' · ')
    return (
      <div className="flex min-h-9 items-center gap-2.5 rounded-card border-ui border-soft bg-field py-1 ps-3 pe-1">
        <span className="label-mono shrink-0">{t('refs.reference', { n: num })}</span>
        <div className="min-w-0 flex-1 truncate text-[13px]">
          <b className="font-semibold" dir="auto">
            {referee.name || t('refs.unnamed')}
          </b>
          {secondary && (
            <span className="text-muted" dir="auto">
              {' · '}
              {secondary}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-card px-2 text-[12px] font-medium hover:bg-surface"
        >
          {t('common.edit')} <ChevronDown size={14} />
        </button>
      </div>
    )
  }
  return (
    <div className="rounded-card border-ui border-strong bg-surface px-3 pt-1.5 pb-3">
      <div className="flex items-center justify-between">
        <span className="label-mono">{t('refs.reference', { n: num })}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRemove}
            className="h-7 cursor-pointer rounded-card px-2 text-[12px] font-medium text-[#a3352a] hover:bg-field dark:text-[#f19a8c]"
          >
            {t('refs.remove')}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={t('refs.collapse')}
            className="flex size-7 cursor-pointer items-center justify-center rounded-card text-muted hover:bg-field hover:text-ink"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3">
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
      <div className="grid grid-cols-2 gap-x-3">
        <div>
          <FieldLabel>{t('settings.refs.email')}</FieldLabel>
          <TextInput dir="ltr" value={referee.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <FieldLabel>{t('settings.refs.phone')}</FieldLabel>
          <TextInput dir="ltr" value={referee.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3">
        <div className="min-w-0">
          <FieldLabel>{t('settings.refs.address')}</FieldLabel>
          <TextInput dir="auto" value={referee.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <label className="flex min-h-8 max-w-[150px] cursor-pointer items-center gap-2 text-[11.5px] leading-tight font-medium">
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
        ? referenceDocFor({
            job: app,
            title: state.title,
            referees: state.referees,
            profile,
            language,
            paper: settings?.paper
          })
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
      <PageHeader page="reference" actions={<span className="label-mono me-2">{t('docs.savedOnDevice')}</span>} />
      {/* Both tracks can shrink, so the form keeps room for its fields at the 1180px minimum window. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,460px)] items-start gap-3">
        <section className="min-w-0 rounded-card border-ui border-strong bg-surface px-3.5 py-3">
          <div className="label-mono">{t('refs.kicker')}</div>
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-x-2.5">
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
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-x-2.5">
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
              className="min-w-0"
            >
              <option value="">{t('refs.suggest')}</option>
              {titles.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="mt-3 flex flex-col gap-2">
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
              <p className="rounded-card border-ui border-dashed border-soft px-3 py-3 text-center text-[12.5px] text-muted">
                {t('refs.none')}{' '}
                <Link to="/settings" className="font-semibold text-ink underline">
                  {t('refs.toSettings')}
                </Link>
              </p>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
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
          <p className="mt-3 text-[11.5px] text-muted">{state.custom ? t('refs.customNote') : t('refs.defaultsNote')}</p>
        </section>

        <section className="sticky top-4 min-w-0 rounded-card border-ui border-strong bg-purple px-3.5 py-3 text-paper-ink">
          <div className="flex items-center justify-between">
            <span className="label-mono !text-[#4a4560]">{t('docs.preview')}</span>
            <span className="label-mono !text-[#4a4560]">{settings?.paper ?? 'A4'}</span>
          </div>
          <div className="mt-2 max-h-[66vh] overflow-auto border-ui border-paper-ink bg-white">
            {doc && <DocPreview doc={doc} paper={settings?.paper} />}
          </div>
          <p className="mt-2 text-[12px]">{t('docs.savedToFiles')}</p>
          <div className="mt-2 flex gap-2">
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
            <p className="mt-2 text-[12px]">
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
