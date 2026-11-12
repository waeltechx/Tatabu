import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { ERROR_CODES, type ErrorCode } from '@shared/settings'

export function invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> {
  return window.tatabu.invoke(channel, ...args)
}

/** Finds one of our error codes in an IPC error ("Error invoking remote method …: Error: CODE"). */
export function errorCode(err: unknown): ErrorCode | null {
  const message = err instanceof Error ? err.message : String(err)
  return ERROR_CODES.find((code) => message.includes(code)) ?? null
}

/** Shows a translated toast for a failed action. */
export function useErrorToast(): (err: unknown) => void {
  const { t } = useTranslation()
  return (err) => {
    const code = errorCode(err)
    toast.error(code ? t(`errors.${code}`) : t('errors.generic'))
    if (!code) console.error(err)
  }
}

// --- queries -----------------------------------------------------------------

export const keys = {
  settings: ['settings'] as const,
  languages: ['languages'] as const,
  referees: ['referees'] as const,
  latestCv: ['latestCv'] as const
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => invoke('settings:get') })
}

export function useLanguages() {
  return useQuery({ queryKey: keys.languages, queryFn: () => invoke('languages:list') })
}

export function useReferees() {
  return useQuery({ queryKey: keys.referees, queryFn: () => invoke('referees:list') })
}

export function useLatestCv() {
  return useQuery({ queryKey: keys.latestCv, queryFn: () => invoke('library:latestCv') })
}

/**
 * A mutation whose result replaces the cached value under `key`
 * (every write channel returns the fresh state). Errors become toasts.
 */
export function useWrite<TArgs extends unknown[], TResult>(
  key: readonly unknown[],
  fn: (...args: TArgs) => Promise<TResult>
) {
  const client = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: (args: TArgs) => fn(...args),
    onSuccess: (result) => {
      if (result !== null && result !== undefined) client.setQueryData(key, result)
    },
    onError
  })
}
