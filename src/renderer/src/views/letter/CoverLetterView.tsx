import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ClipboardCopy,
  Download,
  ExternalLink,
  LoaderCircle,
  PenLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { providerName, textProvider, type ProviderId } from '@shared/ai'
import { languageCode } from '@shared/docs/common'
import { letterDoc } from '@shared/docs/letter'
import { LTR_LAYOUTS, RTL_LAYOUTS, wordCount, type LetterLayout, type LetterState } from '@shared/letter'
import { EMPTY_PROFILE, type Profile } from '@shared/profile'
import type { DocLanguage } from '@shared/settings'
import { errorCode, invoke, useAiErrorToast, useErrorToast, useLanguages, useSettings } from '@/lib/api'
import { appKeys } from '@/lib/apps'
import { docKeys, useProfile } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, TextInput } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { DocPreview } from '@/components/docs/DocPreview'
import { AppPicker, NoApplications, SelectField, useChosenApp } from '@/components/docs/AppPicker'
import { FactWarnings, type WarningGroup } from '@/components/docs/FactWarnings'

const areaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

/** "01 / Set the direction" → the step number and the title, so the title can be a real heading. */
function splitKicker(kicker: string): [string, string] {
  const m = /^\s*(\d+)\s*\/\s*(.+)$/.exec(kicker)
  return m ? [m[1]!, m[2]!] : ['', kicker]
}

