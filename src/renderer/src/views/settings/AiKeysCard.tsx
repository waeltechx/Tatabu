import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Image, LoaderCircle, Mic, TriangleAlert } from 'lucide-react'
import { clsx } from 'clsx'
import { ALT_PROVIDERS, type AltProvider, type SettingsView } from '@shared/settings'
import { PROVIDER_NAMES, textProvider, type ProviderId } from '@shared/ai'
import { errorCode, invoke, keys, useModels, useWrite } from '@/lib/api'
import { Button, Card, Chip, FieldLabel, inputClass, Segmented, Switch } from '@/components/ui'
import { KeyField } from '@/components/KeyField'
import { MicButton } from '@/components/MicButton'

const KEY_PAGES: Record<AltProvider, { host: string; url: string; placeholder: string }> = {
  gemini: {
    host: 'aistudio.google.com',
    url: 'https://aistudio.google.com/apikey',
    placeholder: 'AIza…'
  },
  openai: {
    host: 'platform.openai.com',
    url: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-…'
  },
  openrouter: {
    host: 'openrouter.ai',
    url: 'https://openrouter.ai/keys',
    placeholder: 'sk-or-…'
  }
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2" dir="ltr">
      {children}
    </a>
  )
}

/** "Test" for one provider. The result lands in settings (chips); a failure stays on the mutation. */
function useProviderTest(provider: ProviderId, keyMask: string) {
  const client = useQueryClient()
  const test = useMutation({
    mutationFn: () => invoke('ai:test', provider),
    onSuccess: (view) => {
      client.setQueryData(keys.settings, view)
      void client.invalidateQueries({ queryKey: keys.models(provider) })
    }
  })
  const { reset } = test
  // A new key starts with a clean slate: no old error, no old model list.
  useEffect(() => {
    reset()
    client.removeQueries({ queryKey: keys.models(provider) })
  }, [keyMask, provider, reset, client])
  return test
}

function TestButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button onClick={onClick} disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" />}
      {pending ? t('settings.ai.testing') : t('settings.ai.test')}
    </Button>
  )
}

/** Connected / error / saved, then the image chip when this provider does the text work. */
function StatusChips({
  provider,
  settings,
  error,
  children
}: {
  provider: ProviderId
  settings: SettingsView
  error: unknown
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const check = settings.checks[provider]
  const code = error ? errorCode(error) : null
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {error ? (
        <Chip tone="pink" icon={<TriangleAlert />}>
          {code ? t(`errors.${code}`) : t('errors.generic')}
        </Chip>
      ) : check ? (
        <span title={check.model}>
          <Chip tone="green" icon={<Check />}>
            {t('settings.ai.connected')}
          </Chip>
        </span>
      ) : (
        <Chip tone="green" icon={<Check />}>
          {t('settings.ai.saved')}
        </Chip>
      )}
      {children}
      {!error &&
        check &&
        textProvider(settings) === provider &&
        (check.visionModel ? (
          <span title={check.visionModel}>
            <Chip tone="blue" icon={<Image />}>
              {t('settings.ai.vision')}
            </Chip>
          </span>
        ) : (
          <Chip tone="pink" icon={<TriangleAlert />}>
            {t('settings.ai.noVision')}
          </Chip>
        ))}
    </div>
  )
}

function ModelSelect({ provider, settings }: { provider: AltProvider; settings: SettingsView }) {
  const { t } = useTranslation()
  const setAi = useWrite(keys.settings, (patch: Partial<SettingsView['ai']>) => invoke('settings:setAi', patch))
  const { data: models, isLoading, isError } = useModels(provider, settings.keys[provider].set)
  const value = settings.ai.altModel
  const check = settings.checks[provider]
  const auto = check && !value ? t('settings.ai.modelAuto', { model: check.model }) : t('settings.ai.modelAutoPlain')
  const list = models ?? []
  const options = value && !list.some((m) => m.id === value) ? [{ id: value, vision: null }, ...list] : list

  return (
    <>
      <FieldLabel htmlFor="alt-model">{t('settings.ai.model')}</FieldLabel>
      <div className="relative">
        <select
          id="alt-model"
          dir="ltr"
          value={value}
          disabled={!settings.keys[provider].set || setAi.isPending}
          onChange={(e) => setAi.mutate([{ altModel: e.target.value }])}
          className={clsx(inputClass, 'cursor-pointer appearance-none pe-9 font-mono text-[12px] disabled:cursor-not-allowed')}
        >
          <option value="">{auto}</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.vision ? `${m.id} · ${t('settings.ai.readsImages')}` : m.id}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute end-[11px] top-1/2 -translate-y-1/2 text-muted" />
      </div>
      {(isLoading || isError) && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          {isLoading ? t('settings.ai.modelsLoading') : t('settings.ai.modelsFailed')}
        </p>
      )}
    </>
  )
}

function TryVoice() {
  const { t } = useTranslation()
  const [heard, setHeard] = useState('')
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3.5">
        <div>
          <b className="block text-[13px] font-semibold">{t('settings.ai.tryVoice')}</b>
          <span className="text-[11.5px] text-muted">{t('settings.ai.tryVoiceHint')}</span>
        </div>
        <MicButton onText={setHeard} />
      </div>
      {heard && (
        <p className="mt-2.5 rounded-card border-ui border-soft bg-field px-3 py-2 text-[12.5px] leading-relaxed">
          <span className="label-mono me-2">{t('settings.ai.heard')}</span>
          <span dir="auto">{heard}</span>
        </p>
      )}
    </div>
  )
}

export function AiKeysCard({ settings }: { settings: SettingsView }) {
  const { t } = useTranslation()
  const setAi = useWrite(keys.settings, (patch: Partial<SettingsView['ai']>) => invoke('settings:setAi', patch))
  const { ai, keys: keyStatus, secureStorage } = settings
  const groq = keyStatus.groq
  const alt = keyStatus[ai.altProvider]
  const altPage = KEY_PAGES[ai.altProvider]
  const groqTest = useProviderTest('groq', groq.masked)
  const altTest = useProviderTest(ai.altProvider, alt.masked)

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
        actions={<TestButton pending={groqTest.isPending} onClick={() => groqTest.mutate()} />}
      />
      {groq.set && (
        <StatusChips provider="groq" settings={settings} error={groqTest.error}>
          <Chip tone="yellow" icon={<Mic />}>
            {t('settings.ai.voice')}
          </Chip>
          {!ai.useAltText && <Chip tone="purple">{t('settings.ai.textAll')}</Chip>}
        </StatusChips>
      )}
      {groq.set ? (
        <TryVoice />
      ) : (
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          {t('settings.ai.getKey')} <ExternalLink href="https://console.groq.com/keys">console.groq.com</ExternalLink>
        </p>
      )}

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
            options={ALT_PROVIDERS.map((p) => ({
              value: p,
              label: PROVIDER_NAMES[p]
            }))}
          />
          <KeyField
            key={ai.altProvider}
            name={ai.altProvider}
            status={alt}
            label={`${t('settings.ai.apiKey')} · ${PROVIDER_NAMES[ai.altProvider]}`}
            placeholder={altPage.placeholder}
            disabled={!secureStorage}
            actions={<TestButton pending={altTest.isPending} onClick={() => altTest.mutate()} />}
          />
          {alt.set ? (
            <>
              <ModelSelect provider={ai.altProvider} settings={settings} />
              <StatusChips provider={ai.altProvider} settings={settings} error={altTest.error}>
                <Chip tone="purple">{t('settings.ai.textAll')}</Chip>
              </StatusChips>
            </>
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
