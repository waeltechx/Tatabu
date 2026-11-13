import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, X } from 'lucide-react'
import type { UpdateState } from '@shared/updates'
import { invoke, useErrorToast } from '@/lib/api'
import { Button } from '@/components/ui'

export const updateKey = ['update'] as const

/** The update state; polled quickly only while something is happening. */
export function useUpdateState() {
  return useQuery({
    queryKey: updateKey,
    queryFn: () => invoke('update:state'),
    refetchInterval: (q) => {
      const s = (q.state.data as UpdateState | undefined)?.status
      return s === 'checking' || s === 'downloading' ? 2_000 : 60_000
    }
  })
}

/** "Version x.y ready · What's new · Update", above every page. */
export function UpdateBanner() {
  const { t } = useTranslation()
  const { data } = useUpdateState()
  const onError = useErrorToast()
  const [hidden, setHidden] = useState('')
  if (!data || (data.status !== 'ready' && data.status !== 'available') || hidden === data.version) return null
  const manual = data.status === 'available'

  return (
    <div className="mb-6 flex items-center gap-3 rounded-card border-ui border-paper-ink bg-yellow px-4 py-2.5 text-[13px] text-paper-ink shadow-hard">
      <Sparkles size={17} className="shrink-0" />
      <span className="font-semibold">{t(manual ? 'update.available' : 'update.ready', { version: data.version })}</span>
      {data.notesUrl && (
        <a href={data.notesUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {t('update.whatsNew')}
        </a>
      )}
      <div className="ms-auto flex items-center gap-2">
        <Button size="sm" variant="paper" onClick={() => invoke('update:install').catch(onError)}>
          {t(manual ? 'update.download' : 'update.restart')}
        </Button>
        <button
          type="button"
          aria-label={t('update.later')}
          title={t('update.later')}
          onClick={() => setHidden(data.version)}
          className="flex size-8 items-center justify-center rounded-[6px] hover:bg-black/10"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
