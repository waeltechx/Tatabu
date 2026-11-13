import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import type { ProviderId } from '@shared/ai'
import {
  cleanCv,
  cvFacts,
  EMPTY_CV,
  setCvFact,
  type CvEducation,
  type CvEntry,
  type CvExperience,
  type MasterCv
} from '@shared/cv'
import { invoke, useAiErrorToast, useErrorToast } from '@/lib/api'
import { docKeys } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, TextInput } from '@/components/ui'
import { FactWarnings, problemNotes, showField, type WarningGroup } from '@/components/docs/FactWarnings'

const areaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-[11px] py-2.5 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

/** The form field that holds a fact key (list items live in one textarea per list). */
function selectorFor(key: string): string {
  const list = /^([a-z]+\d+)\.([bdl])\d+$/.exec(key)
  if (list) return `[data-fact="${list[1]}.${list[2]}"]`
  if (/^skills\.\d+$/.test(key)) return '[data-fact="skills"]'
  if (/^languages\.\d+$/.test(key)) return `[data-fact="${key}"]`
  const dates = /^([a-z]+\d+)\.dates$/.exec(key)
  if (dates) return `[data-fact="${dates[1]}.start"]`
  return `[data-fact="${key}"]`
}

const toLines = (v: string): string[] => v.split('\n')
const fromLines = (v: string[]): string => v.join('\n')

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-card border-ui border-strong bg-surface px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-head text-[20px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  fact,
  value,
  onChange,
  dir = 'auto',
  area,
  rows = 3,
  placeholder
}: {
  label: string
  fact?: string
  value: string
  onChange: (v: string) => void
  dir?: 'auto' | 'ltr'
  area?: boolean
  rows?: number
  placeholder?: string
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      {area ? (
        <textarea
          data-fact={fact}
          dir={dir}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={areaClass}
        />
      ) : (
        <TextInput
          data-fact={fact}
          dir={dir}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-field hover:text-ink"
    >
      <Trash2 size={15} />
    </button>
  )
}

/** Start screen: nothing uploaded, or uploaded but not read yet. */
function StartCard({
  busy,
  sourceName,
  onUpload,
  onRead
}: {
  busy: boolean
  sourceName?: string
  onUpload: () => void
  onRead: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto mt-4 max-w-[640px] rounded-card border-ui border-strong bg-surface px-8 py-9 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-card border-ui border-strong bg-yellow text-on-accent shadow-hard">
        {busy ? <LoaderCircle className="animate-spin" /> : <FileText />}
      </div>
      <h2 className="mt-5 font-head text-[24px] font-bold">{busy ? t('master.reading') : t('master.startTitle')}</h2>
      <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed text-muted">
        {busy ? t('master.readingSub') : t('master.startSub')}
      </p>
      {!busy && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {sourceName && (
            <Button variant="primary" onClick={onRead}>
              <Sparkles />
              {t('master.readFile', { name: sourceName })}
            </Button>
          )}
          <Button variant={sourceName ? 'default' : 'primary'} onClick={onUpload}>
            <Upload />
            {sourceName ? t('master.uploadOther') : t('master.upload')}
          </Button>
        </div>
      )}
      <p className="label-mono mt-6">{t('master.formats')}</p>
    </section>
  )
}

