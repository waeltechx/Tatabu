import { useTranslation } from 'react-i18next'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { usePrefs } from '@/lib/prefs'
import { invoke, keys, useErrorToast, useSettings } from '@/lib/api'
import { Card, FieldLabel, Segmented } from '@/components/ui'

export function AppearanceCard() {
  const { t } = useTranslation()
  const { prefs, setLanguage, setTheme } = usePrefs()
  const { data: settings } = useSettings()
  const client = useQueryClient()
  const onError = useErrorToast()
  return (
    <Card number="03" label={t('settings.look.label')} title={t('settings.look.title')}>
      <FieldLabel>{t('settings.look.appLanguage')}</FieldLabel>
      <Segmented
        label={t('settings.look.appLanguage')}
        value={prefs.language}
        onChange={setLanguage}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ar', label: 'العربية' }
        ]}
      />
      <FieldLabel>{t('settings.look.theme')}</FieldLabel>
      <Segmented
        label={t('settings.look.theme')}
        value={prefs.theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: t('settings.look.light'), icon: <Sun /> },
          { value: 'dark', label: t('settings.look.dark'), icon: <Moon /> },
          { value: 'system', label: t('settings.look.system'), icon: <Monitor /> }
        ]}
      />
      <FieldLabel>{t('settings.look.paper')}</FieldLabel>
      <Segmented
        label={t('settings.look.paper')}
        value={settings?.paper ?? 'A4'}
        onChange={(paper) =>
          invoke('settings:setPaper', paper)
            .then((v) => client.setQueryData(keys.settings, v))
            .catch(onError)
        }
        options={[
          { value: 'A4', label: 'A4' },
          { value: 'Letter', label: 'US Letter' }
        ]}
      />
    </Card>
  )
}
