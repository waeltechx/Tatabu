import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { cn } from '@/lib/cn'
import { STATUSES, type Application, type Status } from '@shared/applications'
import { daysUntil, formatDate, STATUS_TONE, useApps, useSetup, useUpdateApp } from '@/lib/apps'
import { usePrefs } from '@/lib/prefs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, inputClass } from '@/components/ui'
import { StatusSelect } from '@/components/apps/StatusSelect'
import { ActivityChart } from './ActivityChart'

const STATUS_FILL: Record<Status, string> = {
  saved: 'var(--blue)',
  applied: 'var(--yellow)',
  interview: 'var(--purple)',
  offer: 'var(--green)',
  rejected: 'var(--pink)',
  withdrawn: '#e4e1d8'
}

function AddButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Button variant="primary" onClick={() => navigate('/applications/new')}>
      <Plus />
      {t('apps.add')}
    </Button>
  )
}

function StatCard({ label, value, note, tone }: { label: string; value: number; note: string; tone: string }) {
  return (
    <div className={clsx('min-w-0 rounded-card border-ui border-strong px-3 py-2.5 text-paper-ink', tone)}>
      <div className="label-mono truncate !text-[#4a4a4a]">{label}</div>
      {/* Number and its note share one line, so a tile stays about 60px tall. */}
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-head text-[22px] leading-none font-bold tabular-nums" dir="ltr">
          {value}
        </span>
        <span className="min-w-0 truncate text-[11.5px]" title={note}>
          {note}
        </span>
      </div>
    </div>
  )
}

