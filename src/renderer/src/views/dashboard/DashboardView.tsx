import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { STATUSES, type Application, type Status } from '@shared/applications'
import { daysUntil, formatDate, localDay, STATUS_TONE, useApps, useSetup, useUpdateApp } from '@/lib/apps'
import { usePrefs } from '@/lib/prefs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, inputClass } from '@/components/ui'
import { StatusSelect } from '@/components/apps/StatusSelect'

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
    <div className={clsx('rounded-card border-ui border-strong px-5 py-4 text-paper-ink', tone)}>
      <div className="label-mono !text-[#4a4a4a]">{label}</div>
      <div className="mt-3 font-head text-[40px] leading-none font-bold" dir="ltr">
        {value}
      </div>
      <div className="mt-2 text-[12px]">{note}</div>
    </div>
  )
}

/** A donut of applications by status, drawn with stroke dashes. */
function StatusDonut({ apps }: { apps: Application[] }) {
  const { t } = useTranslation()
  const counts = STATUSES.map((s) => ({ status: s, count: apps.filter((a) => a.status === s).length }))
  const total = apps.length
  const r = 54
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <section className="rounded-card border-ui border-strong bg-surface px-6 py-5">
      <h2 className="font-head text-[18px] font-bold">{t('dash.byStatus')}</h2>
      <div className="mt-4 flex items-center gap-7">
        <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={t('dash.byStatus')} className="shrink-0">
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
        <ul className="flex flex-1 flex-col gap-2">
          {counts.map(({ status, count }) => (
            <li key={status} className="flex items-center gap-2.5 text-[12.5px]">
              <span className={clsx('size-3 rounded-[3px] border border-paper-ink', STATUS_TONE[status])} />
              <span className="flex-1">{t(`status.${status}`)}</span>
              <b className="font-mono font-medium" dir="ltr">
                {count}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Applications added per day over the last 14 days; the busiest day is purple. */
function LastTwoWeeks({ apps }: { apps: Application[] }) {
  const { t } = useTranslation()
  const { prefs } = usePrefs()
  const days = useMemo(() => {
    const list: { day: string; count: number }[] = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      list.push({ day: localDay(d), count: 0 })
    }
    for (const a of apps) {
      const hit = list.find((x) => x.day === localDay(new Date(a.dateAdded)))
      if (hit) hit.count++
    }
    return list
  }, [apps])
  const max = Math.max(1, ...days.map((d) => d.count))
  const top = days.reduce<(typeof days)[number] | null>((best, d) => (!best || d.count > best.count ? d : best), null)
  const sum = days.reduce((n, d) => n + d.count, 0)
  return (
    <section className="rounded-card border-ui border-strong bg-surface px-6 py-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-head text-[18px] font-bold">{t('dash.lastTwoWeeks')}</h2>
        <span className="label-mono">{t('dash.added', { count: sum })}</span>
      </div>
      <div className="mt-4 flex h-[130px] items-end gap-1.5" dir="ltr">
        {days.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            {d.count > 0 && (
              <span className="font-mono text-[10px]" dir="ltr">
                {d.count}
              </span>
            )}
            <div
              title={`${formatDate(d.day, prefs.language, false)} · ${d.count}`}
              className={clsx(
                'w-full rounded-t-[3px] border-ui border-strong',
                d.count === 0 ? 'border-soft bg-field' : d === top ? 'bg-purple' : 'bg-yellow'
              )}
              style={{ height: d.count ? `${Math.max(8, (d.count / max) * 100)}px` : '4px' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-muted" dir="ltr">
        <span>{formatDate(days[0]?.day ?? '', prefs.language, false)}</span>
        <span>{t('dash.today')}</span>
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
        (!status || a.status === status) && (!q || [a.company, a.jobTitle, a.location].some((v) => v.toLowerCase().includes(q)))
    )
  }, [apps, query, status])

  return (
    <section className="rounded-card border-ui border-strong bg-surface">
      <div className="flex items-center gap-3 border-b border-soft px-5 py-4">
        <h2 className="me-auto font-head text-[18px] font-bold">{t('dash.applications')}</h2>
        <div className="relative w-[260px]">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('dash.search')}
            aria-label={t('dash.search')}
            className={clsx(inputClass, 'h-[38px] ps-9')}
          />
        </div>
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
            aria-label={t('dash.filterStatus')}
            className={clsx(inputClass, 'h-[38px] w-[170px] cursor-pointer appearance-none pe-9')}
          >
            <option value="">{t('dash.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      </div>
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="label-mono text-start">
            <th className="w-14 px-5 py-3 text-start font-normal">#</th>
            <th className="px-3 py-3 text-start font-normal">{t('dash.colRole')}</th>
            <th className="px-3 py-3 text-start font-normal">{t('apps.location')}</th>
            <th className="px-3 py-3 text-start font-normal">{t('apps.status')}</th>
            <th className="px-3 py-3 text-start font-normal">{t('apps.deadline')}</th>
            <th className="px-5 py-3 text-start font-normal">{t('dash.colAdded')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((a) => (
            <tr
              key={a.id}
              onClick={() => navigate(`/applications/${a.id}`)}
              className="cursor-pointer border-t border-soft hover:bg-field"
            >
              <td className="px-5 py-3 font-mono text-muted" dir="ltr">
                {String(a.number).padStart(3, '0')}
              </td>
              <td className="px-3 py-3">
                <Link
                  to={`/applications/${a.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="block font-semibold text-ink no-underline"
                  dir="auto"
                >
                  {a.company || t('apps.noCompany')}
                </Link>
                <span className="text-muted" dir="auto">
                  {a.jobTitle}
                </span>
              </td>
              <td className="px-3 py-3 text-muted" dir="auto">
                {a.location || '—'}
              </td>
              <td className="px-3 py-3">
                <StatusSelect value={a.status} onChange={(s) => update.mutate({ id: a.id, patch: { status: s } })} />
              </td>
              <td className="px-3 py-3">
                <Deadline iso={a.deadline} />
              </td>
              <td className="px-5 py-3 text-muted">{formatDate(a.dateAdded, prefs.language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-muted">{t('dash.noMatch')}</p>}
    </section>
  )
}

function SetupChecklist() {
  const { t } = useTranslation()
  const { data } = useSetup()
  const items = [
    { key: 'groq', done: !!data?.groq, to: '/settings' },
    { key: 'profile', done: !!data?.profile, to: '/profile' },
    { key: 'cv', done: !!data?.cv, to: '/settings' },
    { key: 'referees', done: !!data?.referees, to: '/settings' }
  ] as const
  const doneCount = items.filter((i) => i.done).length
  return (
    <section className="rounded-card border-ui border-strong bg-surface px-6 py-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-head text-[20px] font-bold">{t('setup.title')}</h2>
        <span className="label-mono" dir="ltr">
          {doneCount} / {items.length}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">{t('setup.sub')}</p>
      <ul className="mt-5 flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="flex items-center gap-3.5 rounded-card border-ui border-soft px-4 py-3 text-ink no-underline hover:border-strong"
            >
              <span
                className={clsx(
                  'flex size-7 shrink-0 items-center justify-center rounded-[6px] border-ui border-strong font-mono text-[11px]',
                  item.done ? 'bg-green text-paper-ink' : 'bg-surface'
                )}
                dir="ltr"
              >
                {item.done ? <Check size={14} /> : `0${i + 1}`}
              </span>
              <div className="min-w-0 flex-1">
                <b className={clsx('block text-[13.5px] font-semibold', item.done && 'text-muted line-through')}>
                  {t(`setup.${item.key}`)}
                </b>
                <span className="text-[12px] text-muted">{t(`setup.${item.key}Desc`)}</span>
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
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,400px)] items-start gap-6">
      <section className="rounded-card border-ui border-strong bg-yellow px-9 py-10 text-paper-ink">
        <div className="label-mono !text-[#4a4a4a]">{t('dash.emptyKicker')}</div>
        <h2 className="mt-5 max-w-[520px] font-head text-[40px] leading-[1.1] font-bold whitespace-pre-line">
          {t('dash.emptyTitle')}
        </h2>
        <p className="mt-4 max-w-[480px] text-[14px] leading-relaxed">{t('dash.emptySub')}</p>
        <div className="mt-8">
          <Link
            to="/applications/new"
            className="inline-flex h-[44px] items-center gap-2 rounded-card border-ui border-paper-ink bg-[#fffdf9] px-4 text-[13px] font-semibold text-paper-ink no-underline shadow-hard"
          >
            <Plus size={16} />
            {t('dash.emptyCta')}
          </Link>
        </div>
      </section>
      <SetupChecklist />
    </div>
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

  if (isPending) return <PageHeader page="dashboard" />

  return (
    <>
      <PageHeader page="dashboard" actions={apps.length > 0 && <AddButton />} />
      {apps.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-4 gap-5">
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
          <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
            <StatusDonut apps={apps} />
            <LastTwoWeeks apps={apps} />
          </div>
          <ApplicationsTable apps={apps} />
        </div>
      )}
    </>
  )
}
