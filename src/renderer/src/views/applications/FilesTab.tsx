import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  FileText,
  Image,
  Library,
  LoaderCircle,
  Merge,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { FILE_TYPES, type AppFile, type Application, type FileType } from '@shared/applications'
import { invoke, useErrorToast } from '@/lib/api'
import { appKeys, formatSize, useFiles, useFileWrite, useLibrary } from '@/lib/apps'
import { Button, TextInput } from '@/components/ui'

function guessType(name: string): FileType {
  const n = name.toLowerCase()
  if (/\bcv\b|resume|lebenslauf|سيرة/.test(n)) return 'cv'
  if (/cover|letter|anschreiben|motivation|رسالة/.test(n)) return 'cover_letter'
  if (/reference|referenz|empfehlung/.test(n)) return 'reference'
  return 'other'
}

/** "Acme GmbH" → "Acme_GmbH_Application.pdf" */
function defaultPdfName(company: string): string {
  const base = company
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
  return `${base || 'Application'}_Application.pdf`
}

function FileIcon({ file }: { file: AppFile }) {
  const Icon = file.kind === 'image' ? Image : FileText
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border-ui border-soft bg-field">
      <Icon size={17} strokeWidth={1.8} />
    </span>
  )
}

function LibraryPicker({ appId, onClose }: { appId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: items = [], isPending } = useLibrary()
  const [picked, setPicked] = useState<string[]>([])
  const attach = useFileWrite(appId, (ids: string[]) => invoke('files:attachLibrary', appId, ids))
  return (
    <div className="mt-4 rounded-card border-ui border-strong bg-surface px-4 py-4">
      <div className="flex items-center justify-between">
        <b className="text-[13.5px] font-semibold">{t('files.fromLibrary')}</b>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="cursor-pointer text-muted hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
      {isPending ? null : items.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">{t('files.libraryEmpty')}</p>
      ) : (
        <ul className="mt-3 flex max-h-[220px] flex-col gap-1.5 overflow-auto">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[12.5px] hover:bg-field">
                <input
                  type="checkbox"
                  checked={picked.includes(item.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, item.id] : p.filter((x) => x !== item.id)))}
                />
                <span className="flex-1 truncate" dir="auto">
                  {item.label || item.filename}
                </span>
                <span className="text-[11px] text-muted" dir="auto">
                  {item.label ? item.filename : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="primary"
          disabled={!picked.length || attach.isPending}
          onClick={() => attach.mutate([picked], { onSuccess: onClose })}
        >
          {t('files.attachN', { count: picked.length })}
        </Button>
      </div>
    </div>
  )
}

