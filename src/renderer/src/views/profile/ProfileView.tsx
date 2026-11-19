import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, FileText, LoaderCircle, Pencil, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { EMPTY_PROFILE, type Profile } from '@shared/profile'
import type { LibraryItem } from '@shared/applications'
import { invoke, useErrorToast } from '@/lib/api'
import { appKeys, formatSize, useLibrary } from '@/lib/apps'
import { docKeys, kindLabel, useProfile } from '@/lib/docs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, FieldLabel, TextInput } from '@/components/ui'
import { SignaturePad } from '@/components/docs/SignaturePad'

const areaClass =
  'block w-full resize-y rounded-card border-ui border-soft bg-field px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-strong'

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
    <section className={cn('min-w-0 rounded-card border-ui border-strong bg-surface px-3.5 py-3', className)}>
      <h2 className="font-head text-[15px] leading-snug font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-[12px] leading-[1.45] text-muted">{sub}</p>}
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
    <li className="flex min-h-9 items-center gap-2 rounded-card border-ui border-soft bg-surface py-0.5 ps-2.5 pe-0.5">
      <FileText size={15} strokeWidth={1.8} className="shrink-0" />
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
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
            className="h-7 w-full rounded border-ui border-soft bg-field px-2 text-[12.5px] outline-none focus:border-strong"
          />
        ) : (
          <button
            type="button"
            onClick={() => invoke('library:open', item.id).catch(onError)}
            className="block min-w-0 cursor-pointer truncate text-start text-[13px] font-medium hover:underline"
            dir="auto"
            title={item.filename}
          >
            {item.label || item.filename}
          </button>
        )}
        {!editing && (
          <span className="shrink-0 text-[11px] text-muted">
            {[kindLabel(item.filename), item.missing ? t('files.missing') : item.size ? formatSize(item.size) : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={t('profile.renameDoc', { name: item.label })}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-field"
      >
        <Pencil size={14} />
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
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-field"
      >
        <Trash2 size={14} />
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

  // The primary button only appears when there is something to save; otherwise a quiet status.
  const saveButton = dirty ? (
    <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
      {save.isPending ? <LoaderCircle className="animate-spin" /> : null}
      {t('profile.save')}
    </Button>
  ) : (
    <span role="status" className="me-1.5 inline-flex items-center gap-1 text-[12px] text-muted">
      <Check size={14} aria-hidden />
      {t('profile.allSaved')}
    </span>
  )

  return (
    <>
      <PageHeader page="profile" actions={saveButton} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,380px)] items-start gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel title={t('profile.detailsTitle')}>
            <div className="grid grid-cols-2 gap-x-3">
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
            <div className="grid grid-cols-2 gap-x-3">
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

          {/* One row: status + link. The "only source of facts" banner and "stored on this device" line repeated the sidebar. */}
          <Panel title={t('profile.cvTitle')} sub={t('profile.cvSub')}>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted" dir="auto">
                {cvName ? t('profile.cvImported', { name: cvName }) : t('profile.cvNone')}
              </span>
              <Link
                to="/cv/master"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-card border-ui border-strong bg-surface px-3 text-[12.5px] font-semibold text-ink no-underline hover:bg-field"
              >
                {t('profile.openMaster')}
                <ArrowUpRight size={14} className="rtl:-scale-x-100" />
              </Link>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel title={t('profile.signatureTitle')} sub={t('profile.signatureSub')}>
            <div className="mt-2">
              <SignaturePad value={form.signature} onChange={(v) => set('signature', v)} />
            </div>
          </Panel>

          <Panel title={t('profile.libraryTitle')} sub={t('profile.librarySub')}>
            <FieldLabel htmlFor="p-docname" className="mt-2">
              {t('profile.docName')}
            </FieldLabel>
            <div className="flex gap-2">
              <TextInput
                id="p-docname"
                dir="auto"
                value={docName}
                placeholder={t('profile.docNamePlaceholder')}
                onChange={(e) => setDocName(e.target.value)}
              />
              <Button variant="primary" className="shrink-0" disabled={upload.isPending} onClick={() => upload.mutate()}>
                {upload.isPending ? <LoaderCircle className="animate-spin" /> : <Upload />}
                {t('profile.upload')}
              </Button>
            </div>
            <div className="label-mono mt-3 mb-1.5">{t('profile.libraryCount', { count: docs.length })}</div>
            {docs.length === 0 ? (
              <p className="rounded-card border-ui border-dashed border-soft px-3 py-3 text-center text-[12.5px] text-muted">
                {t('files.libraryEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {docs.map((item) => (
                  <LibraryRow key={item.id} item={item} />
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11.5px] text-muted">{t('profile.trashNote')}</p>
          </Panel>
        </div>
      </div>
      {dirty && (
        <div className="sticky bottom-4 mt-3 flex items-center justify-end gap-2">
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
