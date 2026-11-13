import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, FileText, LoaderCircle, Pencil, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { EMPTY_PROFILE, type Profile } from '@shared/profile'
import type { LibraryItem } from '@shared/applications'
import { invoke, useErrorToast } from '@/lib/api'
import { appKeys, formatSize, useLibrary } from '@/lib/apps'
import { docKeys, kindLabel, useProfile } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, TextInput } from '@/components/ui'
import { SignaturePad } from '@/components/docs/SignaturePad'

const areaClass =
  'w-full resize-y rounded-card border-ui border-soft bg-field px-[11px] py-2.5 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

function Panel({
  title,
  sub,
  children,
  className
}: {
  title: string
  sub?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={clsx('rounded-card border-ui border-strong bg-surface px-5 py-5', className)}>
      <h2 className="font-head text-[22px] font-bold">{title}</h2>
      {sub && <p className="mt-1 text-[12.5px] text-muted">{sub}</p>}
      {children}
    </section>
  )
}

function LibraryRow({ item }: { item: LibraryItem }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(item.label)
  const set = (items: LibraryItem[]): void => void client.setQueryData(appKeys.library, items)

  return (
    <li className="flex items-center gap-3 rounded-card border-ui border-soft bg-surface px-3 py-2.5">
      <FileText size={18} strokeWidth={1.8} className="shrink-0" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={label}
            aria-label={t('profile.docName')}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setLabel(item.label)
                setEditing(false)
              }
            }}
            onBlur={() => {
              setEditing(false)
              if (label.trim() && label !== item.label) invoke('library:rename', item.id, label).then(set).catch(onError)
            }}
            className="w-full rounded border-ui border-soft bg-field px-2 py-1 text-[13px] outline-none focus:border-strong"
          />
        ) : (
          <button
            type="button"
            onClick={() => invoke('library:open', item.id).catch(onError)}
            className="block max-w-full cursor-pointer truncate text-start text-[13.5px] font-medium hover:underline"
            dir="auto"
            title={item.filename}
          >
            {item.label || item.filename}
          </button>
        )}
        <div className="mt-0.5 text-[11px] text-muted">
          {[kindLabel(item.filename), item.missing ? t('files.missing') : item.size ? formatSize(item.size) : '']
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={t('profile.renameDoc', { name: item.label })}
        className="flex size-8 cursor-pointer items-center justify-center rounded hover:bg-field"
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        onClick={() =>
          invoke('library:remove', item.id)
            .then((items) => {
              set(items)
              toast.success(t('files.trashed'))
            })
            .catch(onError)
        }
        aria-label={t('files.delete', { name: item.label })}
        className="flex size-8 cursor-pointer items-center justify-center rounded hover:bg-field"
      >
        <Trash2 size={16} />
      </button>
    </li>
  )
}

