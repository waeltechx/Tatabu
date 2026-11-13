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
  ShieldCheck,
  TriangleAlert,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { PROVIDER_NAMES, textProvider, type ProviderId } from '@shared/ai'
import { languageCode } from '@shared/docs/common'
import { letterDoc } from '@shared/docs/letter'
import { LTR_LAYOUTS, RTL_LAYOUTS, wordCount, type LetterLayout, type LetterState } from '@shared/letter'
import { EMPTY_PROFILE } from '@shared/profile'
import type { DocLanguage } from '@shared/settings'
import { invoke, useAiErrorToast, useErrorToast, useLanguages, useSettings } from '@/lib/api'
import { appKeys } from '@/lib/apps'
import { docKeys, useProfile } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, TextInput } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { DocPreview } from '@/components/docs/DocPreview'
import { AppPicker, NoApplications, SelectField, useChosenApp } from '@/components/docs/AppPicker'
import { FactWarnings, type WarningGroup } from '@/components/docs/FactWarnings'

const areaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-[11px] py-2.5 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

function Panel({ kicker, children, className }: { kicker?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-card border-ui border-strong bg-surface px-5 py-5', className)}>
      {kicker && <div className="label-mono">{kicker}</div>}
      {children}
    </section>
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
    <div className={clsx('grid gap-3', layouts.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {docs.map(({ layout, doc }) => {
        const on = state.layout === layout
        return (
          <button
            key={layout}
            type="button"
            onClick={() => onPick(layout)}
            aria-pressed={on}
            className={clsx(
              'cursor-pointer rounded-card border-ui p-2 text-start',
              on ? 'border-strong bg-yellow text-on-accent shadow-hard' : 'border-soft bg-field hover:border-strong'
            )}
          >
            <div className="pointer-events-none max-h-[118px] overflow-hidden border border-[#cfccc3] bg-white">
              <DocPreview doc={doc} paper={settings?.paper} />
            </div>
            <b className="mt-2 block text-[11.5px] font-semibold">{t(`letter.layouts.${layout}`)}</b>
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
        .catch(onError)
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
      <PageHeader page="coverLetter" actions={<span className="label-mono me-4 self-end pb-2">{t('docs.savedOnDevice')}</span>} />
      <div className="grid grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-5">
          <Panel kicker={t('letter.kicker1')}>
            <FieldLabel>{t('docs.application')}</FieldLabel>
            <AppPicker value={app.id} apps={apps} onChange={setApp} />
            <FieldLabel>{t('letter.languages')}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => {
                const on = selected.includes(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLanguage(l.id)}
                    className={clsx(
                      'flex h-9 cursor-pointer items-center gap-1.5 rounded-card border-ui px-3 text-[12.5px]',
                      on ? 'border-strong bg-yellow font-semibold text-on-accent' : 'border-soft bg-field font-medium'
                    )}
                  >
                    {on && <Check size={13} />}
                    {l.name}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11.5px] text-muted">{t('letter.languagesHint')}</p>
            <Button
              className="mt-4 w-full justify-between"
              disabled={!!busy || !hasMaster}
              onClick={() => void runForSelected('prepare')}
            >
              <span>{busy === 'prepare' ? t('letter.preparing') : t('letter.prepare')}</span>
              {busy === 'prepare' ? <LoaderCircle className="animate-spin" /> : <span aria-hidden>→</span>}
            </Button>
            {busy === 'prepare' && progress && <p className="label-mono mt-2">{progress}</p>}
          </Panel>

          {hasMaster ? (
            <section className="rounded-card border-ui border-paper-ink bg-green px-5 py-4 text-paper-ink">
              <div className="flex items-center gap-2 font-head text-[16px] font-bold">
                <ShieldCheck size={18} />
                {t('letter.grounded')}
              </div>
              <p className="mt-1.5 text-[12.5px]">{t('letter.groundedSub')}</p>
            </section>
          ) : (
            <section className="rounded-card border-ui border-paper-ink bg-yellow px-5 py-4 text-paper-ink">
              <div className="flex items-center gap-2 font-head text-[16px] font-bold">
                <TriangleAlert size={18} />
                {t('letter.noMaster')}
              </div>
              <p className="mt-1.5 text-[12.5px]">{t('letter.noMasterSub')}</p>
              <Link to="/cv/master" className="mt-2 inline-block text-[12.5px] font-semibold text-paper-ink underline">
                {t('profile.openMaster')}
              </Link>
            </section>
          )}

          <Panel kicker={t('letter.kicker2')}>
            <div className="mt-3 flex items-center justify-between gap-2">
              <b className="text-[14px]">{t('letter.why')}</b>
              <MicButton
                className="h-9"
                onText={(spoken) => {
                  const next = motivation.trim() ? `${motivation.trimEnd()} ${spoken}` : spoken
                  for (const id of selected) edit(id, { motivation: next })
                }}
              />
            </div>
            <p className="mt-1 text-[11.5px] text-muted">{t('letter.whyHint')}</p>
            <textarea
              dir="auto"
              rows={4}
              value={motivation}
              placeholder={t('letter.whyPlaceholder')}
              onChange={(e) => {
                for (const id of selected) edit(id, { motivation: e.target.value })
              }}
              className={clsx(areaClass, 'mt-3')}
            />
            {draft && draft.questions.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="label-mono">{t('letter.questions', { lang: langName(active) })}</div>
                {draft.questions.map((q, i) => (
                  <div key={q}>
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <label className="text-[12px] font-semibold" dir="auto">
                        {q}
                      </label>
                      <MicButton
                        className="h-8"
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

          <section className="rounded-card border-ui border-strong bg-purple px-5 py-5 text-paper-ink">
            <div className="text-[12px] font-semibold">{t('letter.model')}</div>
            <div className="mt-2 rounded-card border-ui border-paper-ink bg-[#fffdf9] px-3 py-2.5 text-[12.5px]">
              {PROVIDER_NAMES[provider]}
              {model ? ` · ${model}` : ''}
            </div>
            <Button
              variant="primary"
              className="mt-4 w-full justify-between"
              disabled={!!busy || !hasMaster}
              onClick={() => void runForSelected('write')}
            >
              <span>{busy === 'write' ? t('letter.writing') : t('letter.write')}</span>
              {busy === 'write' ? <LoaderCircle className="animate-spin" /> : <span aria-hidden>→</span>}
            </Button>
            {busy === 'write' && progress && <p className="label-mono mt-2 !text-[#4a4560]">{progress}</p>}
          </section>
        </div>

        <section className="rounded-card border-ui border-strong bg-surface px-5 py-5">
          <div className="flex flex-wrap items-center gap-2.5">
            {selected.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={clsx(
                  'h-9 min-w-[96px] cursor-pointer rounded-card border-ui px-3 text-[12.5px]',
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
                  className={clsx(
                    'h-8 cursor-pointer rounded-[5px] px-3 text-[12px] font-medium',
                    mode === m ? 'bg-ink text-surface' : 'text-muted hover:text-ink'
                  )}
                >
                  {t(`letter.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {!draft ? (
            <div className="flex h-60 items-center justify-center text-muted">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : (
            <>
              <FieldLabel>{t('letter.layout')}</FieldLabel>
              <LayoutPicker state={draft} language={language} onPick={(layout) => editActive({ layout })} />

              <div className="grid grid-cols-2 gap-x-5">
                <div>
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
                <div>
                  <FieldLabel htmlFor="l-recipient">{t('letter.recipient')}</FieldLabel>
                  <textarea
                    id="l-recipient"
                    dir="auto"
                    rows={4}
                    value={draft.recipient}
                    onChange={(e) => editActive({ recipient: e.target.value })}
                    className={areaClass}
                  />
                </div>
              </div>

              <div className="mt-4 mb-2 flex items-center justify-between">
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
                  className={clsx(areaClass, 'min-h-[360px] !text-[13.5px] !leading-[1.7]')}
                />
              ) : (
                <div className="max-h-[70vh] overflow-auto border-ui border-strong bg-white">
                  {doc && <DocPreview doc={doc} paper={settings?.paper} highlight={highlight} />}
                </div>
              )}

              {draft.generatedAt && (
                <div className="mt-4">
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
              <div className="flex flex-wrap items-center gap-2 rounded-card border-ui border-soft bg-field px-3 py-2.5">
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
                      className={clsx(
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
                    className="h-7 w-[150px] bg-transparent px-1 text-[12px] outline-none placeholder:text-muted"
                    dir="auto"
                  />
                </form>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('letter.clearConfirm')))
                      editActive({ body: '', items: [], warnings: [], generatedAt: '', subject: draft.subject })
                  }}
                >
                  {t('letter.clear')}
                </Button>
                <div className="ms-auto flex flex-wrap gap-3">
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
              {!profile.fullName && (
                <p className="mt-3 text-[12px] text-muted">
                  {t('docs.noProfile')}{' '}
                  <Link to="/profile" className="font-semibold text-ink underline">
                    {t('nav.profile')}
                  </Link>
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
