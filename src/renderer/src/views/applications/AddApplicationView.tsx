import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { cn } from '@/lib/cn'
import {
  EMPTY_JOB,
  FILE_TYPES,
  STATUSES,
  WORK_MODES,
  type DuplicateMatch,
  type ExtractResult,
  type FileType,
  type JobFields,
  type PickedFile,
  type Status
} from '@shared/applications'
import type { ProviderId } from '@shared/ai'
import { invoke, useAiErrorToast, useErrorToast, useLanguages } from '@/lib/api'
import { appKeys, countWords, formatSize, useStoreApp } from '@/lib/apps'
import { usePrefs } from '@/lib/prefs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, inputClass, TextInput } from '@/components/ui'
import { MicButton } from '@/components/MicButton'
import { DuplicateBanner } from '@/components/apps/DuplicateBanner'
import { RequirementsEditor } from '@/components/apps/RequirementsEditor'

type Attachment = PickedFile & { type: FileType }

/** Guesses a file's role from its name, so most files need no change. */
function guessType(name: string): FileType {
  const n = name.toLowerCase()
  if (/\bcv\b|resume|lebenslauf|سيرة/.test(n)) return 'cv'
  if (/cover|letter|anschreiben|motivation|رسالة/.test(n)) return 'cover_letter'
  if (/reference|referenz|empfehlung/.test(n)) return 'reference'
  return 'other'
}

