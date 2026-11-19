import { PageHeader } from '@/components/layout/PageHeader'
import { useSettings } from '@/lib/api'
import { AiKeysCard } from './AiKeysCard'
import { ReferencesCard } from './ReferencesCard'
import { AppearanceCard } from './AppearanceCard'
import { LanguagesCard } from './LanguagesCard'
import { StorageCard } from './StorageCard'
import { AboutCard } from './AboutCard'

export function SettingsView() {
  const { data: settings } = useSettings()

  return (
    <>
      <PageHeader page="settings" />
      {/* Every change saves on its own (with a toast), so there is no "saved" bar. Storage sits on the left so both
          columns end at about the same height. */}
      {settings && (
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-3">
          <div className="flex min-w-0 flex-col gap-3">
            <AiKeysCard settings={settings} />
            <ReferencesCard />
            <StorageCard settings={settings} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <AppearanceCard />
            <LanguagesCard />
            <AboutCard />
          </div>
        </div>
      )}
    </>
  )
}