/** A donut of applications by status, drawn with stroke dashes. */
function StatusDonut({ apps }: { apps: Application[] }) {
  const { t } = useTranslation()
  const counts = STATUSES.map((s) => ({
    status: s,
    count: apps.filter((a) => a.status === s).length
  }))
  const total = apps.length
  const r = 54
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <section className="min-w-0 rounded-card border-ui border-strong bg-surface p-3">
      <h2 className="font-head text-[15px] font-bold">{t('dash.byStatus')}</h2>
      <div className="mt-2 flex items-center gap-4">
        <svg width="112" height="112" viewBox="0 0 148 148" role="img" aria-label={t('dash.byStatus')} className="shrink-0">
          <circle cx="74" cy="74" r={r} fill="none" stroke="var(--soft)" strokeWidth="22" />
          {counts
            .filter((x) => x.count)
            .map(({ status, count }) => {
              const len = (count / total) * c
              const el = (
                <circle
                  key={status}
                  cx="74"
                  cy="74"
                  r={r}
                  fill="none"
                  stroke={STATUS_FILL[status]}
                  strokeWidth="22"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 74 74)"
                />
              )
              offset += len
              return el
            })}
          <circle cx="74" cy="74" r={r - 11} fill="none" stroke="var(--strong)" strokeWidth="1.5" />
          <circle cx="74" cy="74" r={r + 11} fill="none" stroke="var(--strong)" strokeWidth="1.5" />
          <text x="74" y="72" textAnchor="middle" className="fill-ink font-head text-[26px] font-bold">
            {total}
          </text>
          <text x="74" y="92" textAnchor="middle" className="fill-muted text-[10px]">
            {t('dash.total')}
          </text>
        </svg>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {counts.map(({ status, count }) => (
            <li key={status} className="flex items-center gap-2 text-[12px]">
              <span className={clsx('size-2.5 shrink-0 rounded-[2px] border border-paper-ink', STATUS_TONE[status])} />
              <span className="min-w-0 flex-1 truncate">{t(`status.${status}`)}</span>
              <b className="font-mono font-medium tabular-nums" dir="ltr">
                {count}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Deadline({ iso }: { iso: string }) {
  const { prefs } = usePrefs()
  const days = daysUntil(iso)
  if (!iso) return <span className="text-muted">—</span>
  return (
    <span
      className={clsx(
        days !== null && days < 0 && 'text-muted line-through',
        days !== null && days >= 0 && days <= 7 && 'font-semibold text-[#c2410c] dark:text-[#fb923c]'
      )}
    >
      {formatDate(iso, prefs.language)}
    </span>
  )
}

function ApplicationsTable({ apps }: { apps: Application[] }) {
  const { t } = useTranslation()
  const { prefs } = usePrefs()
  const navigate = useNavigate()
  const update = useUpdateApp()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | ''>('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter(
      (a) =>
        (!status || a.status === status) &&
        (!q || [a.company, a.jobTitle, a.location].some((v) => v.toLowerCase().includes(q)))
    )
  }, [apps, query, status])

  return (
    <section className="rounded-card border-ui border-strong bg-surface">
      <div className="flex items-center gap-2 border-b border-soft px-3 py-2">
        <h2 className="me-auto font-head text-[15px] font-bold">{t('dash.applications')}</h2>
        <div className="relative w-[220px] min-w-0">
          <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('dash.search')}
            aria-label={t('dash.search')}
            className={cn(inputClass, 'h-7 ps-8 text-[12px]')}
          />
        </div>
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
            aria-label={t('dash.filterStatus')}
            className={cn(inputClass, 'h-7 w-[150px] cursor-pointer appearance-none pe-8 text-[12px]')}
          >
            <option value="">{t('dash.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="label-mono text-start">
              <th className="w-12 px-3 py-1.5 text-start font-normal">#</th>
              <th className="px-2 py-1.5 text-start font-normal">{t('dash.colRole')}</th>
              <th className="px-2 py-1.5 text-start font-normal">{t('apps.location')}</th>
              <th className="px-2 py-1.5 text-start font-normal">{t('apps.status')}</th>
              <th className="px-2 py-1.5 text-start font-normal">{t('apps.deadline')}</th>
              <th className="px-3 py-1.5 text-start font-normal">{t('dash.colAdded')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr
                key={a.id}
                onClick={() => navigate(`/applications/${a.id}`)}
                className="cursor-pointer border-t border-soft hover:bg-field"
              >
                <td className="px-3 py-1 font-mono text-[11.5px] text-muted tabular-nums" dir="ltr">
                  {String(a.number).padStart(3, '0')}
                </td>
                {/* Company and role on one line: the row stays one line tall. */}
                <td className="max-w-0 px-2 py-1">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <Link
                      to={`/applications/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 truncate font-semibold text-ink no-underline"
                      dir="auto"
                    >
                      {a.company || t('apps.noCompany')}
                    </Link>
                    {a.jobTitle && (
                      <span className="min-w-0 truncate text-muted" dir="auto" title={a.jobTitle}>
                        · {a.jobTitle}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1 whitespace-nowrap text-muted" dir="auto">
                  {a.location || '—'}
                </td>
                <td className="px-2 py-1">
                  <StatusSelect value={a.status} onChange={(s) => update.mutate({ id: a.id, patch: { status: s } })} />
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <Deadline iso={a.deadline} />
                </td>
                <td className="px-3 py-1 whitespace-nowrap text-muted">{formatDate(a.dateAdded, prefs.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="px-3 py-6 text-center text-[12.5px] text-muted">{t('dash.noMatch')}</p>}
    </section>
  )
}

function SetupChecklist() {
  const { t } = useTranslation()
  const { data } = useSetup()
  const items = [
    { key: 'groq', done: !!data?.groq, to: '/settings' },
    { key: 'profile', done: !!data?.profile, to: '/profile' },
    { key: 'cv', done: !!data?.cv, to: '/cv/master' },
    { key: 'referees', done: !!data?.referees, to: '/settings' }
  ] as const
  const doneCount = items.filter((i) => i.done).length
  return (
    <section className="rounded-card border-ui border-strong bg-surface p-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-head text-[15px] font-bold">{t('setup.title')}</h2>
        <span className="label-mono" dir="ltr">
          {doneCount} / {items.length}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">{t('setup.sub')}</p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="flex items-center gap-2.5 rounded-card border-ui border-soft px-2.5 py-1.5 text-ink no-underline hover:border-strong"
            >
              <span
                className={clsx(
                  'flex size-6 shrink-0 items-center justify-center rounded-[5px] border-ui border-strong font-mono text-[10.5px]',
                  item.done ? 'bg-green text-paper-ink' : 'bg-surface'
                )}
                dir="ltr"
              >
                {item.done ? <Check size={13} /> : `0${i + 1}`}
              </span>
              <div className="min-w-0 flex-1">
                <b
                  className={clsx('block text-[12.5px] leading-snug font-semibold', item.done && 'text-muted line-through')}
                >
                  {t(`setup.${item.key}`)}
                </b>
                <span className="block truncate text-[11.5px] leading-snug text-muted">{t(`setup.${item.key}Desc`)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EmptyDashboard() {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,340px)] items-start gap-3">
      <section className="rounded-card border-ui border-strong bg-yellow p-5 text-paper-ink">
        <div className="label-mono !text-[#4a4a4a]">{t('dash.emptyKicker')}</div>
        <h2 className="mt-2 max-w-[460px] font-head text-[22px] leading-tight font-bold whitespace-pre-line">
          {t('dash.emptyTitle')}
        </h2>
        <p className="mt-2 max-w-[460px] text-[12.5px] leading-relaxed">{t('dash.emptySub')}</p>
        <div className="mt-4">
          <Link
            to="/applications/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-card border-ui border-paper-ink bg-[#fffdf9] px-3 text-[12.5px] font-semibold text-paper-ink no-underline shadow-hard"
          >
            <Plus size={14} />
            {t('dash.emptyCta')}
          </Link>
        </div>
      </section>
      <SetupChecklist />
    </div>
  )
}

/** The dashboard's shape while applications load, so the page doesn't jump when they arrive. */
function DashboardSkeleton() {
  const block = 'animate-pulse rounded-card border-ui border-soft bg-surface motion-reduce:animate-none'
  return (
    <>
      <PageHeader page="dashboard" />
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(block, 'h-[58px]')} />
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3">
          <div className={cn(block, 'h-[160px]')} />
          <div className={cn(block, 'h-[160px]')} />
        </div>
        <div className={cn(block, 'h-[240px]')} />
      </div>
    </>
  )
}

export function DashboardView() {
  const { t } = useTranslation()
  const { data: apps = [], isPending } = useApps()

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000
    return {
      total: apps.length,
      week: apps.filter((a) => new Date(a.dateAdded).getTime() >= weekAgo).length,
      active: apps.filter((a) => a.status === 'applied' || a.status === 'interview').length,
      interviews: apps.filter((a) => a.status === 'interview').length,
      offers: apps.filter((a) => a.status === 'offer').length,
      soon: apps.filter((a) => {
        const d = daysUntil(a.deadline)
        return d !== null && d >= 0 && d <= 7 && a.status === 'saved'
      }).length
    }
  }, [apps])

  if (isPending) return <DashboardSkeleton />

  return (
    <>
      <PageHeader page="dashboard" actions={apps.length > 0 && <AddButton />} />
      {apps.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatCard
              label={t('dash.statTotal')}
              value={stats.total}
              note={t('dash.statWeek', { count: stats.week })}
              tone="bg-yellow"
            />
            <StatCard label={t('dash.statActive')} value={stats.active} note={t('dash.statActiveNote')} tone="bg-blue" />
            <StatCard
              label={t('dash.statInterviews')}
              value={stats.interviews}
              note={t('dash.statOffers', { count: stats.offers })}
              tone="bg-purple"
            />
            <StatCard label={t('dash.statSoon')} value={stats.soon} note={t('dash.statSoonNote')} tone="bg-green" />
          </div>
          <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3">
            <StatusDonut apps={apps} />
            <ActivityChart apps={apps} />
          </div>
          <ApplicationsTable apps={apps} />
        </div>
      )}
    </>
  )
}