export function ProfileView() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const { data: saved } = useProfile()
  const { data: library = [] } = useLibrary()
  const [form, setForm] = useState<Profile>(EMPTY_PROFILE)
  const [links, setLinks] = useState('')
  const [docName, setDocName] = useState('')
  const [cvName, setCvName] = useState<string | null>(null)

  useEffect(() => {
    if (!saved) return
    setForm(saved)
    setLinks(saved.links.join('\n'))
  }, [saved])
  useEffect(() => {
    void invoke('library:latestCv').then((f) => setCvName(f?.filename ?? null))
  }, [library])

  const next: Profile = {
    ...form,
    links: links
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }
  const dirty = !!saved && JSON.stringify(next) !== JSON.stringify(saved)

  const save = useMutation({
    mutationFn: () => invoke('profile:save', next),
    onSuccess: (p) => {
      client.setQueryData(docKeys.profile, p)
      void client.invalidateQueries({ queryKey: appKeys.setup })
      toast.success(t('profile.saved'))
    },
    onError
  })
  const upload = useMutation({
    mutationFn: () => invoke('library:add', docName),
    onSuccess: (items) => {
      client.setQueryData(appKeys.library, items)
      setDocName('')
    },
    onError
  })

  const set = <K extends keyof Profile>(k: K, v: Profile[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const docs = library.filter((l) => l.label !== 'CV' || !cvName || l.filename !== cvName)

  const saveButton = (
    <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
      {save.isPending ? <LoaderCircle className="animate-spin" /> : dirty ? null : <Check />}
      {dirty ? t('profile.save') : t('profile.allSaved')}
    </Button>
  )

  return (
    <>
      <PageHeader page="profile" actions={saveButton} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,420px)] items-start gap-6">
        <div className="flex flex-col gap-6">
          <Panel title={t('profile.detailsTitle')}>
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <FieldLabel htmlFor="p-name">{t('profile.fullName')}</FieldLabel>
                <TextInput id="p-name" dir="auto" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="p-headline">{t('profile.headline')}</FieldLabel>
                <TextInput
                  id="p-headline"
                  dir="auto"
                  value={form.headline}
                  placeholder={t('profile.headlinePlaceholder')}
                  onChange={(e) => set('headline', e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-email">{t('profile.email')}</FieldLabel>
                <TextInput
                  id="p-email"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-phone">{t('profile.phone')}</FieldLabel>
                <TextInput id="p-phone" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <FieldLabel htmlFor="p-address">{t('profile.address')}</FieldLabel>
                <textarea
                  id="p-address"
                  dir="auto"
                  rows={3}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  className={areaClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-links">
                  {t('profile.links')} · <span className="font-medium">{t('profile.onePerLine')}</span>
                </FieldLabel>
                <textarea
                  id="p-links"
                  dir="ltr"
                  rows={3}
                  value={links}
                  placeholder="https://linkedin.com/in/…"
                  onChange={(e) => setLinks(e.target.value)}
                  className={areaClass}
                />
              </div>
            </div>
          </Panel>

          <Panel title={t('profile.cvTitle')} sub={t('profile.cvSub')}>
            <div className="mt-5 flex items-center gap-2 rounded-card border-ui border-strong bg-green px-4 py-3 text-[13px] text-paper-ink">
              <Check size={15} />
              {t('profile.cvOnlySource')}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-muted" dir="auto">
                {cvName ? t('profile.cvImported', { name: cvName }) : t('profile.cvNone')}
              </span>
              <Link
                to="/cv/master"
                className="ms-auto inline-flex h-[40px] items-center gap-1.5 rounded-card border-ui border-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink no-underline hover:bg-field"
              >
                {t('profile.openMaster')}
                <ArrowUpRight size={15} className="rtl:-scale-x-100" />
              </Link>
            </div>
            <p className="label-mono mt-4">{t('profile.storedHere')}</p>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title={t('profile.signatureTitle')} sub={t('profile.signatureSub')}>
            <div className="mt-5">
              <SignaturePad value={form.signature} onChange={(v) => set('signature', v)} />
            </div>
          </Panel>

          <Panel title={t('profile.libraryTitle')} sub={t('profile.librarySub')}>
            <FieldLabel htmlFor="p-docname" className="!mt-5">
              {t('profile.docName')}
            </FieldLabel>
            <TextInput
              id="p-docname"
              dir="auto"
              value={docName}
              placeholder={t('profile.docNamePlaceholder')}
              onChange={(e) => setDocName(e.target.value)}
            />
            <Button variant="primary" className="mt-3 w-full" disabled={upload.isPending} onClick={() => upload.mutate()}>
              {upload.isPending ? <LoaderCircle className="animate-spin" /> : <Upload />}
              {t('profile.upload')}
            </Button>
            <div className="label-mono mt-6 mb-3">{t('profile.libraryCount', { count: docs.length })}</div>
            {docs.length === 0 ? (
              <p className="text-[12.5px] text-muted">{t('files.libraryEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {docs.map((item) => (
                  <LibraryRow key={item.id} item={item} />
                ))}
              </ul>
            )}
            <p className="mt-5 text-[12px] text-muted">{t('profile.trashNote')}</p>
          </Panel>
        </div>
      </div>
      {dirty && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              if (!saved) return
              setForm(saved)
              setLinks(saved.links.join('\n'))
            }}
          >
            <X />
            {t('profile.discard')}
          </Button>
          {saveButton}
        </div>
      )}
    </>
  )
}
