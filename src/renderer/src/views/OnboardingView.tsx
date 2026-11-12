import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Check, FileCheck2, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { usePrefs } from '@/lib/prefs'
import { invoke, keys, useLatestCv, useSettings, useWrite } from '@/lib/api'
import { Button, Chip, Segmented } from '@/components/ui'
import { KeyField } from '@/components/KeyField'

function StepCard({ n, title, desc, current, children }: { n: string; title: string; desc: string; current?: boolean; children: ReactNode }) {
  return (
    <section
      className={clsx(
        'flex min-h-[330px] flex-col rounded-card border-ui border-strong bg-surface px-[19px] py-5',
        current && 'shadow-[var(--sx)_4px_0_0_var(--shadow)]'
      )}
    >
      <div className="font-head text-[34px] leading-none font-bold" dir="ltr">
        {n}
      </div>
      <h2 className="mt-2.5 mb-1 font-head text-[19px] font-bold">{title}</h2>
      <p className="mb-[18px] text-[12.5px] leading-[1.45] text-muted">{desc}</p>
      {children}
    </section>
  )
}

function DoneBadge() {
  const { t } = useTranslation()
  return (
    <div className="mt-auto pt-3.5">
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
  const Arrow = prefs.language === 'ar' ? ArrowLeft : ArrowRight

  return (
    <div className="flex min-h-full flex-col items-center px-6 pt-[34px] pb-16">
      <div className="mb-[34px] flex w-full max-w-[1040px] items-center justify-between">
        <div>
          <div className="font-logo text-[27px] leading-tight font-bold">منصة تتبع</div>
          <div className="label-mono mt-1.5 !text-[12px] normal-case">{t('brand.tagline')}</div>
        </div>
      </div>

      <div className="mb-7 text-center">
        <div className="label-mono !text-[11px]">{t('onboarding.crumb')}</div>
        <h1 className="mt-3 mb-2.5 font-head text-[40px] leading-tight font-bold">{t('onboarding.title')}</h1>
        <p className="text-[15px] text-muted">{t('onboarding.sub')}</p>
      </div>

      <div className="grid w-full max-w-[1040px] grid-cols-3 gap-5">
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
          <label className="mt-4 mb-2 block text-[12px] font-semibold">{t('settings.look.theme')}</label>
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
          <p className="mt-3 text-[11.5px] leading-normal text-muted">
            {t('onboarding.howToGetKey')}{' '}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="font-semibold text-ink" dir="ltr">
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
            className="mt-1.5 flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-ui border-dashed border-muted bg-field p-4 text-center hover:border-strong"
          >
            {cv ? <FileCheck2 size={28} className="text-ink" /> : <Upload size={28} className="text-muted" />}
            <b className="text-[13px] break-all">{cv ? cv.filename : t('onboarding.chooseCv')}</b>
            <span className="text-[11.5px] text-muted">{cv ? t('onboarding.cvKept') : t('onboarding.cvTypes')}</span>
          </button>
          {cv ? (
            <DoneBadge />
          ) : cvSkipped ? (
            <p className="mt-3 text-center text-[11.5px] text-muted">{t('onboarding.skippedNote')}</p>
          ) : (
            <Button variant="ghost" className="mt-2 self-center" onClick={() => setCvSkipped(true)}>
              {t('onboarding.skip')}
            </Button>
          )}
        </StepCard>
      </div>

      <div className="mt-[26px] flex w-full max-w-[1040px] items-center justify-between gap-6">
        <span className="label-mono">{t('onboarding.privacy')}</span>
        <Button
          variant="primary"
          disabled={finish.isPending}
          onClick={() => finish.mutate([], { onSuccess: () => navigate('/', { replace: true }) })}
        >
          {t('onboarding.start')}
          <Arrow />
        </Button>
      </div>
    </div>
  )
}
