/** Queries, mutations and formatting for applications and their files. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppFile, Application, ApplicationPatch, Status } from '@shared/applications'
import { invoke, useErrorToast } from './api'

export const appKeys = {
  list: ['apps'] as const,
  files: (id: string) => ['files', id] as const,
  library: ['library'] as const,
  setup: ['setup'] as const
}

export function useApps() {
  return useQuery({ queryKey: appKeys.list, queryFn: () => invoke('apps:list') })
}

export function useFiles(applicationId: string | undefined) {
  return useQuery({
    queryKey: appKeys.files(applicationId ?? ''),
    queryFn: () => invoke('files:list', applicationId as string),
    enabled: !!applicationId,
    staleTime: 0
  })
}

export function useLibrary(enabled = true) {
  return useQuery({ queryKey: appKeys.library, queryFn: () => invoke('library:list'), enabled, staleTime: 0 })
}

export function useSetup() {
  return useQuery({ queryKey: appKeys.setup, queryFn: () => invoke('apps:setup'), staleTime: 0 })
}

/** Puts a changed application into the cached list. */
export function useStoreApp() {
  const client = useQueryClient()
  return (app: Application) =>
    client.setQueryData<Application[]>(appKeys.list, (list) =>
      list ? (list.some((a) => a.id === app.id) ? list.map((a) => (a.id === app.id ? app : a)) : [app, ...list]) : [app]
    )
}

export function useUpdateApp() {
  const store = useStoreApp()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ApplicationPatch }) => invoke('apps:update', id, patch),
    onSuccess: store,
    onError
  })
}

/** A file mutation whose result is the application's new file list. */
export function useFileWrite<TArgs extends unknown[]>(applicationId: string, fn: (...args: TArgs) => Promise<AppFile[]>) {
  const client = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: (args: TArgs) => fn(...args),
    onSuccess: (files) => client.setQueryData(appKeys.files(applicationId), files),
    onError
  })
}

// --- formatting ----------------------------------------------------------------

export const STATUS_TONE: Record<Status, string> = {
  saved: 'bg-blue',
  applied: 'bg-yellow',
  interview: 'bg-purple',
  offer: 'bg-green',
  rejected: 'bg-pink',
  withdrawn: 'bg-[#e4e1d8]'
}

/** Latin digits in both languages, so dates line up with the rest of the UI. */
function locale(lang: string): string {
  return lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB'
}

/** "18 Nov 2026" from an ISO date or timestamp. */
export function formatDate(iso: string, lang: string, withYear = true): string {
  if (!iso) return ''
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {})
  }).format(d)
}

/** Local calendar day "YYYY-MM-DD". */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days from today to an ISO date (negative when past). */
export function daysUntil(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const today = new Date(`${localDay(new Date())}T00:00:00`)
  const then = new Date(`${isoDate}T00:00:00`)
  return Math.round((then.getTime() - today.getTime()) / 86_400_000)
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const countWords = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0)

export function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
