import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
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
      'flex size-8 items-center justify-center rounded-[6px] border-ui border-strong font-mono text-[12px]',
      step === n ? 'bg-yellow text-on-accent' : n < step ? 'bg-green text-paper-ink' : 'bg-surface'
    )
  return (
    <div className="mb-6 flex h-[62px] items-center gap-4 rounded-card border-ui border-strong bg-surface px-4">
      <span className={box(1)} dir="ltr">
        {step > 1 ? <Check size={15} /> : '01'}
      </span>
      <b className="text-[14px] font-semibold">{t('add.step1')}</b>
      <span className="mx-2 h-px w-28 bg-soft" />
      <span className={box(2)} dir="ltr">
        02
      </span>
      <span className={clsx('text-[14px]', step === 2 ? 'font-semibold' : 'text-muted')}>{t('add.step2')}</span>
      <span className="label-mono ms-auto">{t('add.inControl')}</span>
    </div>
  )
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('rounded-card border-ui border-strong bg-surface px-6 py-6', className)}>{children}</section>
}

const textareaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-4 py-3 text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

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
        className={clsx(inputClass, 'cursor-pointer appearance-none pe-9')}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute end-[11px] top-1/2 -translate-y-1/2 text-muted" />
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
        ...files.filter((f) => !list.some((a) => a.filename === f.filename)).map((f) => ({ ...f, type: guessType(f.filename) }))
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
    if (fields.language && !list.some((l) => l.id === fields.language)) list.push({ id: fields.language, name: fields.language })
    return list
  }, [languages, fields.language])

  const Arrow = prefs.language === 'ar' ? ArrowLeft : ArrowRight
  const Back = prefs.language === 'ar' ? ArrowRight : ArrowLeft
  const canSave = !!(fields.company.trim() || fields.jobTitle.trim()) && !save.isPending

  return (
    <>
      <PageHeader
        page={step === 1 ? 'addPaste' : 'addReview'}
        actions={
          <span className="me-6 self-end pb-1 font-mono text-[14px] tracking-wide" dir="ltr">
            {step === 1 ? '01' : '02'} &nbsp;/&nbsp; 02
          </span>
        }
      />
      <Stepper step={step} />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,344px)] items-start gap-6">
        {step === 1 ? (
          <Panel>
            <h2 className="font-head text-[24px] font-bold">{t('add.pasteTitle')}</h2>
            <p className="mt-1 text-[14px] text-muted">{t('add.pasteSub')}</p>

            <FieldLabel htmlFor="add-link" className="!mt-6">
              {t('add.link')} · <span className="font-medium">{t('common.optional')}</span>
            </FieldLabel>
            <TextInput
              id="add-link"
              dir="ltr"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              className="text-[13px]"
            />

            <div className="mt-6 mb-2 flex items-center justify-between">
              <label htmlFor="add-text" className="text-[12px] font-semibold">
                {t('add.pageText')}
              </label>
              <span className="flex items-center gap-3">
                <span className="label-mono">{t('add.words', { count: countWords(text) })}</span>
                <MicButton
                  onText={(spoken) => setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n${spoken}` : spoken))}
                  className="h-9"
                />
              </span>
            </div>
            <textarea
              id="add-text"
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('add.pagePlaceholder')}
              rows={11}
              className={clsx(textareaClass, 'min-h-[240px]')}
            />

            {duplicate && <DuplicateBanner match={duplicate} onDismiss={() => setDismissed((d) => [...d, duplicate.id])} />}

            <p className="mt-4 text-[12px] text-muted">{t('add.onlyText')}</p>
            <div className="mt-4 flex items-center gap-3">
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
                {!extract.isPending && <Arrow />}
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel>
            <h2 className="font-head text-[24px] font-bold">{t('add.reviewTitle')}</h2>
            <div className="label-mono mt-1.5">
              {meta ? t('add.extractedWith', { provider: meta.provider, seconds: meta.seconds }) : t('add.byHandNote')}
            </div>

            {duplicate && <DuplicateBanner match={duplicate} onDismiss={() => setDismissed((d) => [...d, duplicate.id])} />}

            <div className="mt-2 grid grid-cols-2 gap-x-6">
              {(
                [
                  ['company', 'apps.company'],
                  ['jobTitle', 'apps.role'],
                  ['location', 'apps.location']
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <FieldLabel htmlFor={`f-${key}`}>{t(label)}</FieldLabel>
                  <TextInput id={`f-${key}`} dir="auto" value={fields[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
              <div>
                <FieldLabel>{t('apps.workMode')}</FieldLabel>
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
              <div>
                <FieldLabel htmlFor="f-deadline">{t('apps.deadline')}</FieldLabel>
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
                <div key={key}>
                  <FieldLabel htmlFor={`f-${key}`}>{t(label)}</FieldLabel>
                  <TextInput id={`f-${key}`} dir="auto" value={fields[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
              <div>
                <FieldLabel>{t('apps.language')}</FieldLabel>
                <SelectBox label={t('apps.language')} value={fields.language} onChange={(v) => set('language', v)}>
                  {languageOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div>
                <FieldLabel>{t('apps.status')}</FieldLabel>
                <SelectBox label={t('apps.status')} value={status} onChange={(v) => setStatus(v as Status)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>

            <FieldLabel className="!mt-6">{t('apps.requirements')}</FieldLabel>
            <RequirementsEditor value={fields.requirements} onChange={(v) => set('requirements', v)} />

            <FieldLabel htmlFor="f-desc" className="!mt-6">
              {t('apps.description')}
            </FieldLabel>
            <textarea
              id="f-desc"
              dir="auto"
              rows={6}
              value={fields.jobDescription}
              onChange={(e) => set('jobDescription', e.target.value)}
              className={textareaClass}
            />

            <div className="mt-6 flex items-center gap-3">
              <Button onClick={() => setStep(1)}>
                <Back />
                {t('common.back')}
              </Button>
              <Button variant="primary" className="ms-auto" disabled={!canSave} onClick={() => save.mutate()}>
                {save.isPending && <LoaderCircle className="animate-spin" />}
                {attachments.length ? t('add.saveWithFiles', { count: attachments.length }) : t('add.save')}
                {!save.isPending && <Arrow />}
              </Button>
            </div>
            {!canSave && !save.isPending && <p className="mt-2 text-end text-[11.5px] text-muted">{t('add.needName')}</p>}
          </Panel>
        )}

        <div className="flex flex-col gap-6">
          {step === 1 ? (
            <>
              <section className="rounded-card border-ui border-strong bg-purple px-6 py-6 text-paper-ink">
                <div className="label-mono !text-[#4a4560]">{t('add.sideKicker')}</div>
                <h3 className="mt-4 font-head text-[27px] leading-[1.2] font-bold whitespace-pre-line">{t('add.sideTitle')}</h3>
                <ol className="mt-7 flex flex-col gap-6">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex gap-4">
                      <span className="font-mono text-[12px]" dir="ltr">
                        0{n}
                      </span>
                      <div>
                        <b className="block text-[14px] font-semibold">{t(`add.side${n}`)}</b>
                        <span className="text-[12px] text-[#4a4560]">{t(`add.side${n}Desc`)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="rounded-card border-ui border-soft bg-surface px-5 py-5">
                <b className="block font-head text-[16px] font-bold">{t('add.localTitle')}</b>
                <p className="mt-2 text-[13px] leading-snug text-muted">{t('add.localDesc')}</p>
              </section>
            </>
          ) : (
            <>
              <section className="rounded-card border-ui border-strong bg-surface px-5 py-6">
                <h3 className="font-head text-[20px] font-bold">{t('add.docsTitle')}</h3>
                <p className="mt-1 text-[12.5px] text-muted">{t('add.docsSub')}</p>
                <button
                  type="button"
                  onClick={() => void pickFiles()}
                  className="mt-5 flex w-full cursor-pointer flex-col items-center gap-2 rounded-card border-ui border-soft bg-field px-4 py-5 hover:border-strong"
                >
                  <b className="flex items-center gap-2 text-[14px] font-semibold">
                    <Upload size={15} />
                    {t('add.attach')}
                  </b>
                  <span className="text-[11.5px] text-muted">{t('add.attachTypes')}</span>
                </button>
                <div className="mt-4 flex flex-col gap-3">
                  {attachments.map((a) => (
                    <div
                      key={a.token}
                      className="flex items-center gap-2 rounded-card border-ui border-soft bg-surface px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium" dir="auto" title={a.filename}>
                          {a.filename}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
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
                        className="flex size-7 cursor-pointer items-center justify-center rounded hover:bg-field"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-card border-ui border-strong bg-green px-5 py-5 text-paper-ink">
                <b className="block font-head text-[16px] font-bold">{t('add.tipTitle')}</b>
                <p className="mt-2 text-[13px] leading-snug">{t('add.tipDesc')}</p>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
