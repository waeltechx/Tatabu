import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import type { Application } from '@shared/applications'
import { activityBuckets, localDay, SPANS, type Bucket, type Span } from '@shared/activity'
import { usePrefs } from '@/lib/prefs'

const locale = (lang: string): string => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB')
const date = (iso: string): Date => new Date(`${iso}T00:00:00`)

/** Applications added over time: hover or focus a bar to read it, step back and forth through time. */
export function ActivityChart({ apps }: { apps: Application[] }) {
  const { t } = useTranslation()
  const { prefs } = usePrefs()
  const [span, setSpan] = useState<Span>('2w')
  const [back, setBack] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  const dates = useMemo(() => apps.map((a) => a.dateAdded), [apps])
  const buckets = useMemo(() => activityBuckets(dates, span, back), [dates, span, back])
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const sum = buckets.reduce((n, b) => n + b.count, 0)
  const top = buckets.reduce<Bucket | null>((best, b) => (b.count > (best?.count ?? 0) ? b : best), null)
  const unit = SPANS[span].unit
  const today = localDay(new Date())
  // Nothing older to see once the view lies wholly before the first application.
  const oldest = dates.reduce((min, d) => (d < min ? d : min), dates[0] ?? '')
  const canGoBack = !!oldest && localDay(new Date(oldest)) < buckets[0]!.from

  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(locale(prefs.language), opts).format(date(iso))
  const short = (iso: string): string => fmt(iso, { day: 'numeric', month: 'short' })
  const label = (b: Bucket): string =>
    unit === 'day'
      ? fmt(b.from, { weekday: 'long', day: 'numeric', month: 'long' })
      : unit === 'week'
        ? `${short(b.from)} – ${short(b.to)}`
        : fmt(b.from, { month: 'long', year: 'numeric' })
  const tick = (b: Bucket): string => (unit === 'month' ? fmt(b.from, { month: 'short' }) : short(b.from))
  const range = `${fmt(buckets[0]!.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(buckets.at(-1)!.to, { day: 'numeric', month: 'short', year: 'numeric' })}`

  const shown = active !== null ? buckets[active] : null
  const change = (next: Span): void => {
    setSpan(next)
    setBack(0)
    setActive(null)
  }
  const step = (delta: number): void => {
    setBack((b) => Math.max(0, b + delta))
    setActive(null)
  }
  // Which bars get a date under them: first, last and a few in between.
  const every = Math.ceil(buckets.length / 7)

  return (
    <section className="min-w-0 rounded-card border-ui border-strong bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="me-auto font-head text-[15px] font-bold">{t('dash.activity')}</h2>
        <div className="flex rounded-card border-ui border-soft p-0.5" role="group" aria-label={t('dash.span')}>
          {(Object.keys(SPANS) as Span[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={span === s}
              onClick={() => change(s)}
              className={clsx(
                'h-6 cursor-pointer rounded-[5px] px-2 text-[11px] font-medium',
                span === s ? 'bg-ink text-surface' : 'text-muted hover:text-ink'
              )}
            >
              {t(`dash.spans.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex min-h-6 items-center gap-2">
        {/* Left is the past, like the chart itself, in both interface directions. */}
        <div className="flex gap-1" dir="ltr">
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!canGoBack}
            title={canGoBack ? t('dash.earlier') : t('dash.noEarlier')}
            aria-label={t('dash.earlier')}
            className="flex size-6 cursor-pointer items-center justify-center rounded-[5px] border-ui border-strong bg-surface hover:bg-field disabled:cursor-not-allowed disabled:border-soft disabled:text-muted"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={back === 0}
            title={t('dash.later')}
            aria-label={t('dash.later')}
            className="flex size-6 cursor-pointer items-center justify-center rounded-[5px] border-ui border-strong bg-surface hover:bg-field disabled:cursor-not-allowed disabled:border-soft disabled:text-muted"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {/* What the pointer (or keyboard focus) is on takes the range's place, so the chart needs no extra row. */}
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[12px]" aria-live="polite" dir="auto">
          {shown ? (
            <>
              <span
                className={clsx(
                  'size-2 shrink-0 rounded-[2px] border border-strong',
                  !shown.count ? 'bg-field' : shown === top ? 'bg-purple' : 'bg-yellow'
                )}
              />
              <b className="truncate font-semibold">{label(shown)}</b>
              <span className="text-muted">·</span>
              <span className="whitespace-nowrap">{t('dash.addedCount', { count: shown.count })}</span>
            </>
          ) : (
            <span className="truncate font-medium" title={t('dash.hoverHint')}>
              {range}
            </span>
          )}
        </span>
        {back > 0 && !shown && (
          <button
            type="button"
            onClick={() => step(-back)}
            className="cursor-pointer text-[11.5px] font-semibold text-ink underline"
          >
            {t('dash.backToToday')}
          </button>
        )}
        <span className="label-mono ms-auto">{t('dash.added', { count: sum })}</span>
      </div>

      <div className="mt-2 flex h-[88px] items-stretch gap-1" dir="ltr" onMouseLeave={() => setActive(null)}>
        {buckets.map((b, i) => {
          const on = active === i
          const isToday = unit === 'day' && b.from === today
          return (
            <button
              key={b.from}
              type="button"
              aria-label={`${label(b)}: ${t('dash.addedCount', { count: b.count })}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
              onKeyDown={(e) => {
                const move = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
                if (!move) return
                e.preventDefault()
                const next = (e.currentTarget.parentElement?.children[i + move] ?? null) as HTMLElement | null
                next?.focus()
              }}
              className={clsx(
                'group relative flex min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-0.5 rounded-[3px]',
                on && 'bg-field'
              )}
            >
              {b.count > 0 && buckets.length <= 31 && (
                <span className={clsx('font-mono text-[10px] leading-none', on ? 'font-semibold text-ink' : 'text-muted')}>
                  {b.count}
                </span>
              )}
              <span
                className={clsx(
                  'block w-full rounded-t-[3px] border-ui',
                  b.count === 0 ? 'border-soft bg-field' : b === top ? 'border-strong bg-purple' : 'border-strong bg-yellow',
                  on && b.count === 0 && 'border-strong',
                  on && 'shadow-hard'
                )}
                style={{
                  height: b.count ? `${Math.max(6, (b.count / max) * 62)}px` : '3px'
                }}
              />
              <span className={clsx('h-[3px] w-full rounded-full', isToday ? 'bg-ink' : 'bg-transparent')} />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1 font-mono text-[10px] text-muted" dir="ltr">
        {buckets.map((b, i) => (
          <span key={b.from} dir="auto" className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {unit === 'day' && b.from === today ? t('dash.today') : i % every === 0 && i < buckets.length - 2 ? tick(b) : ''}
          </span>
        ))}
      </div>
    </section>
  )
}
