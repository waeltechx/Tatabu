import { useTranslation } from 'react-i18next'
import { Folder, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import type { SettingsView } from '@shared/settings'
import { applicationFolderName } from '@shared/folderName'
import { invoke, keys, useErrorToast, useWrite } from '@/lib/api'
import { Button, Card, FieldLabel } from '@/components/ui'

export function StorageCard({ settings }: { settings: SettingsView }) {
  const { t } = useTranslation()
  const onError = useErrorToast()
  const change = useWrite(keys.settings, () => invoke('storage:change'))
  const example = applicationFolderName(t('settings.storage.exampleCompany'), t('settings.storage.exampleTitle'))

  return (
    <Card number="05" label={t('settings.storage.label')} title={t('settings.storage.title')} tone="violet">
      <FieldLabel>{t('settings.storage.folder')}</FieldLabel>
      <div
        dir="ltr"
        title={settings.dataFolder}
        className="flex h-[42px] items-center overflow-hidden rounded-card border-ui border-paper-ink bg-[#fffdf9] px-[11px] font-mono text-[12px] whitespace-nowrap text-paper-ink"
      >
        <span className="truncate">{settings.dataFolder}</span>
      </div>
      <div className="mt-2.5 flex gap-2.5">
        <Button variant="primary" className="flex-1" onClick={() => invoke('storage:open').catch(onError)}>
          <FolderOpen />
          {t('settings.storage.open')}
        </Button>
        <Button
          variant="paper"
          disabled={change.isPending}
          onClick={() =>
            change.mutate([], {
              onSuccess: (result) => {
                if (result) toast.success(t('settings.storage.moved'))
              }
            })
          }
        >
          {t('settings.storage.change')}
        </Button>
      </div>
      <FieldLabel>{t('settings.storage.naming')}</FieldLabel>
      <div className="flex items-center gap-2.5 rounded-card border-ui border-dashed border-paper-ink p-3 text-[12.5px]">
        <Folder size={20} strokeWidth={1.8} className="shrink-0" />
        <code className="font-mono text-[12px] [unicode-bidi:isolate]">{example}</code>
      </div>
    </Card>
  )
}
