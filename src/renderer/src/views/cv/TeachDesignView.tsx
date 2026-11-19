import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileUp, LoaderCircle, RotateCcw, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import type { ProviderId } from '@shared/ai'
import { looseText } from '@shared/clone/bind'
import { cloneBlocks } from '@shared/clone/build'
import { cloneHtml } from '@shared/clone/render'
import { cleanCv, type MasterCv } from '@shared/cv'
import {
  DESIGN_IMAGE_WIDTH,
  designDoc,
  MAX_DESIGN_ROUNDS,
  type DesignDraft,
  type DesignSource,
  type DesignState
} from '@shared/design'
import { cvLabels } from '@shared/tailor'
import { invoke, errorCode, useAiErrorToast, useErrorToast, useSettings } from '@/lib/api'
import { docKeys, useProfile } from '@/lib/docs'
import { extractPdfLayout } from '@/lib/pdfLayout'
import { cropImage, renderPdfPages } from '@/lib/pdfPages'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { DocPreview } from '@/components/docs/DocPreview'

export const designKey = ['design'] as const

type Phase = '' | 'drawing' | 'reading' | 'fixing'

/** Placeholder text for the recreation when there is no master CV yet. */
function sampleCv(name: string): MasterCv {
  return cleanCv({
    name: name || 'Alex Morgan',
    headline: 'Product Designer',
    contact: { email: 'alex@example.com', phone: '+1 555 0100', location: 'Toronto', links: [] },
    summary: 'Designer with seven years of experience shaping clear, friendly products.',
    experience: [
      {
        title: 'Senior Product Designer',
        organization: 'Northwind',
        start: '2021',
        end: 'Present',
        bullets: ['Led the redesign of the checkout flow.', 'Built the shared design system.']
      },
      { title: 'Designer', organization: 'Blue Harbor', start: '2017', end: '2021', bullets: ['Designed the mobile app.'] }
    ],
    education: [{ degree: 'B.A. Design', institution: 'City University', start: '2013', end: '2017' }],
    skills: ['Figma', 'Prototyping', 'User research'],
    languages: [{ name: 'English', level: 'Native' }],
    language: 'en'
  })
}

function Steps({ step, round, exact }: { step: 1 | 2 | 3 | 4; round: number; exact: boolean }) {
  const { t } = useTranslation()
  const items = [
    t('teach.st1'),
    t('teach.st2'),
    exact ? t('teach.st3Exact') : t('teach.st3', { round, max: MAX_DESIGN_ROUNDS }),
    t('teach.st4')
  ]
  return (
    <ol className="mb-3 flex flex-wrap gap-1.5">
      {items.map((label, i) => {
        const n = i + 1
        const done = n < step
        const now = n === step
        return (
          <li
            key={label}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-card border-ui px-2.5 text-[12.5px]',
              done && 'border-strong bg-green font-semibold text-paper-ink',
              now && 'border-strong bg-yellow font-semibold text-on-accent shadow-hard',
              !done && !now && 'border-soft bg-surface text-muted'
            )}
          >
            {done ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <span className="font-mono text-[11px]">{String(n).padStart(2, '0')}</span>
            )}
            {label}
          </li>
        )
      })}
    </ol>
  )
}