function Panel({ kicker, children, className }: { kicker?: string; children: React.ReactNode; className?: string }) {
  const [num, title] = splitKicker(kicker ?? '')
  return (
    <section className={cn('rounded-card border-ui border-strong bg-surface p-3', className)}>
      {kicker && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-head text-[15px] leading-snug font-bold">{title}</h2>
          {num && (
            <span className="label-mono shrink-0" aria-hidden>
              {num}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

/** A street address has a number in it or more than one line; "Munich, Germany" does not. */
const hasStreet = (address: string): boolean => /\d/.test(address) || address.trim().includes('\n')

/**
 * The sender block of the letter: name and postal address. They live in the profile,
 * but a letter without them is the first thing people notice, so they can be typed here.
 */
function SenderFields({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const missing = !profile.fullName.trim() || !hasStreet(profile.address)
  // Stays open once typed in, so the fields don't vanish while the address is being written.
  const [touched, setTouched] = useState(false)
  const [name, setName] = useState(profile.fullName)
  const [address, setAddress] = useState(profile.address)
  useEffect(() => {
    setName(profile.fullName)
    setAddress(profile.address)
  }, [profile.fullName, profile.address])
  const save = (patch: Partial<Profile>): void => {
    invoke('profile:save', patch)
      .then((p) => client.setQueryData(docKeys.profile, p))
      .catch(onError)
  }
  if (!missing && !touched) return null
  return (
    <div
      className={cn(
        'mt-3 rounded-card border-ui px-3 py-2.5',
        missing ? 'border-paper-ink bg-yellow text-paper-ink' : 'border-soft bg-field'
      )}
    >
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        {missing ? <TriangleAlert size={14} className="shrink-0" /> : <Check size={14} className="shrink-0" />}
        {missing ? t('letter.senderMissing') : t('letter.senderDone')}
      </div>
      <p className="mt-0.5 text-[11.5px]">{t('letter.senderSub')}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3">
        <div className="min-w-0">
          <label htmlFor="l-name" className="mb-1 block text-[12px] font-semibold">
            {t('profile.fullName')}
          </label>
          <TextInput
            id="l-name"
            dir="auto"
            value={name}
            onChange={(e) => {
              setTouched(true)
              setName(e.target.value)
            }}
            onBlur={() => name.trim() !== profile.fullName && save({ fullName: name })}
            className="!bg-[#fffdf9] !text-paper-ink"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="l-address" className="mb-1 block text-[12px] font-semibold">
            {t('letter.senderAddress')}
          </label>
          <textarea
            id="l-address"
            dir="auto"
            rows={2}
            value={address}
            placeholder={t('letter.senderAddressPlaceholder')}
            onChange={(e) => {
              setTouched(true)
              setAddress(e.target.value)
            }}
            onBlur={() => address.trim() !== profile.address && save({ address })}
            className={cn(areaClass, '!bg-[#fffdf9] !text-paper-ink')}
          />
        </div>
      </div>
    </div>
  )
}

function langMeta(l: DocLanguage | undefined): { code: string; dir: 'ltr' | 'rtl' } {
  return l ? { code: languageCode(l), dir: l.dir } : { code: 'en', dir: 'ltr' }
}

/** Small page thumbnails of the letter in each layout of its direction. */
function LayoutPicker({
  state,
  language,
  onPick
}: {
  state: LetterState
  language: DocLanguage | undefined
  onPick: (layout: LetterLayout) => void
}) {
  const { t } = useTranslation()
  const { data: profile = EMPTY_PROFILE } = useProfile()
  const { data: settings } = useSettings()
  const meta = langMeta(language)
  const layouts: readonly LetterLayout[] = meta.dir === 'rtl' ? RTL_LAYOUTS : LTR_LAYOUTS
  const body = useDeferredValue(state.body || t('letter.sampleBody'))
  const docs = useMemo(
    () =>
      layouts.map((layout) => ({
        layout,
        doc: letterDoc({
          layout,
          profile: { ...profile, fullName: profile.fullName || t('letter.sampleName') },
          recipient: state.recipient,
          subject: state.subject,
          body,
          enclosures: state.enclosures,
          signature: state.signature,
          date: state.date,
          lang: meta.code,
          dir: meta.dir,
          labels: state.labels,
          paper: settings?.paper
        })
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      layouts,
      profile,
      state.recipient,
      state.subject,
      body,
      state.enclosures,
      state.signature,
      state.date,
      meta.code,
      meta.dir,
      settings?.paper
    ]
  )
  return (
    <div className={cn('grid gap-2', layouts.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {docs.map(({ layout, doc }) => {
        const on = state.layout === layout
        return (
          <button
            key={layout}
            type="button"
            onClick={() => onPick(layout)}
            aria-pressed={on}
            className={cn(
              'min-w-0 cursor-pointer rounded-card border-ui p-1.5 text-start',
              on ? 'border-strong bg-yellow text-on-accent shadow-hard' : 'border-soft bg-field hover:border-strong'
            )}
          >
            {/* The top of the page is enough to tell the layouts apart. */}
            <div className="pointer-events-none max-h-[64px] overflow-hidden border border-[#cfccc3] bg-white">
              <DocPreview doc={doc} paper={settings?.paper} />
            </div>
            <b className="mt-1 block truncate text-[11.5px] font-semibold">{t(`letter.layouts.${layout}`)}</b>
          </button>
        )
      })}
    </div>
  )
}

export function CoverLetterView() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const onAiError = useAiErrorToast()
  const { app, apps, setApp, isPending } = useChosenApp()
  const { data: languages = [] } = useLanguages()
  const { data: settings } = useSettings()
  const { data: profile = EMPTY_PROFILE } = useProfile()
  const { data: master } = useQuery({ queryKey: docKeys.master, queryFn: () => invoke('cv:get'), staleTime: 0 })
  const { data: options = [] } = useQuery({
    queryKey: ['letter-options', app?.id ?? ''],
    queryFn: () => invoke('letter:options', app!.id),
    enabled: !!app,
    staleTime: 0
  })

  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>('')
  const [drafts, setDrafts] = useState<Record<string, LetterState>>({})
  const [busy, setBusy] = useState<'' | 'prepare' | 'write' | 'print'>('')
  const [progress, setProgress] = useState('')
  const [fixing, setFixing] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [lastFile, setLastFile] = useState<string | null>(null)
  const [customEncl, setCustomEncl] = useState('')
  /** Loading a saved letter failed: shown in place of the editor with a Retry, never an endless spinner. */
  const [loadError, setLoadError] = useState<unknown>(null)
  const loaded = useRef<Set<string>>(new Set())
  const dirty = useRef<Set<string>>(new Set())
  const editor = useRef<HTMLTextAreaElement>(null)

  // A new application: start from the language of its posting.
  useEffect(() => {
    if (!app || !languages.length) return
    const match = languages.find((l) => languageCode(l) === app.language) ?? languages[0]!
    setSelected([match.id])
    setActive(match.id)
    setDrafts({})
    setLoadError(null)
    loaded.current = new Set()
    dirty.current = new Set()
    setLastFile(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, languages.length])

  // Load each selected language's saved letter once.
  useEffect(() => {
    if (!app) return
    for (const id of selected) {
      if (loaded.current.has(id)) continue
      loaded.current.add(id)
      invoke('letter:get', app.id, id)
        .then((s) => setDrafts((d) => ({ ...d, [id]: d[id] ?? s })))
        .catch((err: unknown) => {
          loaded.current.delete(id)
          if (!errorCode(err)) console.error(err)
          setLoadError(err)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, selected])

  // Save edits a moment after they stop.
  useEffect(() => {
    if (!app || !dirty.current.size) return
    const timer = window.setTimeout(() => {
      for (const id of [...dirty.current]) {
        const s = drafts[id]
        if (s) invoke('letter:save', app.id, s).catch(onError)
      }
      dirty.current.clear()
    }, 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  const draft = drafts[active]
  const language = languages.find((l) => l.id === active)
  const meta = langMeta(language)
  const doc = useMemo(
    () =>
      draft
        ? letterDoc({
            layout: draft.layout,
            profile,
            recipient: draft.recipient,
            subject: draft.subject,
            body: draft.body,
            enclosures: draft.enclosures,
            signature: draft.signature,
            date: draft.date,
            lang: meta.code,
            dir: meta.dir,
            labels: draft.labels,
            paper: settings?.paper
          })
        : null,
    [draft, profile, meta.code, meta.dir, settings?.paper]
  )

  if (!isPending && apps.length === 0) {
    return (
      <>
        <PageHeader page="coverLetter" />
        <NoApplications />
      </>
    )
  }
  if (!app) return <PageHeader page="coverLetter" />

  const edit = (id: string, patch: Partial<LetterState>): void => {
    dirty.current.add(id)
    setDrafts((d) => (d[id] ? { ...d, [id]: { ...d[id]!, ...patch } } : d))
  }
  const editActive = (patch: Partial<LetterState>): void => edit(active, patch)
  const replace = (s: LetterState): void => {
    dirty.current.delete(s.language)
    setDrafts((d) => ({ ...d, [s.language]: s }))
  }

  const hasMaster = !!master?.cv
  const provider = settings ? textProvider(settings) : 'groq'
  const model = settings?.checks[provider]?.model
  const langName = (id: string): string => languages.find((l) => l.id === id)?.name ?? id
  const motivation = draft?.motivation ?? ''

  function toggleLanguage(id: string): void {
    setSelected((cur) => {
      if (cur.includes(id)) {
        if (cur.length === 1) return cur
        const next = cur.filter((x) => x !== id)
        if (active === id) setActive(next[0]!)
        return next
      }
      setActive(id)
      return [...cur, id]
    })
  }

  async function runForSelected(kind: 'prepare' | 'write', provider?: ProviderId): Promise<void> {
    if (!app) return
    setBusy(kind)
    try {
      for (const [i, id] of selected.entries()) {
        const current = drafts[id] ?? (await invoke('letter:get', app.id, id))
        setProgress(selected.length > 1 ? `${langName(id)} · ${i + 1}/${selected.length}` : '')
        const input = { ...current, motivation }
        const next =
          kind === 'prepare'
            ? await invoke('letter:prepare', app.id, input, provider)
            : await invoke('letter:generate', app.id, input, provider)
        replace(next)
      }
      if (kind === 'write') {
        setMode('edit')
        toast.success(t('letter.written'))
      }
    } catch (err) {
      onAiError(err, { retry: () => void runForSelected(kind), tryWith: (p) => void runForSelected(kind, p) })
    } finally {
      setBusy('')
      setProgress('')
    }
  }

  function showMe(group: WarningGroup): void {
    if (!draft) return
    if (mode === 'preview') {
      setHighlight(null)
      window.setTimeout(() => setHighlight(group.text), 0)
      return
    }
    const el = editor.current
    const i = draft.body.indexOf(group.text)
    if (!el || i < 0) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(i, i + group.text.length)
    // Scroll the textarea so the selected sentence sits near the top.
    const before = draft.body.slice(0, i)
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const charsPerLine = Math.max(20, Math.floor(el.clientWidth / 7))
    const rows = before.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0)
    el.scrollTop = Math.max(0, (rows - 2) * lineHeight)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('fact-flash')
    window.setTimeout(() => el.classList.remove('fact-flash'), 1800)
  }

  async function fix(group: WarningGroup, provider?: ProviderId): Promise<void> {
    if (!app || !draft) return
    setFixing(group.itemId)
    try {
      replace(await invoke('letter:fix', app.id, draft, group.itemId, provider))
      toast.success(t('facts.fixed'))
    } catch (err) {
      onAiError(err, { retry: () => void fix(group), tryWith: (p) => void fix(group, p) })
    } finally {
      setFixing(null)
    }
  }

  async function print(): Promise<void> {
    if (!app || !draft) return
    setBusy('print')
    try {
      const saved = await invoke('letter:print', app.id, draft)
      dirty.current.delete(draft.language)
      client.setQueryData(appKeys.files(app.id), saved.files)
      setLastFile(saved.fileId)
      toast.success(t('docs.savedToFolder', { name: saved.filename }))
    } catch (err) {
      onError(err)
    } finally {
      setBusy('')
    }
  }

  async function copyPrompt(): Promise<void> {
    if (!app || !draft) return
    try {
      await navigator.clipboard.writeText(await invoke('letter:prompt', app.id, { ...draft, motivation }))
      toast.success(t('letter.promptCopied'))
    } catch (err) {
      onError(err)
    }
  }

  // Warnings about sentences the user has since changed disappear.
  const warnings = (draft?.warnings ?? []).filter((w) => draft?.body.includes(w.text))
  const words = wordCount(draft?.body ?? '')

  return (
    <>
      <PageHeader page="coverLetter" />
      <div className="grid grid-cols-[minmax(0,310px)_minmax(0,1fr)] items-start gap-3">
        {/* The settings column stays in view while the letter scrolls; Write sits at its foot. */}
        <div className="sticky top-3 flex max-h-[calc(100vh-4.5rem)] min-w-0 flex-col gap-3 overflow-y-auto">
          <Panel kicker={t('letter.kicker1')}>
            <FieldLabel>{t('docs.application')}</FieldLabel>
            <AppPicker value={app.id} apps={apps} onChange={setApp} />
            <FieldLabel>{t('letter.languages')}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {languages.map((l) => {
                const on = selected.includes(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLanguage(l.id)}
                    className={cn(
                      'flex h-8 cursor-pointer items-center gap-1.5 rounded-card border-ui px-2.5 text-[12.5px]',
                      on ? 'border-strong bg-yellow font-semibold text-on-accent' : 'border-soft bg-field font-medium'
                    )}
                  >
                    {on && <Check size={13} />}
                    {l.name}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted">{t('letter.languagesHint')}</p>
            <Button
              className="mt-2.5 w-full justify-between"
              disabled={!!busy || !hasMaster}
              onClick={() => void runForSelected('prepare')}
            >
              <span>{busy === 'prepare' ? t('letter.preparing') : t('letter.prepare')}</span>
              {busy === 'prepare' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <span aria-hidden className="inline-block rtl:rotate-180">
                  →
                </span>
              )}
            </Button>
            {busy === 'prepare' && progress && <p className="label-mono mt-1.5">{progress}</p>}
          </Panel>

          {/* Without a master CV nothing can be written: one actionable line instead of a card. */}
          {!hasMaster && master !== undefined && (
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border-ui border-paper-ink bg-yellow px-3 py-2 text-[12px] text-paper-ink"
              title={t('letter.noMasterSub')}
            >
              <TriangleAlert size={14} className="shrink-0" />
              <b className="font-semibold">{t('letter.noMaster')}</b>
              <Link to="/cv/master" className="ms-auto font-semibold text-paper-ink underline">
                {t('profile.openMaster')}
              </Link>
            </div>
          )}

          <Panel kicker={t('letter.kicker2')}>
            <div className="mt-2 flex items-center justify-between gap-2">
              <b className="text-[12.5px] font-semibold">{t('letter.why')}</b>
              <MicButton
                className="h-7"
                onText={(spoken) => {
                  const next = motivation.trim() ? `${motivation.trimEnd()} ${spoken}` : spoken
                  for (const id of selected) edit(id, { motivation: next })
                }}
              />
            </div>
            <p className="mt-0.5 text-[11.5px] text-muted">{t('letter.whyHint')}</p>
            <textarea
              dir="auto"
              rows={3}
              value={motivation}
              placeholder={t('letter.whyPlaceholder')}
              onChange={(e) => {
                for (const id of selected) edit(id, { motivation: e.target.value })
              }}
              className={cn(areaClass, 'mt-2')}
            />
            {draft && draft.questions.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="label-mono">{t('letter.questions', { lang: langName(active) })}</div>
                {draft.questions.map((q, i) => (
                  <div key={q}>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <label className="min-w-0 text-[12px] font-semibold" dir="auto">
                        {q}
                      </label>
                      <MicButton
                        className="h-7"
                        onText={(spoken) => {
                          const answers = [...draft.answers]
                          answers[i] = answers[i]?.trim() ? `${answers[i]!.trimEnd()} ${spoken}` : spoken
                          editActive({ answers })
                        }}
                      />
                    </div>
                    <textarea
                      dir="auto"
                      rows={2}
                      value={draft.answers[i] ?? ''}
                      onChange={(e) => {
                        const answers = [...draft.answers]
                        answers[i] = e.target.value
                        editActive({ answers })
                      }}
                      className={areaClass}
                    />
                  </div>
                ))}
                <p className="text-[11px] text-muted">{t('letter.answersHint')}</p>
              </div>
            )}
          </Panel>

          <section className="sticky bottom-0 rounded-card border-ui border-strong bg-purple p-3 text-paper-ink">
            <div
              className="flex min-w-0 items-center gap-1.5 text-[11.5px]"
              title={hasMaster ? `${t('letter.grounded')}: ${t('letter.groundedSub')}` : undefined}
            >
              {hasMaster && <ShieldCheck size={13} className="shrink-0" aria-hidden />}
              <span className="truncate">
                <span className="font-semibold">{t('letter.model')}:</span> {providerName(provider, settings?.ai)}
                {model ? ` · ${model}` : ''}
              </span>
            </div>
            <Button
              variant="primary"
              className="mt-2 w-full justify-between"
              disabled={!!busy || !hasMaster}
              onClick={() => void runForSelected('write')}
            >
              <span>{busy === 'write' ? t('letter.writing') : t('letter.write')}</span>
              {busy === 'write' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <span aria-hidden className="inline-block rtl:rotate-180">
                  →
                </span>
              )}
            </Button>
            {busy === 'write' && progress && <p className="label-mono mt-1.5 !text-[#4a4560]">{progress}</p>}
          </section>
        </div>

        <section className="min-w-0 rounded-card border-ui border-strong bg-surface p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={cn(
                  'h-8 min-w-[80px] cursor-pointer rounded-card border-ui px-2.5 text-[12.5px]',
                  active === id ? 'border-strong bg-yellow font-semibold text-on-accent' : 'border-soft bg-field font-medium'
                )}
              >
                {langName(id)}
              </button>
            ))}
            <div className="ms-auto flex rounded-card border-ui border-soft p-0.5">
              {(['edit', 'preview'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setHighlight(null)
                  }}
                  className={cn(
                    'h-7 cursor-pointer rounded-[5px] px-2.5 text-[12px] font-medium',
                    mode === m ? 'bg-ink text-surface' : 'text-muted hover:text-ink'
                  )}
                >
                  {t(`letter.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {!draft && loadError ? (
            <div role="alert" className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
              <TriangleAlert size={18} className="text-muted" />
              <p className="max-w-[360px] text-[12.5px] text-muted">
                {errorCode(loadError) ? t(`errors.${errorCode(loadError)!}`) : t('errors.generic')}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setLoadError(null)
                  setSelected((cur) => [...cur])
                }}
              >
                <RotateCcw />
                {t('common.retry')}
              </Button>
            </div>
          ) : !draft ? (
            <div className="flex h-60 items-center justify-center text-muted">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : (
            <>
              <FieldLabel>{t('letter.layout')}</FieldLabel>
              <LayoutPicker state={draft} language={language} onPick={(layout) => editActive({ layout })} />

              <SenderFields profile={profile} />

              <div className="grid grid-cols-2 gap-x-3">
                <div className="min-w-0">
                  <FieldLabel htmlFor="l-subject">{t('letter.subject')}</FieldLabel>
                  <div className="flex gap-2">
                    <TextInput
                      id="l-subject"
                      dir="auto"
                      value={draft.subject}
                      placeholder={t('letter.subjectPlaceholder')}
                      onChange={(e) => editActive({ subject: e.target.value })}
                    />
                    {draft.subjects.length > 0 && (
                      <SelectField
                        label={t('letter.subjectOptions')}
                        value=""
                        onChange={(v) => v && editActive({ subject: v })}
                        className="w-[46px] shrink-0"
                      >
                        <option value="">{t('letter.subjectOptions')}</option>
                        {draft.subjects.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <FieldLabel htmlFor="l-recipient">{t('letter.recipient')}</FieldLabel>
                  <textarea
                    id="l-recipient"
                    dir="auto"
                    rows={3}
                    value={draft.recipient}
                    onChange={(e) => editActive({ recipient: e.target.value })}
                    className={areaClass}
                  />
                </div>
              </div>

              <div className="mt-3 mb-1.5 flex items-center justify-between">
                <span className="label-mono">{t('letter.editKicker')}</span>
                <span className="label-mono">{t('letter.words', { count: words })}</span>
              </div>
              {mode === 'edit' ? (
                <textarea
                  ref={editor}
                  dir={meta.dir}
                  rows={18}
                  value={draft.body}
                  placeholder={hasMaster ? t('letter.bodyPlaceholder') : t('letter.noMasterSub')}
                  onChange={(e) => editActive({ body: e.target.value })}
                  className={cn(areaClass, 'min-h-[360px] !text-[13.5px] !leading-[1.7]')}
                />
              ) : (
                <div className="max-h-[70vh] overflow-auto border-ui border-strong bg-white">
                  {doc && <DocPreview doc={doc} paper={settings?.paper} highlight={highlight} />}
                </div>
              )}

              {draft.generatedAt && (
                <div className="mt-3">
                  <FactWarnings
                    warnings={warnings}
                    busyItem={fixing}
                    onShow={showMe}
                    onFix={(g) => void fix(g)}
                    onKeep={(g) => {
                      if (!app) return
                      invoke('letter:keep', app.id, draft, g.itemId).then(replace).catch(onError)
                    }}
                  />
                </div>
              )}

              <FieldLabel>{t('letter.enclosures')}</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5 rounded-card border-ui border-soft bg-field px-2.5 py-1.5">
                {[...new Set([...options.map((o) => o.label), ...draft.enclosures])].map((label) => {
                  const on = draft.enclosures.includes(label)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        editActive({
                          enclosures: on ? draft.enclosures.filter((e) => e !== label) : [...draft.enclosures, label]
                        })
                      }
                      className={cn(
                        'flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border-ui px-2 text-[12px]',
                        on ? 'border-strong bg-surface font-semibold' : 'border-transparent text-muted hover:text-ink'
                      )}
                      dir="auto"
                    >
                      {on ? <Check size={13} /> : <Plus size={13} />}
                      {label}
                      {on && !options.some((o) => o.label === label) && <X size={12} />}
                    </button>
                  )
                })}
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const label = customEncl.trim()
                    if (label && !draft.enclosures.includes(label)) editActive({ enclosures: [...draft.enclosures, label] })
                    setCustomEncl('')
                  }}
                >
                  <input
                    value={customEncl}
                    onChange={(e) => setCustomEncl(e.target.value)}
                    placeholder={t('letter.addEnclosure')}
                    className="h-7 w-[140px] min-w-0 bg-transparent px-1 text-[12px] outline-none placeholder:text-muted"
                    dir="auto"
                  />
                </form>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="label-mono">
                  {t(`letter.layouts.${draft.layout}`)} · {t('letter.savesToApp')}
                </span>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium">
                  <input
                    type="checkbox"
                    checked={draft.signature}
                    onChange={(e) => editActive({ signature: e.target.checked })}
                  />
                  <PenLine size={14} />
                  {profile.signature ? t('letter.signature') : t('letter.noSignature')}
                </label>
              </div>
              {/* Sticks to the bottom of the window while the card is taller than it, so Save as PDF stays in reach. */}
              <div className="sticky bottom-0 -mx-3 mt-3 -mb-3 flex flex-wrap items-center gap-2 rounded-b-card border-t-[1.5px] border-soft bg-surface px-3 py-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('letter.clearConfirm')))
                      editActive({ body: '', items: [], warnings: [], generatedAt: '', subject: draft.subject })
                  }}
                >
                  {t('letter.clear')}
                </Button>
                <div className="ms-auto flex flex-wrap gap-2">
                  <Button disabled={!hasMaster} onClick={() => void copyPrompt()}>
                    <ClipboardCopy />
                    {t('letter.copyPrompt')}
                  </Button>
                  {lastFile && (
                    <Button onClick={() => invoke('files:open', lastFile).catch(onError)}>
                      <ExternalLink />
                      {t('docs.openPdf')}
                    </Button>
                  )}
                  <Button variant="primary" disabled={!!busy || !draft.body.trim()} onClick={() => void print()}>
                    {busy === 'print' ? <LoaderCircle className="animate-spin" /> : <Download />}
                    {t('letter.savePdf')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}
