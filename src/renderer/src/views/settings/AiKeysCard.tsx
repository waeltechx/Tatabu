import { useTranslation } from 'react-i18next'
import { Check, Mic, TriangleAlert } from 'lucide-react'
import { ALT_PROVIDERS, type AltProvider, type SettingsView } from '@shared/settings'
import { invoke, keys, useWrite } from '@/lib/api'
import { Card, Chip, FieldLabel, Segmented, Switch } from '@/components/ui'
import { KeyField } from '@/components/KeyField'

const PROVIDER_NAMES: Record<AltProvider, string> = { gemini: 'Gemini', openai: 'OpenAI', openrouter: 'OpenRouter' }

const KEY_PAGES: Record<AltProvider, { host: string; url: string; placeholder: string }> = {
  gemini: { host: 'aistudio.google.com', url: 'https://aistudio.google.com/apikey', placeholder: 'AIza…' },
  openai: { host: 'platform.openai.com', url: 'https://platform.openai.com/api-keys', placeholder: 'sk-…' },
  openrouter: { host: 'openrouter.ai', url: 'https://openrouter.ai/keys', placeholder: 'sk-or-…' }
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2" dir="ltr">
      {children}
    </a>
  )
}

export function AiKeysCard({ settings }: { settings: SettingsView }) {
  const { t } = useTranslation()
  const setAi = useWrite(keys.settings, (patch: Partial<SettingsView['ai']>) => invoke('settings:setAi', patch))
  const { ai, keys: keyStatus, secureStorage } = settings
  const groq = keyStatus.groq
  const alt = keyStatus[ai.altProvider]
  const altPage = KEY_PAGES[ai.altProvider]

  return (
    <Card number="01" label={t('settings.ai.label')} title={t('settings.ai.title')} description={t('settings.ai.desc')}>
      {!secureStorage && (
        <div className="mb-2 flex items-start gap-2 rounded-card border-ui border-paper-ink bg-pink px-3 py-2.5 text-[12px] text-paper-ink">
          <TriangleAlert size={15} className="mt-px shrink-0" />
          {t('settings.ai.noSecureStorage')}
        </div>
      )}

      <KeyField
        name="groq"
        status={groq}
        label={t('settings.ai.groqKey')}
        placeholder="gsk_…"
        disabled={!secureStorage}
      />
      {groq.set && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Chip tone="green" icon={<Check />}>
            {t('settings.ai.saved')}
          </Chip>
          <Chip tone="yellow" icon={<Mic />}>
            {t('settings.ai.voice')}
          </Chip>
          {!ai.useAltText && <Chip tone="purple">{t('settings.ai.textAll')}</Chip>}
        </div>
      )}
      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        {t('settings.ai.getKey')} <ExternalLink href="https://console.groq.com/keys">console.groq.com</ExternalLink>
      </p>

      <div className="mt-5 mb-1 h-[1.5px] bg-soft" />
      <div className="mt-4 flex items-center justify-between gap-3.5">
        <div>
          <b className="block text-[13px] font-semibold">{t('settings.ai.altTitle')}</b>
          <span className="text-[11.5px] text-muted">{t('settings.ai.altDesc')}</span>
        </div>
        <Switch
          checked={ai.useAltText}
          onChange={(useAltText) => setAi.mutate([{ useAltText }])}
          label={t('settings.ai.altTitle')}
        />
      </div>

      {ai.useAltText && (
        <div className="mt-1.5">
          <FieldLabel>{t('settings.ai.provider')}</FieldLabel>
          <Segmented
            label={t('settings.ai.provider')}
            value={ai.altProvider}
            onChange={(altProvider) => setAi.mutate([{ altProvider }])}
            options={ALT_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
          />
          <KeyField
            key={ai.altProvider}
            name={ai.altProvider}
            status={alt}
            label={`${t('settings.ai.apiKey')} · ${PROVIDER_NAMES[ai.altProvider]}`}
            placeholder={altPage.placeholder}
            disabled={!secureStorage}
          />
          {alt.set ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Chip tone="green" icon={<Check />}>
                {t('settings.ai.saved')}
              </Chip>
              <Chip tone="purple">{t('settings.ai.textAll')}</Chip>
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] leading-snug text-muted">
              {t('settings.ai.getKeyAt')} <ExternalLink href={altPage.url}>{altPage.host}</ExternalLink>
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
