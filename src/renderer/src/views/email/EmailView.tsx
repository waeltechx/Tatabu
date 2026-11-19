import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { cn } from '@/lib/cn'
import { providerName, textProvider, type ProviderId } from '@shared/ai'
import { STATUSES, type Status } from '@shared/applications'
import { confidenceLevel, type EmailAnalysis } from '@shared/email'
import { invoke, useAiErrorToast, useErrorToast, useSettings } from '@/lib/api'
import { useApps, useStoreApp } from '@/lib/apps'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { NoApplications, SelectField } from '@/components/docs/AppPicker'

function Panel({ kicker, children, className }: { kicker: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-card border-ui border-strong bg-surface px-3.5 py-3', className)}>
      <div className="label-mono">{kicker}</div>
      {children}
    </section>
  )
}

const LEVEL_TONE = { high: 'bg-green', medium: 'bg-yellow', low: 'bg-pink' } as const

function StatusChip({ status, tone }: { status: Status; tone: 'yellow' | 'purple' }) {
  const { t } = useTranslation()
  return (
    <div
      className={clsx(
        'flex h-8 min-w-0 flex-1 items-center justify-center rounded-card border-ui border-paper-ink px-2 text-[12.5px] font-semibold text-paper-ink',
        tone === 'yellow' ? 'bg-yellow' : 'bg-purple'
      )}
    >
      {t(`status.${status}`)}
    </div>
  )
}

