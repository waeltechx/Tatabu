import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, FileCheck2, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { usePrefs } from '@/lib/prefs'
import { invoke, keys, useLatestCv, useSettings, useWrite } from '@/lib/api'
import { Button, Chip, Segmented } from '@/components/ui'
import { KeyField } from '@/components/KeyField'

function StepCard({
  n,
  title,
  desc,
  current,
  children
}: {
  n: string
  title: string
  desc: string
  current?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={clsx(
        'flex min-w-0 flex-col rounded-card border-ui border-strong bg-surface p-4',
        current && 'shadow-[var(--sx)_4px_0_0_var(--shadow)]'
      )}
    >
      <div className="font-head text-[22px] leading-none font-bold tabular-nums" dir="ltr">
        {n}
      </div>
      <h2 className="mt-2 mb-0.5 font-head text-[15px] leading-snug font-bold">{title}</h2>
      <p className="mb-3 text-[12px] leading-[1.45] text-muted">{desc}</p>
      {children}
    </section>
  )
}

function DoneBadge() {
  const { t } = useTranslation()
  return (
    <div className="mt-auto pt-3">
      <Chip tone="green" icon={<Check />}>
        {t('common.done')}
      </Chip>
    </div>
  )
}

export function OnboardingView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [cvSkipped, setCvSkipped] = useState(false)
  const { prefs, resolvedTheme, setLanguage, setTheme } = usePrefs()
  const { data: settings } = useSettings()
  const { data: cv } = useLatestCv()
  const importCv = useWrite(keys.latestCv, () => invoke('library:importCv'))
  const finish = useWrite(keys.settings, () => invoke('settings:completeOnboarding'))

  if (!settings) return null
  const groqDone = settings.keys.groq.set

  return (
    <div className="flex min-h-full flex-col items-center p-5 pb-8">
      <div className="mb-5 flex w-full max-w-[980px] items-center justify-between">
        <div>
          <div className="font-logo text-[22px] leading-tight font-bold">منصة تتبع</div>
          <div className="label-mono mt-1 !text-[11.5px] normal-case">{t('brand.tagline')}</div>
        </div>
      </div>

      <div className="mb-5 text-center">
        <div className="label-mono !text-[11px]">{t('onboarding.crumb')}</div>
        <h1 className="mt-1.5 mb-1 font-head text-[22px] leading-tight font-bold">{t('onboarding.title')}</h1>
        <p className="text-[13px] text-muted">{t('onboarding.sub')}</p>
      </div>

      <div className="grid w-full max-w-[980px] grid-cols-3 gap-3">
        <StepCard n="01" title={t('onboarding.step1')} desc={t('onboarding.step1Desc')}>
          <Segmented
            label={t('settings.look.appLanguage')}
            value={prefs.language}
            onChange={setLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ar', label: 'العربية' }
            ]}
          />
          <label className="mt-3 mb-1.5 block text-[12px] font-semibold">{t('settings.look.theme')}</label>
          <Segmented
            label={t('settings.look.theme')}
            value={resolvedTheme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t('settings.look.light') },
              { value: 'dark', label: t('settings.look.dark') }
            ]}
          />
          <DoneBadge />
        </StepCard>

        <StepCard n="02" title={t('onboarding.step2')} desc={t('onboarding.step2Desc')} current={!groqDone}>
          <KeyField
            name="groq"
            status={settings.keys.groq}
            label={t('settings.ai.groqKey')}
            placeholder="gsk_…"
            saveLabel={t('onboarding.connect')}
            compact
            disabled={!settings.secureStorage}
            className="[&>label]:!mt-0"
          />
          <p className="mt-2.5 text-[11.5px] leading-normal text-muted">
            {t('onboarding.howToGetKey')}{' '}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink"
              dir="ltr"
            >
              console.groq.com
            </a>{' '}
            <span dir="ltr">{t('onboarding.howToGetKeyTail')}</span>
          </p>
          {groqDone ? <DoneBadge /> : <div className="label-mono mt-auto pt-3">{t('onboarding.otherProvider')}</div>}
        </StepCard>

        <StepCard n="03" title={t('onboarding.step3')} desc={t('onboarding.step3Desc')} current={groqDone && !cv}>
          <button
            type="button"
            onClick={() => importCv.mutate([])}
            disabled={importCv.isPending}
            className="flex min-h-[112px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-ui border-dashed border-muted bg-field p-3 text-center hover:border-strong"
          >
            {cv ? <FileCheck2 size={22} className="text-ink" /> : <Upload size={22} className="text-muted" />}
            <b className="text-[12.5px] break-all">{cv ? cv.filename : t('onboarding.chooseCv')}</b>
            <span className="text-[11.5px] text-muted">{cv ? t('onboarding.cvKept') : t('onboarding.cvTypes')}</span>
          </button>
          {cv ? (
            <DoneBadge />
          ) : cvSkipped ? (
            <p className="mt-2.5 text-center text-[11.5px] text-muted">{t('onboarding.skippedNote')}</p>
          ) : (
            <Button variant="ghost" className="mt-2 self-center" onClick={() => setCvSkipped(true)}>
              {t('onboarding.skip')}
            </Button>
          )}
        </StepCard>
      </div>

      <div className="mt-4 flex w-full max-w-[980px] items-center justify-between gap-4">
        <span className="label-mono">{t('onboarding.privacy')}</span>
        <Button
          variant="primary"
          disabled={finish.isPending}
          onClick={() => finish.mutate([], { onSuccess: () => navigate('/', { replace: true }) })}
        >
          {t('onboarding.start')}
          <ArrowRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  )
}
