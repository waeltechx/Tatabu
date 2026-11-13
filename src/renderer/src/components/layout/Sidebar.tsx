import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, FileUser, IdCard, LayoutGrid, Mail, Settings, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

interface NavItem {
  to: string
  key: string
  icon: LucideIcon
  isNew?: boolean
}

const NAV: NavItem[] = [
  { to: '/', key: 'dashboard', icon: LayoutGrid },
  { to: '/cv', key: 'cvStudio', icon: FileUser, isNew: true },
  { to: '/cover-letter', key: 'coverLetter', icon: FileText },
  { to: '/reference', key: 'reference', icon: IdCard },
  { to: '/email', key: 'email', icon: Mail },
  { to: '/profile', key: 'profile', icon: UserRound },
  { to: '/settings', key: 'settings', icon: Settings }
]

export function Sidebar() {
  const { t } = useTranslation()
  // Applications live under the dashboard in the menu.
  const inApps = useLocation().pathname.startsWith('/applications')
  return (
    <aside className="flex min-h-full w-60 shrink-0 flex-col border-e border-strong bg-surface px-5 pt-[25px] pb-[22px]">
      <div className="ps-1 font-logo text-[27px] leading-tight font-bold">منصة تتبع</div>
      <div className="label-mono mx-[5px] mt-2.5 !text-[12px] normal-case">{t('brand.tagline')}</div>

      <div className="label-mono mx-1 mt-12 mb-3.5">{t('nav.workspace')}</div>
      <nav className="flex flex-col gap-3">
        {NAV.map(({ to, key, icon: Icon, isNew }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive: active }) => {
              const isActive = active || (to === '/' && inApps)
              return clsx(
                'flex h-[46px] items-center gap-3 rounded-card border-ui px-3.5 text-[14px] text-ink no-underline',
                isActive
                  ? 'border-strong bg-yellow font-semibold text-on-accent shadow-hard'
                  : 'border-transparent font-medium hover:bg-field'
              )
            }}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden />
            <span className="flex-1">{t(`nav.${key}`)}</span>
            {isNew && (
              <span className="rounded-[5px] border border-current px-1.5 py-px font-mono text-[9px] uppercase opacity-70">
                {t('nav.new')}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-card border-ui border-soft bg-bg px-3 py-3.5">
        <ShieldCheck size={22} strokeWidth={1.8} aria-hidden />
        <b className="mt-3 mb-2 block text-[13px] font-semibold">{t('privacy.title')}</b>
        <p className="text-[12px] leading-snug text-muted">{t('privacy.line1')}</p>
        <p className="text-[12px] leading-snug text-muted">{t('privacy.line2')}</p>
      </div>
      <div className="label-mono mt-6 normal-case">{t('privacy.footer')}</div>
    </aside>
  )
}