export function TeachDesignView() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const navigate = useNavigate()
  const onError = useErrorToast()
  const onAiError = useAiErrorToast()
  const { data: settings } = useSettings()
  const { data: profile } = useProfile()
  const { data: state } = useQuery({ queryKey: designKey, queryFn: () => invoke('design:get'), staleTime: 0 })
  const { data: masterState } = useQuery({ queryKey: docKeys.master, queryFn: () => invoke('cv:get'), staleTime: 0 })
  const [phase, setPhase] = useState<Phase>('')
  const [feedback, setFeedback] = useState('')
  const [noVision, setNoVision] = useState(false)
  /** The file of this visit, kept so "let the AI redraw it" needs no second upload. */
  const lastSource = useRef<DesignSource | null>(null)

  const master = masterState?.cv ?? null
  const draft = state?.draft ?? null
  const saved = state?.saved ?? null
  /** Measured from the PDF itself: an exact copy, no AI and no rounds. */
  const exact = !!draft?.layout
  const set = (s: DesignState): void => {
    client.setQueryData(designKey, s)
  }

  const cv = useMemo(() => master ?? sampleCv(profile?.fullName ?? ''), [master, profile?.fullName])
  const doc = useMemo(() => {
    if (!draft) return null
    // The copy is shown with the PDF's own words, so the two pages can be compared line by line.
    if (draft.layout) return cloneHtml(draft.layout, { title: draft.sourceName, lang: 'en', dir: 'ltr' })
    const code = cv.language || 'en'
    return designDoc({
      template: draft,
      cv,
      labels: cvLabels(code),
      photo: draft.photo,
      lang: code,
      dir: code === 'ar' ? 'rtl' : 'ltr',
      paper: settings?.paper
    })
  }, [draft, cv, settings?.paper])

  const facts = useMemo(() => {
    const layout = draft?.layout
    if (!layout) return null
    return {
      pages: layout.pages,
      fonts: layout.fonts.slice(0, 2).join(', '),
      photo: layout.graphics.some((g) => g.img),
      lines: cloneBlocks(layout).filter((b) => b.kind === 'row').length,
      // Long passages of the file that the master CV does not contain: they can't be tailored.
      loose: master ? looseText(layout, master).length : 0
    }
  }, [draft?.layout, master])

  async function start(source: DesignSource | null, opts: { provider?: ProviderId; ai?: boolean } = {}): Promise<void> {
    if (!source) return
    lastSource.current = source
    setNoVision(false)
    try {
      setPhase('drawing')
      const pages = await renderPdfPages(source.data, 2, DESIGN_IMAGE_WIDTH)
      const layout = opts.ai ? null : await extractPdfLayout(source.data).catch(() => null)
      setPhase('reading')
      let next = await invoke('design:read', { filename: source.filename, pages, layout, ai: opts.ai }, opts.provider)
      const box = next.draft?.layout ? null : next.draft?.photoBox
      if (box && pages[0]) {
        const photo = await cropImage(pages[0], box).catch(() => '')
        if (photo) next = await invoke('design:photo', photo)
      }
      set(next)
      setFeedback('')
      setPhase('')
    } catch (err) {
      setPhase('')
      if (errorCode(err) === 'AI_NO_VISION') setNoVision(true)
      else if (errorCode(err)?.startsWith('AI_'))
        onAiError(err, {
          retry: () => void start(source, { ai: opts.ai }),
          tryWith: (p) => void start(source, { ai: opts.ai, provider: p })
        })
      else onError(err && errorCode(err) ? err : new Error('PDF_FAILED'))
    }
  }

  async function fix(provider?: ProviderId): Promise<void> {
    if (!feedback.trim()) return
    setPhase('fixing')
    try {
      set(await invoke('design:fix', feedback, provider))
      setFeedback('')
      toast.success(t('teach.fixed'))
    } catch (err) {
      if (errorCode(err) === 'AI_NO_VISION') setNoVision(true)
      else onAiError(err, { retry: () => void fix(), tryWith: (p) => void fix(p) })
    } finally {
      setPhase('')
    }
  }

  async function pickFile(): Promise<void> {
    try {
      await start(await invoke('design:pick'))
    } catch (err) {
      onError(err)
    }
  }

  async function useMasterPdf(): Promise<void> {
    try {
      const source = await invoke('design:masterPdf')
      if (!source) {
        toast.error(t('teach.noMasterPdf'))
        return
      }
      await start(source)
    } catch (err) {
      onError(err)
    }
  }

  const busy = phase !== ''
  const step: 1 | 2 | 3 | 4 = phase === 'drawing' || phase === 'reading' ? 2 : draft ? 3 : 1
  const roundsLeft = draft ? MAX_DESIGN_ROUNDS - draft.round : MAX_DESIGN_ROUNDS

  const visionCard = noVision && (
    <section className="mb-3 rounded-card border-ui border-paper-ink bg-yellow px-3 py-2.5 text-paper-ink">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <TriangleAlert size={15} className="shrink-0" />
        {t('teach.noVision')}
      </div>
      <p className="mt-1 text-[12px]">{t('teach.noVisionSub')}</p>
      <Link to="/settings" className="mt-1 inline-block text-[12px] font-semibold text-paper-ink underline">
        {t('teach.toSettings')}
      </Link>
    </section>
  )

  return (
    <>
      <PageHeader page="teach" back="/cv" />
      <Steps step={step} round={draft?.round ?? 1} exact={exact || !draft} />
      {visionCard}

      {!draft || phase === 'drawing' || phase === 'reading' ? (
        <div className={cn('grid items-start gap-3', saved ? 'grid-cols-[minmax(0,1fr)_minmax(0,320px)]' : 'grid-cols-1')}>
          <section className="min-w-0 rounded-card border-ui border-strong bg-surface p-5">
            <div className="label-mono">{t('teach.kicker')}</div>
            <h2 className="mt-1.5 font-head text-[20px] leading-tight font-bold">{t('teach.uploadTitle')}</h2>
            <p className="mt-1.5 max-w-[620px] text-[12.5px] text-muted">{t('teach.uploadSub')}</p>
            {busy ? (
              <div className="mt-4 flex items-center gap-2.5 text-[12.5px] font-medium">
                <LoaderCircle className="animate-spin" size={16} />
                {phase === 'drawing' ? t('teach.drawing') : phase === 'reading' ? t('teach.reading') : t('teach.fixing')}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void pickFile()}>
                  <FileUp />
                  {t('teach.upload')}
                </Button>
                {masterState?.source && /\.pdf$/i.test(masterState.source.filename) && (
                  <Button onClick={() => void useMasterPdf()}>
                    {t('teach.useMaster', { name: masterState.source.filename })}
                  </Button>
                )}
              </div>
            )}
            {!saved && (
              <details className="mt-4 text-[12px] text-muted">
                <summary className="cursor-pointer font-semibold hover:text-ink">{t('teach.howKicker')}</summary>
                <ul className="mt-1.5 flex flex-col gap-1 ps-4">
                  <li>{t('teach.how1')}</li>
                  <li>{t('teach.how2')}</li>
                  <li>{t('teach.how3')}</li>
                </ul>
              </details>
            )}
          </section>

          {saved && (
            <SavedCard
              saved={saved}
              onRecheck={() => invoke('design:recheck').then(set).catch(onError)}
              onRemove={() => {
                if (window.confirm(t('teach.removeConfirm'))) invoke('design:remove').then(set).catch(onError)
              }}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,270px)] items-start gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <b className="text-[13px]">{t('teach.original')}</b>
              <span className="label-mono truncate">{draft.sourceName}</span>
            </div>
            <div className="flex max-h-[76vh] flex-col gap-3 overflow-auto border-ui border-strong bg-white">
              {draft.pages.map((src, i) => (
                <img key={i} src={src} alt={t('teach.pageAlt', { n: i + 1 })} className="block w-full" />
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <b className="text-[13px]">{exact ? t('teach.copy') : t('teach.recreation')}</b>
              <span className="rounded-full border-ui border-paper-ink bg-yellow px-2 text-[10.5px] font-semibold text-paper-ink">
                {exact ? t('teach.exactBadge') : t('teach.yourText')}
              </span>
            </div>
            <div className="max-h-[76vh] overflow-auto border-ui border-strong bg-white">
              {doc && <DocPreview doc={doc} paper={settings?.paper} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.differences.map((d) => (
                <span key={d} className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-surface" dir="auto">
                  {d}
                </span>
              ))}
              {(draft.photo || facts?.photo) && (
                <span className="rounded-full border-ui border-paper-ink bg-blue px-2 py-0.5 text-[11px] font-medium text-paper-ink">
                  {t('teach.photoKept')}
                </span>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {exact && facts ? (
              <>
                <section className="rounded-card border-ui border-paper-ink bg-green p-3 text-paper-ink">
                  <div className="label-mono !text-[#3c5a3a]">{t('teach.exactKicker')}</div>
                  <p className="mt-1.5 text-[12px]">{t('teach.exactSub')}</p>
                  <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
                    {[
                      t('teach.exactPages', { count: facts.pages }),
                      facts.fonts && t('teach.exactFonts', { fonts: facts.fonts }),
                      t('teach.exactLines', { count: facts.lines }),
                      facts.photo && t('teach.exactPhoto')
                    ]
                      .filter((x): x is string => !!x)
                      .map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <Check size={14} strokeWidth={3} className="mt-0.5 shrink-0" />
                          <span dir="auto">{line}</span>
                        </li>
                      ))}
                  </ul>
                </section>
                {facts.loose > 0 && (
                  <section className="rounded-card border-ui border-paper-ink bg-yellow p-3 text-paper-ink">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      <TriangleAlert size={15} className="shrink-0" />
                      {t('teach.looseTitle')}
                    </div>
                    <p className="mt-1 text-[12px]">{t('teach.looseSub')}</p>
                    <Link to="/cv/master" className="mt-1 inline-block text-[12px] font-semibold text-paper-ink underline">
                      {t('teach.looseAction')}
                    </Link>
                  </section>
                )}
                {!master && <p className="text-[12px] text-muted">{t('teach.exactNoMaster')}</p>}
              </>
            ) : (
              <>
                <section className="rounded-card border-ui border-strong bg-surface p-3">
                  <div className="label-mono">{t('teach.diffKicker')}</div>
                  <p className="mt-1.5 text-[12px] text-muted">{t('teach.diffSub')}</p>
                  <textarea
                    dir="auto"
                    rows={4}
                    value={feedback}
                    disabled={roundsLeft <= 0}
                    placeholder={t('teach.diffPlaceholder')}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="mt-2 w-full resize-y rounded-card border-ui border-soft bg-field px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-strong disabled:opacity-60"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 text-[11.5px] text-muted">
                      {roundsLeft > 0 ? t('teach.roundsLeft', { count: roundsLeft }) : t('teach.noRounds')}
                    </span>
                    <div className="flex gap-2">
                      <MicButton
                        disabled={roundsLeft <= 0}
                        onText={(spoken) => setFeedback((f) => (f.trim() ? `${f.trimEnd()} ${spoken}` : spoken))}
                      />
                      <Button disabled={busy || roundsLeft <= 0 || !feedback.trim()} onClick={() => void fix()}>
                        {phase === 'fixing' ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
                        {t('teach.fix')}
                      </Button>
                    </div>
                  </div>
                </section>
                {draft.found.length > 0 && (
                  <section className="rounded-card border-ui border-paper-ink bg-green p-3 text-paper-ink">
                    <div className="label-mono !text-[#3c5a3a]">{t('teach.found')}</div>
                    <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
                      {draft.found.map((f) => (
                        <li key={f} className="flex items-start gap-2" dir="auto">
                          <Check size={14} strokeWidth={3} className="mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!master && <p className="text-[12px] text-muted">{t('teach.sampleNote')}</p>}
              </>
            )}
            <Button
              variant="primary"
              className="w-full justify-between"
              disabled={busy}
              onClick={() =>
                invoke('design:save')
                  .then((s) => {
                    set(s)
                    toast.success(t('teach.saved'))
                    navigate('/cv')
                  })
                  .catch(onError)
              }
            >
              <span>{t('teach.save')}</span>
              <span aria-hidden className="inline-block rtl:rotate-180">
                →
              </span>
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                invoke('design:discard')
                  .then((s) => {
                    set(s)
                    navigate('/cv')
                  })
                  .catch(onError)
              }
            >
              {saved ? t('teach.keepOld') : t('teach.useAts')}
            </Button>
            {exact && lastSource.current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void start(lastSource.current, { ai: true })}
                className="cursor-pointer text-start text-[11.5px] text-muted underline hover:text-ink disabled:opacity-60"
              >
                {t('teach.aiInstead')}
              </button>
            )}
            <p className="label-mono leading-relaxed">{t('teach.note')}</p>
          </div>
        </div>
      )}
    </>
  )
}

function SavedCard({ saved, onRecheck, onRemove }: { saved: DesignDraft; onRecheck: () => void; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="min-w-0 rounded-card border-ui border-paper-ink bg-green p-3 text-paper-ink">
      <div className="label-mono !text-[#3c5a3a]">{t('teach.savedKicker')}</div>
      <p className="mt-1.5 truncate text-[13px] font-semibold" dir="auto">
        {saved.sourceName || t('teach.mine')}
      </p>
      {saved.pages[0] && <img src={saved.pages[0]} alt="" className="mt-2 max-h-[160px] border border-paper-ink bg-white" />}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onRecheck}>
          <RotateCcw />
          {t('teach.recheck')}
        </Button>
        <Button variant="ghost" onClick={onRemove}>
          <Trash2 />
          {t('teach.remove')}
        </Button>
      </div>
    </section>
  )
}
