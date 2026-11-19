import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { usePrefs } from '@/lib/prefs'

interface PageHeaderProps {
  page: string
  actions?: ReactNode
  /** Shows a Back button: goes back in the app's history, or to this path when there is none. */
  back?: string
}

export function PageHeader({ page, actions, back }: PageHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { prefs, resolvedTheme, setLanguage, setTheme } = usePrefs()
  // React Router keeps its own history index; 0 means the app was opened on this page.
  const goBack = (): void => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
    else navigate(back ?? '/')
  }

  return (
    <header className="mb-3.5 flex items-start justify-between gap-4">
      <div>
        {back !== undefined && (
          <button
            type="button"
            onClick={goBack}
            className="mb-1 -ms-1 flex cursor-pointer items-center gap-1 rounded-card px-1 py-0.5 text-[12px] font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden />
            {t('common.back')}
          </button>
        )}
        <div className="label-mono">{t(`pages.${page}.crumb`)}</div>
        <h1 className="mt-0.5 font-head text-[20px] leading-tight font-bold">{t(`pages.${page}.title`)}</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">{t(`pages.${page}.sub`)}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {actions}
        <button
          type="button"
          onClick={() => setLanguage(prefs.language === 'ar' ? 'en' : 'ar')}
          title={t('header.toggleLanguage')}
          aria-label={t('header.toggleLanguage')}
          className="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-card border-ui border-strong bg-surface px-2 text-[12px] font-semibold hover:bg-field"
        >
          {prefs.language === 'ar' ? 'EN' : 'ع'}
        </button>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          title={t('header.toggleTheme')}
          aria-label={t('header.toggleTheme')}
          className="flex size-8 cursor-pointer items-center justify-center rounded-card border-ui border-strong bg-surface hover:bg-field"
        >
          {resolvedTheme === 'dark' ? <Sun size={16} strokeWidth={1.9} /> : <Moon size={16} strokeWidth={1.9} />}
        </button>
      </div>
    </header>
  )
}
