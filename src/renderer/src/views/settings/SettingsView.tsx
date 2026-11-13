import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSettings } from '@/lib/api'
import { AiKeysCard } from './AiKeysCard'
import { ReferencesCard } from './ReferencesCard'
import { AppearanceCard } from './AppearanceCard'
import { LanguagesCard } from './LanguagesCard'
import { StorageCard } from './StorageCard'
import { AboutCard } from './AboutCard'

export function SettingsView() {
  const { t } = useTranslation()
  const { data: settings } = useSettings()

  return (
    <>
      <PageHeader page="settings" />
      {settings && (
        <>
          <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-6">
            <div className="flex flex-col gap-6">
              <AiKeysCard settings={settings} />
              <ReferencesCard />
            </div>
            <div className="flex flex-col gap-6">
              <AppearanceCard />
              <LanguagesCard />
              <StorageCard settings={settings} />
              <AboutCard />
            </div>
          </div>
          <div className="mt-6 flex h-11 items-center gap-2 rounded-card border-ui border-paper-ink bg-green px-4 text-[12.5px] text-paper-ink">
            <Check size={15} />
            {t('settings.savedBar')}
          </div>
        </>
      )}
    </>
  )
}
