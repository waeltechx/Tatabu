import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BriefcaseBusiness,
  FileText,
  FileUser,
  IdCard,
  LayoutGrid,
  Mail,
  Settings,
  ShieldCheck,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import { clsx } from 'clsx'

interface NavItem {
  to: string
  key: string
  icon: LucideIcon
  isNew?: boolean
}

const NAV: NavItem[] = [
  { to: '/', key: 'dashboard', icon: LayoutGrid },
  { to: '/applications', key: 'applications', icon: BriefcaseBusiness },
  { to: '/cv', key: 'cvStudio', icon: FileUser, isNew: true },
  { to: '/cover-letter', key: 'coverLetter', icon: FileText },
  { to: '/reference', key: 'reference', icon: IdCard },
  { to: '/email', key: 'email', icon: Mail },
  { to: '/profile', key: 'profile', icon: UserRound },
  { to: '/settings', key: 'settings', icon: Settings }
]

export function Sidebar() {
  const { t } = useTranslation()
  const path = useLocation().pathname
  // The master CV is part of the profile.
  const inMaster = path.startsWith('/cv/master')
  return (
    // Sticky and as tall as the window, so the menu stays in reach on long pages.
    <aside className="sticky top-0 flex h-screen w-[200px] shrink-0 flex-col overflow-y-auto border-e border-strong bg-surface px-3 pt-4 pb-3">
      <div className="ps-1.5 font-logo text-[21px] leading-tight font-bold">منصة تتبع</div>
      <div className="label-mono mx-1.5 mt-1 !text-[11px] normal-case">{t('brand.tagline')}</div>

      <div className="label-mono mx-1.5 mt-6 mb-1.5">{t('nav.workspace')}</div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, key, icon: Icon, isNew }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive: active }) => {
              const isActive = (active && !(to === '/cv' && inMaster)) || (to === '/profile' && inMaster)
              return clsx(
                'flex h-8 items-center gap-2.5 rounded-card border-ui px-2.5 text-[13px] text-ink no-underline',
                isActive
                  ? 'border-strong bg-yellow font-semibold text-on-accent shadow-hard'
                  : 'border-transparent font-medium hover:bg-field'
              )
            }}
          >
            <Icon size={16} strokeWidth={1.9} aria-hidden />
            <span className="flex-1">{t(`nav.${key}`)}</span>
            {isNew && (
              <span className="rounded-[4px] border border-current px-1 font-mono text-[9px] leading-[14px] uppercase opacity-70">
                {t('nav.new')}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* The one place the app says it stays on this computer (the other screens no longer repeat it). */}
      <div
        className="mt-auto flex items-start gap-2 rounded-card border-ui border-soft bg-bg px-2.5 py-2"
        title={t('privacy.footer')}
      >
        <ShieldCheck size={16} strokeWidth={1.9} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <b className="block text-[12px] leading-snug font-semibold">{t('privacy.title')}</b>
          <p className="text-[11px] leading-snug text-muted">
            {t('privacy.line1')} {t('privacy.line2')}
          </p>
        </div>
      </div>
    </aside>
  )
}