/** Checks for duplicates a moment after the inputs stop changing. */
function useDuplicateCheck(query: Parameters<typeof invoke<'apps:checkDuplicate'>>[1] | null): DuplicateMatch[] {
  const [matches, setMatches] = useState<DuplicateMatch[]>([])
  const key = JSON.stringify(query)
  useEffect(() => {
    if (!query) return setMatches([])
    let live = true
    const timer = window.setTimeout(() => {
      void invoke('apps:checkDuplicate', query)
        .then((m) => live && setMatches(m))
        .catch(() => live && setMatches([]))
    }, 450)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return matches
}

function Stepper({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation()
  const box = (n: 1 | 2): string =>
    clsx(
      'flex size-6 shrink-0 items-center justify-center rounded-[5px] border-ui border-strong font-mono text-[11px]',
      step === n ? 'bg-yellow text-on-accent' : n < step ? 'bg-green text-paper-ink' : 'bg-surface'
    )
  return (
    <ol className="mb-3 flex h-9 items-center gap-2 rounded-card border-ui border-strong bg-surface px-2.5">
      <li className="flex min-w-0 items-center gap-2" aria-current={step === 1 ? 'step' : undefined}>
        <span className={box(1)} dir="ltr">
          {step > 1 ? <Check size={13} /> : '01'}
        </span>
        <b className="truncate text-[12.5px] font-semibold">{t('add.step1')}</b>
      </li>
      <li aria-hidden className="mx-1 h-px w-10 shrink-0 bg-soft" />
      <li className="flex min-w-0 items-center gap-2" aria-current={step === 2 ? 'step' : undefined}>
        <span className={box(2)} dir="ltr">
          02
        </span>
        <span className={clsx('truncate text-[12.5px]', step === 2 ? 'font-semibold' : 'text-muted')}>{t('add.step2')}</span>
      </li>
      <li className="label-mono ms-auto shrink-0">{t('add.inControl')}</li>
    </ol>
  )
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border-ui border-strong bg-surface px-4 py-3.5', className)}>{children}</section>
  )
}

const textareaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

/** Field labels in the step 2 grid sit a little tighter than the default. */
const fieldLabel = 'mt-2.5 mb-1'

function SelectBox({
  value,
  onChange,
  children,
  label
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  label: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, 'cursor-pointer appearance-none pe-8')}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function AddApplicationView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const storeApp = useStoreApp()
  const onError = useErrorToast()
  const onAiError = useAiErrorToast()
  const { prefs } = usePrefs()
  const { data: languages = [] } = useLanguages()

  const [step, setStep] = useState<1 | 2>(1)
  const [link, setLink] = useState('')
  const [text, setText] = useState('')
  const [fields, setFields] = useState<JobFields>(EMPTY_JOB)
  const [status, setStatus] = useState<Status>('saved')
  const [meta, setMeta] = useState<ExtractResult | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])

  const before = useDuplicateCheck(step === 1 && (link.trim() || text.trim()) ? { link, text } : null)
  const after = useDuplicateCheck(
    step === 2 && (fields.company || fields.jobTitle)
      ? { link, text, company: fields.company, jobTitle: fields.jobTitle, location: fields.location }
      : null
  )
  const duplicate = (step === 1 ? before : after).find((m) => !dismissed.includes(m.id)) ?? null

  const extract = useMutation({
    mutationFn: (provider?: ProviderId) => invoke('apps:extract', text, link, provider),
    onSuccess: (result) => {
      setFields({ ...result.fields, language: result.fields.language || prefs.language })
      setMeta(result)
      setStep(2)
    },
    onError: (err, provider) => onAiError(err, { retry: () => extract.mutate(provider), tryWith: (p) => extract.mutate(p) })
  })

  const save = useMutation({
    mutationFn: () =>
      invoke(
        'apps:create',
        { ...fields, applicationLink: link.trim(), status, rawText: text },
        attachments.map((a) => ({ token: a.token, type: a.type }))
      ),
    onSuccess: (app) => {
      storeApp(app)
      void client.invalidateQueries({ queryKey: appKeys.setup })
      toast.success(t('add.saved'))
      navigate(`/applications/${app.id}`, { replace: true })
    },
    onError
  })

  const set = <K extends keyof JobFields>(key: K, value: JobFields[K]): void => setFields((f) => ({ ...f, [key]: value }))

  async function pickFiles(): Promise<void> {
    try {
      const files = await invoke('files:pick')
      setAttachments((list) => [
        ...list,
        ...files
          .filter((f) => !list.some((a) => a.filename === f.filename))
          .map((f) => ({ ...f, type: guessType(f.filename) }))
      ])
    } catch (err) {
      onError(err)
    }
  }

  function fillByHand(): void {
    setFields({ ...EMPTY_JOB, jobDescription: text.trim(), language: prefs.language })
    setMeta(null)
    setStep(2)
  }

  const languageOptions = useMemo(() => {
    const list = languages.map((l) => ({ id: l.id, name: l.name }))
    if (fields.language && !list.some((l) => l.id === fields.language))
      list.push({ id: fields.language, name: fields.language })
    return list
  }, [languages, fields.language])

  const canSave = !!(fields.company.trim() || fields.jobTitle.trim()) && !save.isPending

  return (
    <>
      {/* The stepper below is the one step indicator (no "01 / 02" counter in the header). */}
      <PageHeader page={step === 1 ? 'addPaste' : 'addReview'} back="/" />
      <Stepper step={step} />

      {step === 1 ? (
        <Panel>
          <h2 className="font-head text-[15px] leading-snug font-bold">{t('add.pasteTitle')}</h2>
          <p className="text-[12px] text-muted">{t('add.pasteSub')}</p>

          <FieldLabel htmlFor="add-link">
            {t('add.link')} · <span className="font-medium">{t('common.optional')}</span>
          </FieldLabel>
          <TextInput
            id="add-link"
            dir="ltr"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
          />

          <div className="mt-3 mb-1.5 flex items-center justify-between">
            <label htmlFor="add-text" className="text-[12px] font-semibold">
              {t('add.pageText')}
            </label>
            <span className="flex items-center gap-2">
              <span className="label-mono">{t('add.words', { count: countWords(text) })}</span>
              <MicButton
                onText={(spoken) => setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n${spoken}` : spoken))}
                className="h-7"
              />
            </span>
          </div>
          <textarea
            id="add-text"
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('add.pagePlaceholder')}
            rows={8}
            className={cn(textareaClass, 'min-h-[180px]')}
          />

          {duplicate && <DuplicateBanner match={duplicate} onDismiss={() => setDismissed((d) => [...d, duplicate.id])} />}

          {/* Actions sit right under the paste box. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            <Button variant="ghost" onClick={fillByHand}>
              {t('add.byHand')}
            </Button>
            <Button
              variant="primary"
              className="ms-auto"
              disabled={!text.trim() || extract.isPending}
              onClick={() => extract.mutate(undefined)}
            >
              {extract.isPending && <LoaderCircle className="animate-spin" />}
              {extract.isPending ? t('add.extracting') : duplicate ? t('add.extractAnyway') : t('add.extract')}
              {!extract.isPending && <ArrowRight className="rtl:rotate-180" />}
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">{t('add.onlyText')}</p>

          {/* The old 422px "How it works" card, folded into a disclosure. */}
          <details className="group mt-2 border-t border-soft pt-2 text-[12px]">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-card py-0.5 font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
              {t('add.sideKicker')}
            </summary>
            <ol className="mt-1.5 flex flex-col gap-1">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="font-mono text-[11px] text-muted" dir="ltr">
                    0{n}
                  </span>
                  <span>
                    <b className="font-semibold">{t(`add.side${n}`)}</b>
                    <span className="text-muted"> · {t(`add.side${n}Desc`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </Panel>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(240px,300px)] items-start gap-3">
          <Panel className="pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="font-head text-[15px] leading-snug font-bold">{t('add.reviewTitle')}</h2>
              <span className="label-mono">
                {meta ? t('add.extractedWith', { provider: meta.provider, seconds: meta.seconds }) : t('add.byHandNote')}
              </span>
            </div>

            {duplicate && <DuplicateBanner match={duplicate} onDismiss={() => setDismissed((d) => [...d, duplicate.id])} />}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-3">
              {(
                [
                  ['company', 'apps.company'],
                  ['jobTitle', 'apps.role'],
                  ['location', 'apps.location']
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="min-w-0">
                  <FieldLabel htmlFor={`f-${key}`} className={fieldLabel}>
                    {t(label)}
                  </FieldLabel>
                  <TextInput id={`f-${key}`} dir="auto" value={fields[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
              <div className="min-w-0">
                <FieldLabel className={fieldLabel}>{t('apps.workMode')}</FieldLabel>
                <SelectBox
                  label={t('apps.workMode')}
                  value={fields.workMode}
                  onChange={(v) => set('workMode', v as JobFields['workMode'])}
                >
                  {WORK_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`workMode.${m}`)}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="f-deadline" className={fieldLabel}>
                  {t('apps.deadline')}
                </FieldLabel>
                <TextInput
                  id="f-deadline"
                  type="date"
                  value={fields.deadline}
                  onChange={(e) => set('deadline', e.target.value)}
                />
              </div>
              {(
                [
                  ['salary', 'apps.salary'],
                  ['contactPerson', 'apps.contact'],
                  ['companyAddress', 'apps.address']
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="min-w-0">
                  <FieldLabel htmlFor={`f-${key}`} className={fieldLabel}>
                    {t(label)}
                  </FieldLabel>
                  <TextInput id={`f-${key}`} dir="auto" value={fields[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
              <div className="min-w-0">
                <FieldLabel className={fieldLabel}>{t('apps.language')}</FieldLabel>
                <SelectBox label={t('apps.language')} value={fields.language} onChange={(v) => set('language', v)}>
                  {languageOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div className="min-w-0">
                <FieldLabel className={fieldLabel}>{t('apps.status')}</FieldLabel>
                <SelectBox label={t('apps.status')} value={status} onChange={(v) => setStatus(v as Status)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>

            <FieldLabel className="mt-3.5">{t('apps.requirements')}</FieldLabel>
            <RequirementsEditor value={fields.requirements} onChange={(v) => set('requirements', v)} />

            <FieldLabel htmlFor="f-desc" className="mt-3.5 mb-1">
              {t('apps.description')}
            </FieldLabel>
            <textarea
              id="f-desc"
              dir="auto"
              rows={5}
              value={fields.jobDescription}
              onChange={(e) => set('jobDescription', e.target.value)}
              className={textareaClass}
            />

            {/* Sticky action bar: Save stays in view while the form scrolls. */}
            <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex items-center gap-2 rounded-b-card border-t border-soft bg-surface px-4 py-2.5">
              <Button onClick={() => setStep(1)}>
                <ArrowLeft className="rtl:rotate-180" />
                {t('common.back')}
              </Button>
              {!canSave && !save.isPending && (
                <span className="ms-auto min-w-0 truncate text-[11.5px] text-muted">{t('add.needName')}</span>
              )}
              <Button
                variant="primary"
                className={cn('shrink-0', (canSave || save.isPending) && 'ms-auto')}
                disabled={!canSave}
                onClick={() => save.mutate()}
              >
                {save.isPending && <LoaderCircle className="animate-spin" />}
                {attachments.length ? t('add.saveWithFiles', { count: attachments.length }) : t('add.save')}
                {!save.isPending && <ArrowRight className="rtl:rotate-180" />}
              </Button>
            </div>
          </Panel>

          <div className="flex min-w-0 flex-col gap-3">
            <section className="rounded-card border-ui border-strong bg-surface px-3.5 py-3">
              <h3 className="font-head text-[15px] leading-snug font-bold">{t('add.docsTitle')}</h3>
              <p className="text-[12px] text-muted">{t('add.docsSub')}</p>
              <button
                type="button"
                onClick={() => void pickFiles()}
                className="mt-2.5 flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-card border-ui border-dashed border-soft bg-field px-3 py-2.5 hover:border-strong"
              >
                <b className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <Upload size={14} />
                  {t('add.attach')}
                </b>
                <span className="text-[11px] text-muted">{t('add.attachTypes')}</span>
              </button>
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {attachments.map((a) => (
                    <div
                      key={a.token}
                      className="flex items-center gap-2 rounded-card border-ui border-soft bg-surface py-1 ps-2.5 pe-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium" dir="auto" title={a.filename}>
                          {a.filename}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted">
                          <span className="relative">
                            <select
                              value={a.type}
                              aria-label={t('files.type')}
                              onChange={(e) =>
                                setAttachments((list) =>
                                  list.map((x) => (x.token === a.token ? { ...x, type: e.target.value as FileType } : x))
                                )
                              }
                              className="cursor-pointer appearance-none bg-transparent pe-4 text-muted outline-none"
                            >
                              {FILE_TYPES.filter((ft) => ft !== 'combined').map((ft) => (
                                <option key={ft} value={ft}>
                                  {t(`fileType.${ft}`)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={11} className="pointer-events-none absolute end-0 top-1/2 -translate-y-1/2" />
                          </span>
                          <span>· {formatSize(a.size)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachments((list) => list.filter((x) => x.token !== a.token))}
                        aria-label={t('add.removeFile', { name: a.filename })}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-field"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-card border-ui border-strong bg-green px-3.5 py-2.5 text-paper-ink">
              <b className="block text-[13px] font-semibold">{t('add.tipTitle')}</b>
              <p className="mt-0.5 text-[12px] leading-snug">{t('add.tipDesc')}</p>
            </section>
          </div>
        </div>
      )}
    </>
  )
}
