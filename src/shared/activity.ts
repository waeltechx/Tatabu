/** The dashboard's "applications added" chart: how a stretch of time is cut into bars. */

/** How much time the chart shows at once, and what one bar stands for. */
export const SPANS = {
  '2w': { unit: 'day', bars: 14 },
  '1m': { unit: 'day', bars: 30 },
  '3m': { unit: 'week', bars: 13 },
  '1y': { unit: 'month', bars: 12 }
} as const
export type Span = keyof typeof SPANS

export interface Bucket {
  /** First and last day, as local "YYYY-MM-DD". */
  from: string
  to: string
  count: number
}

/** Local calendar day "YYYY-MM-DD". */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * The bars for one view. `back` moves the view into the past by whole views
 * (0 ends today). Weeks start on Monday; months are calendar months.
 */
export function activityBuckets(dates: string[], span: Span, back: number, now = new Date()): Bucket[] {
  const { unit, bars } = SPANS[span]
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: Bucket[] = []
  for (let i = bars - 1; i >= 0; i--) {
    const steps = i + Math.max(0, back) * bars
    let from: Date
    let to: Date
    if (unit === 'day') {
      from = to = addDays(today, -steps)
    } else if (unit === 'week') {
      const monday = addDays(today, -((today.getDay() + 6) % 7))
      from = addDays(monday, -7 * steps)
      to = addDays(from, 6)
    } else {
      from = new Date(today.getFullYear(), today.getMonth() - steps, 1)
      to = new Date(from.getFullYear(), from.getMonth() + 1, 0)
    }
    out.push({ from: localDay(from), to: localDay(to), count: 0 })
  }
  for (const iso of dates) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) continue
    const day = localDay(d)
    const hit = out.find((b) => day >= b.from && day <= b.to)
    if (hit) hit.count++
  }
  return out
}
