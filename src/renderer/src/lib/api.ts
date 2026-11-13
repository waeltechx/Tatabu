import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { ERROR_CODES, type ErrorCode } from '@shared/settings'
import { otherTextProvider, PROVIDER_NAMES, type ProviderId } from '@shared/ai'

export function invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> {
  return window.tatabu.invoke(channel, ...args)
}

/** Finds one of our error codes in an IPC error ("Error invoking remote method …: Error: CODE"). */
export function errorCode(err: unknown): ErrorCode | null {
  const message = err instanceof Error ? err.message : String(err)
  // Longest match wins, so "AI_MODEL_MISSING" is never read as a shorter code inside it.
  let best: ErrorCode | null = null
  for (const code of ERROR_CODES) if (message.includes(code) && code.length > (best?.length ?? 0)) best = code
  return best
}

/** The provider's own words after the code ("…AI_BAD_REQUEST: model is overloaded"), if any. */
export function errorDetail(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const code = errorCode(err)
  if (!code) return ''
  const after = message.slice(message.indexOf(code) + code.length)
  return after.startsWith(': ') ? after.slice(2).trim() : ''
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

/** Shows a translated toast after a failed AI call, with Retry and, when set up, "Try with <other provider>". */
export function useAiErrorToast(): (err: unknown, actions: { retry?: () => void; tryWith?: (p: ProviderId) => void }) => void {
  const { t } = useTranslation()
  const { data: settings } = useSettings()
  return (err, { retry, tryWith }) => {
    const code = errorCode(err)
    const other = settings && tryWith ? otherTextProvider(settings) : null
    const detail = code === 'AI_BAD_REQUEST' || code === 'AI_MODEL_MISSING' ? errorDetail(err) : ''
    if (!code) console.error(err)
    toast.error(code ? t(`errors.${code}`) : t('errors.generic'), {
      description: detail || undefined,
      duration: 12_000,
      action: retry ? { label: t('common.retry'), onClick: retry } : undefined,
      cancel:
        other && tryWith
          ? {
              label: t('ai.tryWith', { name: PROVIDER_NAMES[other] }),
              onClick: () => tryWith(other)
            }
          : undefined
    })
  }
}

// --- queries -----------------------------------------------------------------

export const keys = {
  settings: ['settings'] as const,
  languages: ['languages'] as const,
  referees: ['referees'] as const,
  latestCv: ['latestCv'] as const,
  models: (provider: ProviderId) => ['models', provider] as const
}

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => invoke('settings:get')
  })
}

export function useLanguages() {
  return useQuery({
    queryKey: keys.languages,
    queryFn: () => invoke('languages:list')
  })
}

export function useReferees() {
  return useQuery({
    queryKey: keys.referees,
    queryFn: () => invoke('referees:list')
  })
}

/** The provider's chat models; only asked for when its key is saved. */
export function useModels(provider: ProviderId, enabled: boolean) {
  return useQuery({
    queryKey: keys.models(provider),
    queryFn: () => invoke('ai:models', provider),
    enabled,
    staleTime: 10 * 60_000,
    retry: false
  })
}

export function useLatestCv() {
  return useQuery({
    queryKey: keys.latestCv,
    queryFn: () => invoke('library:latestCv')
  })
}

/**
 * A mutation whose result replaces the cached value under `key`
 * (every write channel returns the fresh state). Errors become toasts.
 */
export function useWrite<TArgs extends unknown[], TResult>(key: readonly unknown[], fn: (...args: TArgs) => Promise<TResult>) {
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
