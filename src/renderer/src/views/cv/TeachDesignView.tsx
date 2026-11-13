import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileUp, LoaderCircle, RotateCcw, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import type { ProviderId } from '@shared/ai'
import { cleanCv, type MasterCv } from '@shared/cv'
import { designDoc, MAX_DESIGN_ROUNDS, type DesignDraft, type DesignSource, type DesignState } from '@shared/design'
import { cvLabels } from '@shared/tailor'
import { invoke, errorCode, useAiErrorToast, useErrorToast, useSettings } from '@/lib/api'
import { docKeys, useProfile } from '@/lib/docs'
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

function Steps({ step, round }: { step: 1 | 2 | 3 | 4; round: number }) {
  const { t } = useTranslation()
  const items = [t('teach.st1'), t('teach.st2'), t('teach.st3', { round, max: MAX_DESIGN_ROUNDS }), t('teach.st4')]
  return (
    <ol className="mb-6 flex flex-wrap gap-2.5">
      {items.map((label, i) => {
        const n = i + 1
        const done = n < step
        const now = n === step
        return (
          <li
            key={label}
            className={clsx(
              'flex h-9 items-center gap-2 rounded-card border-ui px-3 text-[12.5px]',
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

  const master = masterState?.cv ?? null
  const draft = state?.draft ?? null
  const saved = state?.saved ?? null
  const set = (s: DesignState): void => {
    client.setQueryData(designKey, s)
  }

  const cv = useMemo(() => master ?? sampleCv(profile?.fullName ?? ''), [master, profile?.fullName])
  const doc = useMemo(() => {
    if (!draft) return null
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

  async function start(source: DesignSource | null, provider?: ProviderId): Promise<void> {
    if (!source) return
    setNoVision(false)
    try {
      setPhase('drawing')
      const pages = await renderPdfPages(source.data, 2)
      setPhase('reading')
      await readPages(source.filename, pages, provider)
    } catch (err) {
      setPhase('')
      if (errorCode(err) === 'AI_NO_VISION') setNoVision(true)
      else if (errorCode(err)?.startsWith('AI_'))
        onAiError(err, { retry: () => void start(source), tryWith: (p) => void start(source, p) })
      else onError(err && errorCode(err) ? err : new Error('PDF_FAILED'))
    }
  }

  async function readPages(filename: string, pages: string[], provider?: ProviderId): Promise<void> {
    let next = await invoke('design:read', { filename, pages }, provider)
    const box = next.draft?.photoBox
    if (box && pages[0]) {
      const photo = await cropImage(pages[0], box).catch(() => '')
      if (photo) next = await invoke('design:photo', photo)
    }
    set(next)
    setFeedback('')
    setPhase('')
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
    <section className="mb-5 rounded-card border-ui border-paper-ink bg-yellow px-5 py-4 text-paper-ink">
      <div className="flex items-center gap-2 font-head text-[16px] font-bold">
        <TriangleAlert size={18} />
        {t('teach.noVision')}
      </div>
      <p className="mt-1.5 text-[12.5px]">{t('teach.noVisionSub')}</p>
      <Link to="/settings" className="mt-2 inline-block text-[12.5px] font-semibold text-paper-ink underline">
        {t('teach.toSettings')}
      </Link>
    </section>
  )

  return (
    <>
      <PageHeader page="teach" />
      <Steps step={step} round={draft?.round ?? 1} />
      {visionCard}

      {!draft || phase === 'drawing' || phase === 'reading' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,360px)] items-start gap-6">
          <section className="rounded-card border-ui border-strong bg-surface px-6 py-6">
            <div className="label-mono">{t('teach.kicker')}</div>
            <h2 className="mt-3 font-head text-[22px] font-bold">{t('teach.uploadTitle')}</h2>
            <p className="mt-2 max-w-[560px] text-[13px] text-muted">{t('teach.uploadSub')}</p>
            {busy ? (
              <div className="mt-6 flex items-center gap-3 text-[13px] font-medium">
                <LoaderCircle className="animate-spin" size={18} />
                {phase === 'drawing' ? t('teach.drawing') : phase === 'reading' ? t('teach.reading') : t('teach.fixing')}
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
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
            {!master && <p className="mt-5 text-[12px] text-muted">{t('teach.sampleNote')}</p>}
          </section>

          {saved ? (
            <SavedCard
              saved={saved}
              onRecheck={() => invoke('design:recheck').then(set).catch(onError)}
              onRemove={() => {
                if (window.confirm(t('teach.removeConfirm'))) invoke('design:remove').then(set).catch(onError)
              }}
            />
          ) : (
            <section className="rounded-card border-ui border-paper-ink bg-purple px-5 py-5 text-paper-ink">
              <div className="label-mono !text-[#4a4560]">{t('teach.howKicker')}</div>
              <ul className="mt-3 flex flex-col gap-2 text-[12.5px]">
                <li>{t('teach.how1')}</li>
                <li>{t('teach.how2')}</li>
                <li>{t('teach.how3')}</li>
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,290px)] items-start gap-5">
          <div className="min-w-0">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <b className="text-[14px]">{t('teach.original')}</b>
              <span className="label-mono truncate">{draft.sourceName}</span>
            </div>
            <div className="flex max-h-[76vh] flex-col gap-3 overflow-auto border-ui border-strong bg-white">
              {draft.pages.map((src, i) => (
                <img key={i} src={src} alt={t('teach.pageAlt', { n: i + 1 })} className="block w-full" />
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <b className="text-[14px]">{t('teach.recreation')}</b>
              <span className="rounded-full border-ui border-paper-ink bg-yellow px-2 text-[10.5px] font-semibold text-paper-ink">
                {t('teach.yourText')}
              </span>
            </div>
            <div className="max-h-[76vh] overflow-auto border-ui border-strong bg-white">
              {doc && <DocPreview doc={doc} paper={settings?.paper} />}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {draft.differences.map((d) => (
                <span key={d} className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-surface" dir="auto">
                  {d}
                </span>
              ))}
              {draft.photo && (
                <span className="rounded-full border-ui border-paper-ink bg-blue px-2.5 py-1 text-[11px] font-medium text-paper-ink">
                  {t('teach.photoKept')}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <section className="rounded-card border-ui border-strong bg-surface px-4 py-4">
              <div className="label-mono">{t('teach.diffKicker')}</div>
              <p className="mt-2 text-[12px] text-muted">{t('teach.diffSub')}</p>
              <textarea
                dir="auto"
                rows={4}
                value={feedback}
                disabled={roundsLeft <= 0}
                placeholder={t('teach.diffPlaceholder')}
                onChange={(e) => setFeedback(e.target.value)}
                className="mt-3 w-full resize-y rounded-card border-ui border-soft bg-field px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-strong disabled:opacity-60"
              />
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-muted">
                  {roundsLeft > 0 ? t('teach.roundsLeft', { count: roundsLeft }) : t('teach.noRounds')}
                </span>
                <div className="flex gap-2">
                  <MicButton
                    className="h-9"
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
              <section className="rounded-card border-ui border-paper-ink bg-green px-4 py-4 text-paper-ink">
                <div className="label-mono !text-[#3c5a3a]">{t('teach.found')}</div>
                <ul className="mt-2.5 flex flex-col gap-1.5 text-[12.5px]">
                  {draft.found.map((f) => (
                    <li key={f} className="flex items-start gap-2" dir="auto">
                      <Check size={14} strokeWidth={3} className="mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
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
              <span aria-hidden>→</span>
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
    <section className="rounded-card border-ui border-paper-ink bg-green px-5 py-5 text-paper-ink">
      <div className="label-mono !text-[#3c5a3a]">{t('teach.savedKicker')}</div>
      <p className="mt-2 text-[13px] font-semibold" dir="auto">
        {saved.sourceName || t('teach.mine')}
      </p>
      {saved.pages[0] && <img src={saved.pages[0]} alt="" className="mt-3 max-h-[220px] border border-paper-ink bg-white" />}
      <div className="mt-4 flex flex-wrap gap-2">
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
