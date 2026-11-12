import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Sun } from 'lucide-react'
import { usePrefs } from '@/lib/prefs'

interface PageHeaderProps {
  page: string
  actions?: ReactNode
}

export function PageHeader({ page, actions }: PageHeaderProps) {
  const { t } = useTranslation()
  const { prefs, resolvedTheme, setLanguage, setTheme } = usePrefs()

  return (
    <header className="mb-7 flex items-start justify-between gap-6">
      <div>
        <div className="label-mono !text-[11px]">{t(`pages.${page}.crumb`)}</div>
        <h1 className="mt-3 mb-2.5 font-head text-[38px] leading-tight font-bold">{t(`pages.${page}.title`)}</h1>
        <p className="text-[15px] text-muted">{t(`pages.${page}.sub`)}</p>
      </div>
      <div className="flex items-start gap-2.5">
        {actions}
        <button
          type="button"
          onClick={() => setLanguage(prefs.language === 'ar' ? 'en' : 'ar')}
          title={t('header.toggleLanguage')}
          aria-label={t('header.toggleLanguage')}
          className="flex h-11 min-w-11 items-center justify-center rounded-card border-ui border-strong bg-surface px-3 text-[13px] font-semibold"
        >
          {prefs.language === 'ar' ? 'EN' : 'ع'}
        </button>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          title={t('header.toggleTheme')}
          aria-label={t('header.toggleTheme')}
          className="flex size-11 items-center justify-center rounded-card border-ui border-strong bg-surface"
        >
          {resolvedTheme === 'dark' ? <Sun size={20} strokeWidth={1.8} /> : <Moon size={20} strokeWidth={1.8} />}
        </button>
      </div>
    </header>
  )
}