export function FilesTab({ app }: { app: Application }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const { data: files = [], isPending } = useFiles(app.id)
  const [selected, setSelected] = useState<string[]>([])
  const [showLibrary, setShowLibrary] = useState(false)
  const [pdfName, setPdfName] = useState(defaultPdfName(app.company))
  const [combining, setCombining] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => setPdfName(defaultPdfName(app.company)), [app.company])
  // Drop selections whose file is gone.
  useEffect(() => setSelected((s) => s.filter((id) => files.some((f) => f.id === id))), [files])

  const setType = useFileWrite(app.id, (id: string, type: FileType) => invoke('files:setType', id, type))
  const remove = useFileWrite(app.id, (id: string) => invoke('files:delete', id))

  const order = useMemo(
    () => selected.map((id) => files.find((f) => f.id === id)).filter((f): f is AppFile => !!f),
    [selected, files]
  )

  async function upload(): Promise<void> {
    try {
      const picked = await invoke('files:pick')
      if (!picked.length) return
      setUploading(true)
      const groups = new Map<FileType, string[]>()
      for (const p of picked) {
        const type = guessType(p.filename)
        groups.set(type, [...(groups.get(type) ?? []), p.token])
      }
      let latest: AppFile[] = files
      for (const [type, tokens] of groups) latest = await invoke('files:add', app.id, tokens, type)
      client.setQueryData(appKeys.files(app.id), latest)
    } catch (err) {
      onError(err)
    } finally {
      setUploading(false)
    }
  }

  async function combine(): Promise<void> {
    setCombining(true)
    try {
      const result = await invoke('files:combine', app.id, selected, pdfName)
      client.setQueryData(appKeys.files(app.id), result.files)
      setSelected([])
      if (result.skipped.length) toast.warning(t('files.combinedSkipped', { names: result.skipped.join(', ') }))
      else toast.success(t('files.combined'))
    } catch (err) {
      onError(err)
    } finally {
      setCombining(false)
    }
  }

  function move(id: string, by: -1 | 1): void {
    setSelected((list) => {
      const i = list.indexOf(id)
      const j = i + by
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      next.splice(j, 0, ...next.splice(i, 1))
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void upload()} disabled={uploading}>
          {uploading ? <LoaderCircle className="animate-spin" /> : <Upload />}
          {t('files.upload')}
        </Button>
        <Button onClick={() => setShowLibrary((v) => !v)}>
          <Library />
          {t('files.fromLibrary')}
        </Button>
        <span className="label-mono ms-auto">{t('files.count', { count: files.length })}</span>
      </div>

      {showLibrary && <LibraryPicker appId={app.id} onClose={() => setShowLibrary(false)} />}

      {!isPending && files.length === 0 && (
        <p className="mt-6 rounded-card border-ui border-dashed border-soft px-5 py-8 text-center text-[13px] text-muted">
          {t('files.empty')}
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-2.5">
        {files.map((f) => (
          <li
            key={f.id}
            className={clsx(
              'flex items-center gap-3 rounded-card border-ui px-3 py-2.5',
              selected.includes(f.id) ? 'border-strong bg-field' : 'border-soft bg-surface'
            )}
          >
            <input
              type="checkbox"
              aria-label={t('files.select', { name: f.filename })}
              checked={selected.includes(f.id)}
              disabled={f.missing}
              onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id)))}
              className="size-4 cursor-pointer"
            />
            <FileIcon file={f} />
            <div className="min-w-0 flex-1">
              <div
                className={clsx('truncate text-[13px] font-medium', f.missing && 'text-muted line-through')}
                dir="auto"
                title={f.filename}
              >
                {f.filename}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
                <span className="relative">
                  <select
                    value={f.type}
                    aria-label={t('files.type')}
                    onChange={(e) => setType.mutate([f.id, e.target.value as FileType])}
                    className="cursor-pointer appearance-none bg-transparent pe-4 text-muted outline-none"
                  >
                    {FILE_TYPES.map((ft) => (
                      <option key={ft} value={ft}>
                        {t(`fileType.${ft}`)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="pointer-events-none absolute end-0 top-1/2 -translate-y-1/2" />
                </span>
                <span>· {f.missing ? t('files.missing') : formatSize(f.size)}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={f.missing}
              onClick={() => invoke('files:open', f.id).catch(onError)}
              aria-label={t('files.open', { name: f.filename })}
              title={t('files.openShort')}
              className="flex size-8 cursor-pointer items-center justify-center rounded hover:bg-field disabled:opacity-40"
            >
              <ExternalLink size={16} />
            </button>
            <button
              type="button"
              onClick={() => remove.mutate([f.id], { onSuccess: () => toast.success(t('files.trashed')) })}
              aria-label={t('files.delete', { name: f.filename })}
              title={t('files.deleteShort')}
              className="flex size-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-field hover:text-ink"
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>

      {files.length > 0 && (
        <section className="mt-6 rounded-card border-ui border-strong bg-blue px-5 py-5 text-paper-ink">
          <b className="flex items-center gap-2 font-head text-[16px] font-bold">
            <Merge size={17} />
            {t('files.combineTitle')}
          </b>
          <p className="mt-1 text-[12.5px]">{order.length ? t('files.combineOrder') : t('files.combineHint')}</p>
          {order.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1.5">
              {order.map((f, i) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-[6px] border-ui border-paper-ink bg-[#fffdf9] px-2.5 py-1.5 text-[12.5px]"
                >
                  <span className="w-5 font-mono text-[11px]" dir="ltr">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate" dir="auto">
                    {f.filename}
                  </span>
                  {f.kind !== 'pdf' && f.kind !== 'image' && (
                    <span className="text-[11px] text-[#7a3b2e]">{t('files.wontFit')}</span>
                  )}
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(f.id, -1)}
                    aria-label={t('files.moveUp')}
                    className="flex size-6 cursor-pointer items-center justify-center rounded disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={i === order.length - 1}
                    onClick={() => move(f.id, 1)}
                    aria-label={t('files.moveDown')}
                    className="flex size-6 cursor-pointer items-center justify-center rounded disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 flex items-center gap-3">
            <TextInput
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              aria-label={t('files.pdfName')}
              dir="auto"
              className="!border-paper-ink !bg-[#fffdf9] !text-paper-ink"
            />
            <Button variant="paper" disabled={order.length === 0 || !pdfName.trim() || combining} onClick={() => void combine()}>
              {combining && <LoaderCircle className="animate-spin" />}
              {t('files.combine', { count: order.length })}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
