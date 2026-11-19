import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { invoke, useErrorToast } from '@/lib/api'
import { Button, Card } from '@/components/ui'
import { updateKey, useUpdateState } from '@/components/layout/UpdateBanner'

/** Version and "Check for updates". */
export function AboutCard() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const onError = useErrorToast()
  const { data: info } = useQuery({ queryKey: ['appInfo'], queryFn: () => invoke('app:info'), staleTime: Infinity })
  const { data: update } = useUpdateState()
  const busy = update?.status === 'checking' || update?.status === 'downloading'

  const check = (): void => {
    client.setQueryData(updateKey, { ...update, status: 'checking' })
    invoke('update:check')
      .then((s) => client.setQueryData(updateKey, s))
      .catch(onError)
  }

  const line = (() => {
    switch (update?.status) {
      case 'checking':
        return t('update.checking')
      case 'none':
        return t('update.upToDate')
      case 'downloading':
        return t('update.downloading', { version: update.version, percent: update.percent })
      case 'ready':
        return t('update.ready', { version: update.version })
      case 'available':
        return t('update.available', { version: update.version })
      case 'error':
        return t('update.failed')
      default:
        return t('update.idle')
    }
  })()

  return (
    <Card number="06" label={t('settings.about.label')} title={t('settings.about.title')}>
      <div className="flex items-center justify-between gap-3 rounded-card border-ui border-soft px-2.5 py-2">
        <div>
          <div className="label-mono !text-[10px]">{t('settings.about.version')}</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold" dir="ltr">
            {info?.version ?? '—'}
          </div>
        </div>
        <Button disabled={busy} onClick={check}>
          {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {t('update.check')}
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-muted">{line}</p>
    </Card>
  )
}
