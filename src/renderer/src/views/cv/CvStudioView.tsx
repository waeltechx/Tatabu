import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, ExternalLink, FolderOpen, LoaderCircle, Plus, ShieldCheck, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { PROVIDER_NAMES, textProvider, type ProviderId } from '@shared/ai'
import { languageCode } from '@shared/docs/common'
import { atsCvDoc } from '@shared/docs/cv'
import type { MasterCv } from '@shared/cv'
import {
  allItems,
  applyChoices,
  cvLabels,
  describeSource,
  resolveCv,
  type CvChange,
  type CvTailorState,
  type TailoredCv,
  type TItem
} from '@shared/tailor'
import { EMPTY_PROFILE } from '@shared/profile'
import type { DocLanguage } from '@shared/settings'
import { invoke, useAiErrorToast, useErrorToast, useLanguages, useSettings } from '@/lib/api'
import { appKeys } from '@/lib/apps'
import { docKeys, useProfile } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { DocPreview } from '@/components/docs/DocPreview'
import { AppPicker, NoApplications, useChosenApp } from '@/components/docs/AppPicker'
import { FactWarnings, showField, type WarningGroup } from '@/components/docs/FactWarnings'

const areaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-[11px] py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

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

/** Small drawing of each look, as in the mockup. */
function LookThumb({ side }: { side?: boolean }) {
  return (
    <div className="flex h-[74px] gap-1.5 overflow-hidden rounded-[4px] border border-[#cfccc3] bg-white p-2">
      {side && <div className="w-[26%] rounded-[2px] bg-[#28406b]" />}
      <div className="flex flex-1 flex-col gap-1.5">
        <i className={clsx('block h-[5px] w-[60%] rounded-full', side ? 'bg-[#28406b]' : 'bg-[#202329]')} />
        {[100, 80, 100, 70, 100].map((w, i) => (
          <i key={i} className="block h-[3px] rounded-full bg-[#d9d6cd]" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

/** One change card: what it was, what it is now, where it came from, and its on/off switch. */
function ChangeCard({
  change,
  master,
  on,
  onToggle
}: {
  change: CvChange
  master: MasterCv | null
  on: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const src = [...new Set(change.sources.map((k) => (master ? describeSource(master, k) : k)))]
    .map((s) => t(`cvStudio.src.${s}`, { defaultValue: s }))
    .join(' + ')
  const leftOut = change.kind === 'left_out'
  return (
    <div
      className={clsx('rounded-card border-ui px-3.5 py-3', on ? 'border-strong bg-field' : 'border-soft bg-surface opacity-75')}
    >
      <div className="flex items-start justify-between gap-2">
        <b className="text-[12.5px] font-semibold">{t(`cvStudio.chg.${change.kind}.${change.target}`)}</b>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={!change.revertible}
          title={change.revertible ? (on ? t('cvStudio.reject') : t('cvStudio.accept')) : t('cvStudio.cantUndo')}
          aria-label={on ? t('cvStudio.reject') : t('cvStudio.accept')}
          onClick={onToggle}
          className={clsx(
            'flex size-6 shrink-0 items-center justify-center rounded-[6px] border-ui',
            on ? 'border-strong bg-green text-paper-ink' : 'border-soft bg-surface',
            change.revertible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          )}
        >
          {on && <Check size={14} strokeWidth={3} />}
        </button>
      </div>
      {leftOut ? (
        <p className="mt-1.5 text-[12px] text-muted" dir="auto">
          {change.old}
        </p>
      ) : (
        <>
          {change.old && (
            <p className="mt-1.5 text-[12px] text-muted line-through decoration-1" dir="auto">
              {change.old}
            </p>
          )}
          <p className="mt-1 text-[12px]" dir="auto">
            {change.new}
          </p>
        </>
      )}
      {src && !leftOut && change.kind !== 'reordered' && <div className="label-mono mt-2">{t('cvStudio.from', { src })}</div>}
      {leftOut && <div className="label-mono mt-2">{on ? t('cvStudio.leftOutOn') : t('cvStudio.leftOutOff')}</div>}
    </div>
  )
}

/** Every line of the tailored CV as a field the user can change. */
function CvEditor({
  cv,
  original,
  edits,
  dir,
  onEdit
}: {
  cv: TailoredCv
  original: Map<string, string>
  edits: Record<string, string>
  dir: 'ltr' | 'rtl'
  onEdit: (id: string, text: string | null) => void
}) {
  const { t } = useTranslation()
  const field = (it: TItem, rows = 2) => (
    <textarea
      key={it.id}
      data-fact={it.id}
      dir={dir}
      rows={rows}
      value={edits[it.id] ?? it.text}
      onChange={(e) => onEdit(it.id, e.target.value === original.get(it.id) ? null : e.target.value)}
      className={clsx(areaClass, typeof edits[it.id] === 'string' && '!border-strong')}
    />
  )
  const group = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-2">
      <div className="label-mono mt-3">{title}</div>
      {children}
    </div>
  )
  return (
    <div className="flex flex-col gap-1">
      {group(t('cvStudio.fields.headline'), field(cv.headline, 1))}
      {group(t('cvStudio.fields.summary'), field(cv.summary, 4))}
      {cv.experience.map((r) =>
        group(`${t('cvStudio.fields.role')} · ${r.title.text}`, [field(r.title, 1), ...r.bullets.map((b) => field(b))])
      )}
      {cv.education.length > 0 &&
        group(
          t('cvStudio.fields.education'),
          cv.education.flatMap((e) => [field(e.degree, 1), ...e.details.map((d) => field(d))])
        )}
      {cv.skills.length > 0 &&
        group(t('cvStudio.fields.skills'), <div className="grid grid-cols-2 gap-2">{cv.skills.map((s) => field(s, 1))}</div>)}
      {cv.languages.length > 0 &&
        group(
          t('cvStudio.fields.languages'),
          cv.languages.map((l) => field(l, 1))
        )}
      {[...cv.certificates, ...cv.projects].length > 0 &&
        group(
          t('cvStudio.fields.entries'),
          [...cv.certificates, ...cv.projects].flatMap((c) => [field(c.name, 1), ...(c.detail.text ? [field(c.detail)] : [])])
        )}
      {cv.other.map((s) => group(s.title.text, [field(s.title, 1), ...s.lines.map((l) => field(l))]))}
    </div>
  )
}

export function CvStudioView() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const onAiError = useAiErrorToast()
  const { app, apps, setApp, isPending } = useChosenApp()
  const { data: languages = [] } = useLanguages()
  const { data: settings } = useSettings()
  const { data: profile = EMPTY_PROFILE } = useProfile()
  const { data: masterState } = useQuery({ queryKey: docKeys.master, queryFn: () => invoke('cv:get'), staleTime: 0 })
  const master = masterState?.cv ?? null

  const [active, setActive] = useState('')
  const [drafts, setDrafts] = useState<Record<string, CvTailorState>>({})
  const [tab, setTab] = useState<'preview' | 'changes' | 'edit'>('preview')
  const [busy, setBusy] = useState<'' | 'tailor' | 'print'>('')
  const [fixing, setFixing] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [lastFile, setLastFile] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = useRef<Set<string>>(new Set())

  // A new application: start from the language of its posting.
  useEffect(() => {
    if (!app || !languages.length) return
    const match = languages.find((l) => languageCode(l) === app.language) ?? languages[0]!
    setActive(match.id)
    setDrafts({})
    dirty.current = new Set()
    setLastFile(null)
    setTab('preview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, languages.length])

  useEffect(() => {
    if (!app || !active || drafts[active]) return
    invoke('cvs:get', app.id, active)
      .then((s) => setDrafts((d) => ({ ...d, [active]: d[active] ?? s })))
      .catch(onError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, active])

  // Save choices and edits a moment after they stop; the answer carries fresh warnings.
  useEffect(() => {
    if (!app || !dirty.current.size) return
    setSaving(true)
    const timer = window.setTimeout(() => {
      const ids = [...dirty.current]
      dirty.current.clear()
      Promise.all(
        ids.map(async (id) => {
          const s = drafts[id]
          if (!s) return
          const saved = await invoke('cvs:save', app.id, s)
          setDrafts((d) => (d[id] ? { ...d, [id]: { ...d[id]!, warnings: saved.warnings } } : d))
        })
      )
        .catch(onError)
        .finally(() => setSaving(false))
    }, 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  const draft = drafts[active]
  const language = languages.find((l) => l.id === active)
  const meta = langMeta(language)
  const labels = useMemo(() => cvLabels(meta.code, draft?.labels), [meta.code, draft?.labels])

  // What the page shows: the AI's CV with the user's choices and edits.
  const shown = useMemo(
    () => (master && draft?.tailored ? applyChoices(master, draft.tailored, draft.changes, draft.rejected, draft.edits) : null),
    [master, draft?.tailored, draft?.changes, draft?.rejected, draft?.edits]
  )
  const original = useMemo(() => {
    const plain = master && draft?.tailored ? applyChoices(master, draft.tailored, draft.changes, draft.rejected, {}) : null
    return new Map(plain ? allItems(plain).map((i) => [i.id, i.text]) : [])
  }, [master, draft?.tailored, draft?.changes, draft?.rejected])

  const doc = useMemo(() => {
    if (!master) return null
    if (!shown || !draft) {
      return atsCvDoc({
        cv: { ...master },
        profile,
        labels: cvLabels(meta.code),
        lang: meta.code,
        dir: meta.dir,
        paper: settings?.paper
      })
    }
    const { cv, keys } = resolveCv(master, shown, labels, meta.code)
    // Highlight lines whose change is on: rewritten and reworded text.
    const marks = new Set<string>()
    for (const c of draft.changes) {
      if (draft.rejected.includes(c.id)) continue
      if (c.id === 'summary' && keys.s) marks.add(keys.s)
      if (c.id === 'headline' && keys.h) marks.add(keys.h)
      if (c.id.startsWith('word:')) {
        const k = keys[c.id.slice(5)]
        if (k) marks.add(k)
      }
    }
    return atsCvDoc({ cv, profile, labels, lang: meta.code, dir: meta.dir, paper: settings?.paper, marks })
  }, [master, shown, draft, labels, meta.code, meta.dir, profile, settings?.paper])

  if (!isPending && apps.length === 0) {
    return (
      <>
        <PageHeader page="cvStudio" />
        <NoApplications />
      </>
    )
  }
  if (!app) return <PageHeader page="cvStudio" />

  const edit = (patch: Partial<CvTailorState>): void => {
    if (!active) return
    dirty.current.add(active)
    setDrafts((d) => (d[active] ? { ...d, [active]: { ...d[active]!, ...patch } } : d))
  }
  const replace = (s: CvTailorState): void => {
    dirty.current.delete(s.language)
    setDrafts((d) => ({ ...d, [s.language]: s }))
  }

  const provider = settings ? textProvider(settings) : 'groq'
  const model = settings?.checks[provider]?.model
  const hasMaster = !!master
  const changes = draft?.changes ?? []

  async function tailor(provider?: ProviderId): Promise<void> {
    if (!app || !draft) return
    setBusy('tailor')
    try {
      replace(await invoke('cvs:tailor', app.id, draft, provider))
      setTab('preview')
      toast.success(t('cvStudio.tailored'))
    } catch (err) {
      onAiError(err, { retry: () => void tailor(), tryWith: (p) => void tailor(p) })
    } finally {
      setBusy('')
    }
  }

  async function print(): Promise<void> {
    if (!app || !draft) return
    setBusy('print')
    try {
      const saved = await invoke('cvs:print', app.id, draft)
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

  async function fix(group: WarningGroup, provider?: ProviderId): Promise<void> {
    if (!app || !draft) return
    setFixing(group.itemId)
    try {
      replace(await invoke('cvs:fix', app.id, draft, group.itemId, provider))
      toast.success(t('facts.fixed'))
    } catch (err) {
      onAiError(err, { retry: () => void fix(group), tryWith: (p) => void fix(group, p) })
    } finally {
      setFixing(null)
    }
  }

  function showMe(group: WarningGroup): void {
    if (tab === 'edit') {
      showField(`[data-fact="${CSS.escape(group.itemId)}"]`, group.warnings[0]?.token)
      return
    }
    setTab('preview')
    setHighlight(null)
    window.setTimeout(() => setHighlight(group.text), 0)
  }

  function toggle(c: CvChange): void {
    if (!draft || !c.revertible) return
    const off = draft.rejected.includes(c.id)
    edit({ rejected: off ? draft.rejected.filter((x) => x !== c.id) : [...draft.rejected, c.id] })
  }

  // Warnings about text the user has since changed disappear right away.
  const current = new Map(shown ? allItems(shown).map((i) => [i.id, i.text]) : [])
  const warnings = (draft?.warnings ?? []).filter(
    (w) => current.get(w.itemId) === w.text && typeof draft?.edits[w.itemId] !== 'string'
  )
  const onCount = changes.filter((c) => !draft?.rejected.includes(c.id)).length

  return (
    <>
      <PageHeader page="cvStudio" actions={<span className="label-mono me-4 self-end pb-2">{t('docs.savedOnDevice')}</span>} />
      <div className="grid grid-cols-[minmax(0,330px)_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-5">
          <Panel kicker={t('cvStudio.kicker1')}>
            <FieldLabel>{t('docs.application')}</FieldLabel>
            <AppPicker value={app.id} apps={apps} onChange={setApp} />
            <FieldLabel>{t('cvStudio.language')}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={active === l.id}
                  onClick={() => {
                    setActive(l.id)
                    setHighlight(null)
                  }}
                  className={clsx(
                    'h-9 cursor-pointer rounded-card border-ui px-3 text-[12.5px]',
                    active === l.id ? 'border-strong bg-yellow font-semibold text-on-accent' : 'border-soft bg-field font-medium'
                  )}
                >
                  {l.name}
                </button>
              ))}
              <Link
                to="/settings"
                title={t('cvStudio.addLanguage')}
                aria-label={t('cvStudio.addLanguage')}
                className="flex h-9 w-9 items-center justify-center rounded-card border-ui border-soft bg-field text-muted hover:text-ink"
              >
                <Plus size={15} />
              </Link>
            </div>
          </Panel>

          <Panel kicker={t('cvStudio.kicker2')}>
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={draft?.look !== 'mine'}
                onClick={() => edit({ look: 'ats' })}
                className={clsx(
                  'cursor-pointer rounded-card border-ui p-2.5 text-start',
                  draft?.look !== 'mine' ? 'border-strong bg-yellow text-on-accent shadow-hard' : 'border-soft bg-field'
                )}
              >
                <LookThumb />
                <b className="mt-2 block text-[12.5px] font-semibold">{t('cvStudio.ats')}</b>
                <span className="mt-0.5 block text-[11px] leading-snug opacity-80">{t('cvStudio.atsSub')}</span>
              </button>
              <div
                className="cursor-not-allowed rounded-card border-ui border-soft bg-field p-2.5 text-start opacity-70"
                aria-disabled
              >
                <LookThumb side />
                <b className="mt-2 block text-[12.5px] font-semibold">{t('cvStudio.mine')}</b>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t('cvStudio.mineSoon')}</span>
              </div>
            </div>
          </Panel>

          {hasMaster ? (
            <section className="rounded-card border-ui border-paper-ink bg-green px-5 py-4 text-paper-ink">
              <div className="flex items-center gap-2 font-head text-[16px] font-bold">
                <ShieldCheck size={18} />
                {t('letter.grounded')}
              </div>
              <p className="mt-1.5 text-[12.5px]">{t('cvStudio.groundedSub')}</p>
            </section>
          ) : (
            <section className="rounded-card border-ui border-paper-ink bg-yellow px-5 py-4 text-paper-ink">
              <div className="flex items-center gap-2 font-head text-[16px] font-bold">
                <TriangleAlert size={18} />
                {t('letter.noMaster')}
              </div>
              <p className="mt-1.5 text-[12.5px]">{t('cvStudio.noMasterSub')}</p>
              <Link to="/cv/master" className="mt-2 inline-block text-[12.5px] font-semibold text-paper-ink underline">
                {t('profile.openMaster')}
              </Link>
            </section>
          )}

          <section className="rounded-card border-ui border-strong bg-purple px-5 py-5 text-paper-ink">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="cv-focus" className="text-[12px] font-semibold">
                {t('cvStudio.focus')} <span className="font-normal opacity-70">{t('cvStudio.optional')}</span>
              </label>
              <MicButton
                className="h-9 !border-paper-ink !bg-[#fffdf9] !text-paper-ink"
                onText={(spoken) => {
                  const cur = draft?.highlight ?? ''
                  edit({ highlight: cur.trim() ? `${cur.trimEnd()} ${spoken}` : spoken })
                }}
              />
            </div>
            <textarea
              id="cv-focus"
              dir="auto"
              rows={2}
              value={draft?.highlight ?? ''}
              placeholder={t('cvStudio.focusPlaceholder')}
              onChange={(e) => edit({ highlight: e.target.value })}
              className="mt-2.5 w-full resize-y rounded-card border-ui border-paper-ink bg-[#fffdf9] px-3 py-2 text-[12.5px] text-paper-ink outline-none placeholder:text-[#6b6680]"
            />
            <p className="mt-1.5 text-[11px] opacity-75">{t('cvStudio.focusHint')}</p>
            <div className="mt-3 text-[11.5px] opacity-80">
              {t('letter.model')}: {PROVIDER_NAMES[provider]}
              {model ? ` · ${model}` : ''}
            </div>
            <Button
              variant="primary"
              className="mt-3 w-full justify-between"
              disabled={!!busy || !hasMaster || !draft}
              onClick={() => void tailor()}
            >
              <span>{busy === 'tailor' ? t('cvStudio.tailoring') : t('cvStudio.tailor')}</span>
              {busy === 'tailor' ? <LoaderCircle className="animate-spin" /> : <span aria-hidden>→</span>}
            </Button>
          </section>
        </div>

        <section className="rounded-card border-ui border-strong bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b-[1.5px] border-soft px-5 py-3.5">
            {(['preview', 'changes', 'edit'] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={k !== 'preview' && !shown}
                onClick={() => {
                  setTab(k)
                  setHighlight(null)
                }}
                className={clsx(
                  'flex h-8 items-center gap-2 rounded-[6px] px-3 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50',
                  tab === k ? 'bg-ink font-semibold text-surface' : 'cursor-pointer font-medium text-muted hover:text-ink'
                )}
              >
                {t(`cvStudio.tabs.${k}`)}
                {k === 'changes' && changes.length > 0 && (
                  <span
                    className={clsx(
                      'rounded-full px-1.5 text-[10.5px] font-bold',
                      tab === k ? 'bg-yellow text-on-accent' : 'bg-field'
                    )}
                  >
                    {onCount}
                  </span>
                )}
              </button>
            ))}
            <span className="label-mono ms-auto">
              {!draft?.generatedAt ? t('cvStudio.fromMaster') : saving ? t('cvStudio.saving') : t('cvStudio.draftSaved')}
            </span>
          </div>

          <div className="px-5 py-5">
            {!draft || !masterState ? (
              <div className="flex h-60 items-center justify-center text-muted">
                <LoaderCircle className="animate-spin" />
              </div>
            ) : !master ? (
              <p className="py-16 text-center text-[13px] text-muted">{t('cvStudio.noMasterSub')}</p>
            ) : tab === 'preview' ? (
              <>
                {!shown && <p className="mb-3 text-[12.5px] text-muted">{t('cvStudio.previewHint')}</p>}
                <div className="max-h-[74vh] overflow-auto border-ui border-strong bg-white">
                  {doc && <DocPreview doc={doc} paper={settings?.paper} highlight={highlight} />}
                </div>
              </>
            ) : tab === 'changes' ? (
              <div className="flex flex-col gap-2.5">
                {changes.length === 0 && <p className="text-[12.5px] text-muted">{t('cvStudio.noChanges')}</p>}
                {draft.sourceLanguage && draft.sourceLanguage !== meta.code && (
                  <p className="text-[12px] text-muted">{t('cvStudio.translatedNote')}</p>
                )}
                {changes.map((c) => (
                  <ChangeCard
                    key={c.id}
                    change={c}
                    master={master}
                    on={!draft.rejected.includes(c.id)}
                    onToggle={() => toggle(c)}
                  />
                ))}
                {draft.missing.length > 0 && (
                  <div className="rounded-card border-ui border-paper-ink bg-pink px-3.5 py-3 text-paper-ink">
                    <b className="text-[12.5px] font-semibold">{t('cvStudio.missing')}</b>
                    <p className="mt-1.5 text-[12px]" dir="auto">
                      {draft.missing.join(meta.dir === 'rtl' ? '، ' : ', ')}
                    </p>
                    <p className="mt-1.5 text-[11.5px]">{t('cvStudio.missingSub')}</p>
                  </div>
                )}
              </div>
            ) : (
              shown && (
                <CvEditor
                  cv={shown}
                  original={original}
                  edits={draft.edits}
                  dir={meta.dir}
                  onEdit={(id, text) => {
                    const edits = { ...draft.edits }
                    if (text === null) delete edits[id]
                    else edits[id] = text
                    edit({ edits })
                  }}
                />
              )
            )}

            {draft?.generatedAt && master && (
              <div className="mt-4">
                <FactWarnings
                  warnings={warnings}
                  busyItem={fixing}
                  onShow={showMe}
                  onFix={(g) => void fix(g)}
                  onKeep={(g) => {
                    if (!app) return
                    invoke('cvs:keep', app.id, draft, g.itemId).then(replace).catch(onError)
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t-[1.5px] border-soft px-5 py-3.5">
            <Button
              variant="ghost"
              disabled={!changes.some((c) => c.revertible) && !Object.keys(draft?.edits ?? {}).length}
              onClick={() => {
                if (!draft || !window.confirm(t('cvStudio.undoConfirm'))) return
                edit({ rejected: changes.filter((c) => c.revertible).map((c) => c.id), edits: {} })
              }}
            >
              {t('cvStudio.undoAll')}
            </Button>
            <div className="ms-auto flex flex-wrap gap-3">
              <Button onClick={() => invoke('apps:openFolder', app.id).catch(onError)}>
                <FolderOpen />
                {t('cvStudio.openFolder')}
              </Button>
              {lastFile && (
                <Button onClick={() => invoke('files:open', lastFile).catch(onError)}>
                  <ExternalLink />
                  {t('docs.openPdf')}
                </Button>
              )}
              <Button variant="primary" disabled={!!busy || !shown} onClick={() => void print()}>
                {busy === 'print' ? <LoaderCircle className="animate-spin" /> : <Download />}
                {t('cvStudio.savePdf')}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