export function MasterCvView() {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const onAiError = useAiErrorToast()
  const { data: state } = useQuery({ queryKey: docKeys.master, queryFn: () => invoke('cv:get'), staleTime: 0 })
  const [form, setForm] = useState<MasterCv>(EMPTY_CV)
  const [fixing, setFixing] = useState<string | null>(null)

  useEffect(() => {
    if (state?.cv) setForm(state.cv)
  }, [state?.cv])

  const setState = (s: typeof state): void => {
    client.setQueryData(docKeys.master, s)
  }

  const read = useMutation({
    mutationFn: (provider?: ProviderId) => invoke('cv:read', provider),
    onSuccess: (s) => {
      setState(s)
      if (s.cv) setForm(s.cv)
      toast.success(t('master.readDone'))
    },
    onError: (err) => onAiError(err, { retry: () => read.mutate(undefined), tryWith: (p) => read.mutate(p) })
  })
  const upload = useMutation({
    mutationFn: () => invoke('cv:upload'),
    onSuccess: (s) => {
      if (!s) return
      setState(s)
      void client.invalidateQueries({ queryKey: ['library'] })
      read.mutate(undefined)
    },
    onError
  })
  const save = useMutation({
    mutationFn: () => invoke('cv:save', form),
    onSuccess: (s) => {
      setState(s)
      toast.success(t('master.saved'))
    },
    onError
  })

  const clean = useMemo(() => cleanCv(form), [form])
  const dirty = !!state?.cv && JSON.stringify(clean) !== JSON.stringify(state.cv)
  const facts = useMemo(() => cvFacts(form), [form])
  // A warning disappears as soon as the user changes the text it is about.
  const warnings = (state?.warnings ?? []).filter((w) => facts[w.itemId] === w.text)

  if (!state) return <PageHeader page="master" />

  const busy = read.isPending || upload.isPending
  if (!state.cv || busy) {
    return (
      <>
        <PageHeader page="master" />
        <StartCard
          busy={busy}
          sourceName={state.unread ? state.source?.filename : undefined}
          onUpload={() => upload.mutate()}
          onRead={() => read.mutate(undefined)}
        />
      </>
    )
  }

  const set = <K extends keyof MasterCv>(k: K, v: MasterCv[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const setExp = (i: number, patch: Partial<CvExperience>): void =>
    set(
      'experience',
      form.experience.map((e, j) => (j === i ? { ...e, ...patch } : e))
    )
  const setEdu = (i: number, patch: Partial<CvEducation>): void =>
    set(
      'education',
      form.education.map((e, j) => (j === i ? { ...e, ...patch } : e))
    )
  const setEntry = (k: 'certificates' | 'projects', i: number, patch: Partial<CvEntry>): void =>
    set(
      k,
      form[k].map((e, j) => (j === i ? { ...e, ...patch } : e))
    )
  const nextId = (prefix: string, list: Array<{ id: string }>): string => `${prefix}${list.length + 1}-${Date.now() % 10000}`

  async function fix(group: WarningGroup): Promise<void> {
    setFixing(group.itemId)
    try {
      const text = await invoke('cv:fix', group.text, problemNotes(group, i18n.language))
      const next = setCvFact(form, group.itemId, text)
      if (next) {
        setForm(next)
        window.setTimeout(() => showField(selectorFor(group.itemId)), 50)
        toast.success(t('facts.fixed'))
      }
    } catch (err) {
      onAiError(err, { retry: () => void fix(group) })
    } finally {
      setFixing(null)
    }
  }

  const saveButton = (
    <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
      {save.isPending ? <LoaderCircle className="animate-spin" /> : dirty ? null : <Check />}
      {dirty ? t('master.save') : t('profile.allSaved')}
    </Button>
  )

  return (
    <>
      <PageHeader page="master" actions={saveButton} />
      {state.unread && state.source && (
        <div className="mb-5 flex items-center gap-3 rounded-card border-ui border-paper-ink bg-yellow px-4 py-3 text-[12.5px] text-paper-ink">
          <FileText size={16} />
          <span className="flex-1">{t('master.newFile', { name: state.source.filename })}</span>
          <Button size="sm" variant="paper" onClick={() => window.confirm(t('master.replaceConfirm')) && read.mutate(undefined)}>
            <Sparkles />
            {t('master.readNow')}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,360px)] items-start gap-6">
        <div className="flex flex-col gap-6">
          <Section title={t('master.basics')}>
            <div className="grid grid-cols-2 gap-x-5">
              <Field label={t('profile.fullName')} fact="name" value={form.name} onChange={(v) => set('name', v)} />
              <Field label={t('profile.headline')} fact="headline" value={form.headline} onChange={(v) => set('headline', v)} />
              <Field
                label={t('profile.email')}
                dir="ltr"
                value={form.contact.email}
                onChange={(v) => set('contact', { ...form.contact, email: v })}
              />
              <Field
                label={t('profile.phone')}
                dir="ltr"
                value={form.contact.phone}
                onChange={(v) => set('contact', { ...form.contact, phone: v })}
              />
              <Field
                label={t('profile.address')}
                value={form.contact.location}
                onChange={(v) => set('contact', { ...form.contact, location: v })}
              />
              <Field
                label={`${t('profile.links')} · ${t('profile.onePerLine')}`}
                dir="ltr"
                area
                rows={2}
                value={fromLines(form.contact.links)}
                onChange={(v) => set('contact', { ...form.contact, links: toLines(v) })}
              />
            </div>
            <Field
              label={t('master.summary')}
              fact="summary"
              area
              rows={4}
              value={form.summary}
              onChange={(v) => set('summary', v)}
            />
          </Section>

          <Section
            title={t('master.experience')}
            action={
              <Button
                size="sm"
                onClick={() =>
                  set('experience', [
                    ...form.experience,
                    {
                      id: nextId('e', form.experience),
                      title: '',
                      organization: '',
                      location: '',
                      start: '',
                      end: '',
                      bullets: []
                    }
                  ])
                }
              >
                <Plus />
                {t('master.add')}
              </Button>
            }
          >
            {form.experience.length === 0 && <p className="mt-3 text-[12.5px] text-muted">{t('master.empty')}</p>}
            {form.experience.map((e, i) => (
              <div key={e.id} className={clsx('mt-4 pt-1', i > 0 && 'border-t border-soft pt-4')}>
                <div className="flex items-center justify-between">
                  <span className="label-mono">
                    {String(i + 1).padStart(2, '0')} · {e.organization || e.title || t('master.newEntry')}
                  </span>
                  <RemoveButton
                    label={t('master.remove')}
                    onClick={() =>
                      set(
                        'experience',
                        form.experience.filter((_, j) => j !== i)
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-5">
                  <Field
                    label={t('master.jobTitle')}
                    fact={`${e.id}.title`}
                    value={e.title}
                    onChange={(v) => setExp(i, { title: v })}
                  />
                  <Field
                    label={t('master.organization')}
                    fact={`${e.id}.organization`}
                    value={e.organization}
                    onChange={(v) => setExp(i, { organization: v })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-x-5">
                  <Field
                    label={t('master.location')}
                    fact={`${e.id}.location`}
                    value={e.location}
                    onChange={(v) => setExp(i, { location: v })}
                  />
                  <Field
                    label={t('master.start')}
                    fact={`${e.id}.start`}
                    value={e.start}
                    onChange={(v) => setExp(i, { start: v })}
                  />
                  <Field label={t('master.end')} value={e.end} onChange={(v) => setExp(i, { end: v })} />
                </div>
                <Field
                  label={`${t('master.bullets')} · ${t('master.onePerLine')}`}
                  fact={`${e.id}.b`}
                  area
                  rows={Math.min(8, Math.max(3, e.bullets.length + 1))}
                  value={fromLines(e.bullets)}
                  onChange={(v) => setExp(i, { bullets: toLines(v) })}
                />
              </div>
            ))}
          </Section>

          <Section
            title={t('master.education')}
            action={
              <Button
                size="sm"
                onClick={() =>
                  set('education', [
                    ...form.education,
                    {
                      id: nextId('ed', form.education),
                      degree: '',
                      institution: '',
                      location: '',
                      start: '',
                      end: '',
                      details: []
                    }
                  ])
                }
              >
                <Plus />
                {t('master.add')}
              </Button>
            }
          >
            {form.education.length === 0 && <p className="mt-3 text-[12.5px] text-muted">{t('master.empty')}</p>}
            {form.education.map((e, i) => (
              <div key={e.id} className={clsx('mt-4 pt-1', i > 0 && 'border-t border-soft pt-4')}>
                <div className="flex items-center justify-between">
                  <span className="label-mono">
                    {String(i + 1).padStart(2, '0')} · {e.institution || e.degree || t('master.newEntry')}
                  </span>
                  <RemoveButton
                    label={t('master.remove')}
                    onClick={() =>
                      set(
                        'education',
                        form.education.filter((_, j) => j !== i)
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-5">
                  <Field
                    label={t('master.degree')}
                    fact={`${e.id}.degree`}
                    value={e.degree}
                    onChange={(v) => setEdu(i, { degree: v })}
                  />
                  <Field
                    label={t('master.institution')}
                    fact={`${e.id}.institution`}
                    value={e.institution}
                    onChange={(v) => setEdu(i, { institution: v })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-x-5">
                  <Field
                    label={t('master.location')}
                    fact={`${e.id}.location`}
                    value={e.location}
                    onChange={(v) => setEdu(i, { location: v })}
                  />
                  <Field
                    label={t('master.start')}
                    fact={`${e.id}.start`}
                    value={e.start}
                    onChange={(v) => setEdu(i, { start: v })}
                  />
                  <Field label={t('master.end')} value={e.end} onChange={(v) => setEdu(i, { end: v })} />
                </div>
                <Field
                  label={`${t('master.details')} · ${t('master.onePerLine')}`}
                  fact={`${e.id}.d`}
                  area
                  rows={2}
                  value={fromLines(e.details)}
                  onChange={(v) => setEdu(i, { details: toLines(v) })}
                />
              </div>
            ))}
          </Section>

          <Section title={t('master.skillsAndLanguages')}>
            <div className="grid grid-cols-2 gap-x-5">
              <Field
                label={`${t('master.skills')} · ${t('master.onePerLine')}`}
                fact="skills"
                area
                rows={8}
                value={fromLines(form.skills)}
                onChange={(v) => set('skills', toLines(v))}
              />
              <div>
                <FieldLabel>{t('master.languages')}</FieldLabel>
                <div className="flex flex-col gap-2">
                  {form.languages.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TextInput
                        data-fact={`languages.${i}`}
                        dir="auto"
                        value={l.name}
                        placeholder={t('master.languageName')}
                        onChange={(e) =>
                          set(
                            'languages',
                            form.languages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                          )
                        }
                      />
                      <TextInput
                        dir="auto"
                        value={l.level}
                        placeholder={t('master.level')}
                        onChange={(e) =>
                          set(
                            'languages',
                            form.languages.map((x, j) => (j === i ? { ...x, level: e.target.value } : x))
                          )
                        }
                      />
                      <RemoveButton
                        label={t('master.remove')}
                        onClick={() =>
                          set(
                            'languages',
                            form.languages.filter((_, j) => j !== i)
                          )
                        }
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={() => set('languages', [...form.languages, { name: '', level: '' }])}
                  >
                    <Plus />
                    {t('master.add')}
                  </Button>
                </div>
              </div>
            </div>
          </Section>

          {(['certificates', 'projects'] as const).map((k) => (
            <Section
              key={k}
              title={t(`master.${k}`)}
              action={
                <Button
                  size="sm"
                  onClick={() => set(k, [...form[k], { id: nextId(k[0]!, form[k]), name: '', detail: '', date: '' }])}
                >
                  <Plus />
                  {t('master.add')}
                </Button>
              }
            >
              {form[k].length === 0 && <p className="mt-3 text-[12.5px] text-muted">{t('master.empty')}</p>}
              {form[k].map((c, i) => (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_120px_auto] items-end gap-x-3">
                  <Field
                    label={t('master.name')}
                    fact={`${c.id}.name`}
                    value={c.name}
                    onChange={(v) => setEntry(k, i, { name: v })}
                  />
                  <Field
                    label={t('master.detail')}
                    fact={`${c.id}.detail`}
                    value={c.detail}
                    onChange={(v) => setEntry(k, i, { detail: v })}
                  />
                  <Field
                    label={t('master.date')}
                    fact={`${c.id}.date`}
                    value={c.date}
                    onChange={(v) => setEntry(k, i, { date: v })}
                  />
                  <div className="pb-1.5">
                    <RemoveButton
                      label={t('master.remove')}
                      onClick={() =>
                        set(
                          k,
                          form[k].filter((_, j) => j !== i)
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </Section>
          ))}

          <Section
            title={t('master.other')}
            action={
              <Button
                size="sm"
                onClick={() => set('other', [...form.other, { id: nextId('o', form.other), title: '', lines: [] }])}
              >
                <Plus />
                {t('master.add')}
              </Button>
            }
          >
            {form.other.length === 0 && <p className="mt-3 text-[12.5px] text-muted">{t('master.otherEmpty')}</p>}
            {form.other.map((o, i) => (
              <div key={o.id} className={clsx('mt-2', i > 0 && 'border-t border-soft pt-2')}>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Field
                      label={t('master.sectionTitle')}
                      fact={`${o.id}.title`}
                      value={o.title}
                      onChange={(v) =>
                        set(
                          'other',
                          form.other.map((x, j) => (j === i ? { ...x, title: v } : x))
                        )
                      }
                    />
                  </div>
                  <div className="pb-1.5">
                    <RemoveButton
                      label={t('master.remove')}
                      onClick={() =>
                        set(
                          'other',
                          form.other.filter((_, j) => j !== i)
                        )
                      }
                    />
                  </div>
                </div>
                <Field
                  label={t('master.onePerLine')}
                  fact={`${o.id}.l`}
                  area
                  rows={3}
                  value={fromLines(o.lines)}
                  onChange={(v) =>
                    set(
                      'other',
                      form.other.map((x, j) => (j === i ? { ...x, lines: toLines(v) } : x))
                    )
                  }
                />
              </div>
            ))}
          </Section>
        </div>

        <aside className="sticky top-6 flex flex-col gap-5">
          <section className="rounded-card border-ui border-strong bg-purple px-5 py-5 text-paper-ink">
            <div className="label-mono !text-[#4a4560]">{t('master.sourceKicker')}</div>
            <h2 className="mt-2 font-head text-[18px] font-bold">{t('master.onlySource')}</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#4a4560]">{t('master.onlySourceSub')}</p>
            {state.source && (
              <div className="mt-4 flex items-center gap-2 rounded-card border-ui border-paper-ink bg-[#fffdf9] px-3 py-2 text-[12px]">
                <FileText size={15} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {state.source.filename}
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="paper" onClick={() => upload.mutate()}>
                <Upload />
                {t('master.uploadNew')}
              </Button>
              {state.source && (
                <Button
                  size="sm"
                  variant="paper"
                  onClick={() => window.confirm(t('master.replaceConfirm')) && read.mutate(undefined)}
                >
                  <RefreshCw />
                  {t('master.readAgain')}
                </Button>
              )}
            </div>
          </section>
          <section className="rounded-card border-ui border-strong bg-surface px-5 py-5">
            <h2 className="mb-3 font-head text-[18px] font-bold">{t('master.checkTitle')}</h2>
            <FactWarnings
              source="file"
              warnings={warnings}
              busyItem={fixing}
              onShow={(g) => showField(selectorFor(g.itemId), g.warnings[0]?.token)}
              onFix={(g) => void fix(g)}
              canFix={(g) => setCvFact(form, g.itemId, g.text) !== null}
              onKeep={(g) => {
                for (const w of g.warnings) void invoke('cv:dismiss', w.id).then(setState).catch(onError)
              }}
            />
          </section>
        </aside>
      </div>
    </>
  )
}