export function EmailView() {
  const { t } = useTranslation()
  const { data: apps, isLoading } = useApps()
  const { data: settings } = useSettings()
  const storeApp = useStoreApp()
  const aiError = useAiErrorToast()
  const onError = useErrorToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<EmailAnalysis | null>(null)
  const [appId, setAppId] = useState('')
  const [status, setStatus] = useState<Status>('applied')

  const list = apps ?? []
  const chosen = list.find((a) => a.id === appId)
  const provider = settings ? textProvider(settings) : 'groq'

  const analyze = async (override?: ProviderId): Promise<void> => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const r = await invoke('email:analyze', text, override)
      setResult(r)
      setAppId(r.applicationId ?? '')
      setStatus(r.status)
    } catch (err) {
      aiError(err, { retry: () => void analyze(override), tryWith: (p) => void analyze(p) })
    } finally {
      setBusy(false)
    }
  }

  const discard = (): void => {
    setResult(null)
    setAppId('')
  }

  const confirm = async (): Promise<void> => {
    if (!chosen || chosen.status === status) return
    setSaving(true)
    try {
      const updated = await invoke('apps:update', chosen.id, { status })
      storeApp(updated)
      toast.success(t('email.updated', { name: `${updated.company} · ${updated.jobTitle}`, status: t(`status.${status}`) }))
      setResult(null)
      setAppId('')
      setText('')
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  const level = result ? confidenceLevel(result.confidence) : 'low'
  const pct = result ? Math.round(result.confidence * 100) : 0
  const unsure = !!result && (!result.applicationId || level === 'low')

  return (
    <>
      <PageHeader page="email" />
      {/* Panels size to their content instead of stretching to the taller one. */}
      <div className="grid grid-cols-2 items-start gap-3">
        <Panel kicker={t('email.kicker1')}>
          <h2 className="mt-1 font-head text-[15px] leading-snug font-bold">{t('email.title1')}</h2>
          <p className="mt-0.5 text-[12px] text-muted">{t('email.sub1')}</p>
          <div className="relative mt-2.5">
            <textarea
              value={text}
              dir="auto"
              onChange={(e) => setText(e.target.value)}
              placeholder={t('email.placeholder')}
              aria-label={t('email.title1')}
              className="block min-h-[220px] w-full resize-y rounded-card border-ui border-soft bg-field px-3 py-2.5 pb-12 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong"
            />
            <MicButton
              className="absolute end-2 bottom-2"
              onText={(spoken) => setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n${spoken}` : spoken))}
            />
          </div>
          <div className="label-mono mt-1.5">{t('email.pastedOnly')}</div>
          <Button
            variant="primary"
            className="mt-2.5 w-full justify-start"
            disabled={!text.trim() || busy || !list.length}
            onClick={() => void analyze()}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            {busy ? t('email.analyzing') : t('email.analyze')}
            {!busy && <ArrowRight className="rtl:rotate-180" />}
          </Button>
          <div className="mt-1.5 text-[11.5px] text-muted">
            {t('email.modelLine', { provider: providerName(provider, settings?.ai) })}
          </div>
        </Panel>

        <Panel kicker={t('email.kicker2')}>
          {!isLoading && !list.length ? (
            <div className="mt-2">
              <NoApplications />
            </div>
          ) : !result ? (
            <div className="mt-2 flex flex-col items-center justify-center rounded-card border-ui border-dashed border-soft px-5 py-5 text-center">
              {busy ? <LoaderCircle size={20} className="mb-2 animate-spin text-muted" /> : null}
              <b className="font-head text-[15px] font-bold">{busy ? t('email.reading') : t('email.emptyTitle')}</b>
              <p className="mt-1 max-w-[340px] text-[12.5px] text-muted">{t('email.emptySub')}</p>
            </div>
          ) : (
            <>
              <h2 className="mt-1 font-head text-[15px] leading-snug font-bold">
                {chosen ? t(`email.headline.${status}`) : t('email.noMatch')}
              </h2>

              <FieldLabel>{t('email.matched')}</FieldLabel>
              <SelectField value={appId} onChange={setAppId} label={t('email.matched')}>
                <option value="">{t('email.chooseApp')}</option>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company} · {a.jobTitle}
                  </option>
                ))}
              </SelectField>

              <FieldLabel>{t('email.suggested')}</FieldLabel>
              <SelectField value={status} onChange={(v) => setStatus(v as Status)} label={t('email.suggested')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </SelectField>

              <div className="mt-3 flex items-center justify-between text-[12px]">
                <b>{t('email.confidence')}</b>
                <span className="label-mono">
                  {pct}% · {t(`email.level.${level}`)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full border-ui border-soft bg-field">
                <div className={clsx('h-full rounded-full', LEVEL_TONE[level])} style={{ width: `${Math.max(pct, 3)}%` }} />
              </div>

              {unsure && (
                <div className="mt-2.5 flex gap-2 rounded-card border-ui border-paper-ink bg-pink px-2.5 py-2 text-[12px] text-paper-ink">
                  <TriangleAlert size={14} className="mt-px shrink-0" />
                  {result.applicationId ? t('email.lowConfidence') : t('email.noMatchHint')}
                </div>
              )}

              <div className="mt-2.5 rounded-card border-ui border-soft bg-purple/40 px-3 py-2.5 dark:bg-purple/15">
                <b className="text-[12.5px]">{t('email.why')}</b>
                <p className="mt-1 text-[12.5px] leading-relaxed" dir="auto">
                  {result.reasoning || '—'}
                </p>
                <div className="label-mono mt-1.5">
                  {result.provider} · {result.model}
                </div>
              </div>

              <div className="label-mono mt-3">{t('email.preview')}</div>
              {chosen ? (
                chosen.status === status ? (
                  <div className="mt-1.5 flex h-8 items-center gap-2 rounded-card border-ui border-soft px-2.5 text-[12.5px] text-muted">
                    <Check size={14} className="shrink-0" />
                    {t('email.already', { status: t(`status.${status}`) })}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <StatusChip status={chosen.status} tone="yellow" />
                    <ArrowRight size={16} className="shrink-0 rtl:rotate-180" />
                    <StatusChip status={status} tone="purple" />
                  </div>
                )
              ) : (
                <div className="mt-1.5 flex h-8 items-center rounded-card border-ui border-dashed border-soft px-2.5 text-[12.5px] text-muted">
                  {t('email.pickFirst')}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button className="w-[120px]" onClick={discard}>
                  {t('email.discard')}
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 justify-start"
                  disabled={!chosen || chosen.status === status || saving}
                  onClick={() => void confirm()}
                >
                  {saving ? <LoaderCircle className="animate-spin" /> : null}
                  {t('email.confirm')}
                  <ArrowRight className="rtl:rotate-180" />
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}
