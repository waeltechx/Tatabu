/**
 * Glyphs → words → lines, in reading order. Works from positions only, so the text
 * comes out the way the page looks, not the way the file happens to store it.
 */
import type { RawGlyph, RawPage } from './extract'

export interface WordRun {
  text: string
  font: number
  size: number
  color: string
  /** Extra space between letters, in points (letter-spaced headings). */
  tracking: number
}

export interface Word {
  x0: number
  x1: number
  runs: WordRun[]
}

export interface Line {
  /** Baseline, in points from the top of the page. */
  y: number
  x0: number
  x1: number
  /** Largest font size on the line. */
  size: number
  words: Word[]
}

export const wordText = (w: Word): string => w.runs.map((r) => r.text).join('')
export const lineText = (l: Line): string => l.words.map(wordText).join(' ')

const median = (list: number[]): number => {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Glyphs painted before an image that now covers them (placeholders under a photo). */
function visibleGlyphs(page: RawPage): RawGlyph[] {
  if (!page.images.length) return page.glyphs
  return page.glyphs.filter(
    (g) =>
      !page.images.some(
        (im) => im.seq > g.seq && g.x >= im.x - 0.5 && g.x + g.adv <= im.x + im.w + 0.5 && g.y >= im.y && g.y - g.size * 0.5 <= im.y + im.h
      )
  )
}

/** The lines of a page, top to bottom; words left to right. */
export function pageLines(page: RawPage): Line[] {
  const glyphs = visibleGlyphs(page)
    .filter((g) => g.size > 0.5)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  if (!glyphs.length) return []
  // Baselines: glyphs within a hair of each other share a line.
  const rows: RawGlyph[][] = []
  let row: RawGlyph[] = []
  let rowY = -Infinity
  for (const g of glyphs) {
    if (!row.length || g.y - rowY > Math.max(0.6, Math.min(g.size, row[0]!.size) * 0.12)) {
      if (row.length) rows.push(row)
      row = []
      rowY = g.y
    }
    row.push(g)
  }
  if (row.length) rows.push(row)

  const lines: Line[] = []
  for (const r of rows) {
    r.sort((a, b) => a.x - b.x || a.seq - b.seq)
    // Letter-spacing per style on this line: the usual gap between neighbouring letters.
    const gapsByStyle = new Map<string, number[]>()
    const styleKey = (g: RawGlyph): string => `${g.font}|${g.size}|${g.color}`
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1]!
      const b = r[i]!
      if (a.space || b.space || styleKey(a) !== styleKey(b)) continue
      const gap = b.x - (a.x + a.adv)
      if (gap > -a.size * 0.2 && gap < a.size * 0.45) {
        const list = gapsByStyle.get(styleKey(a)) ?? []
        list.push(gap)
        gapsByStyle.set(styleKey(a), list)
      }
    }
    const tracking = new Map<string, number>()
    for (const [k, list] of gapsByStyle) {
      const size = Number(k.split('|')[1])
      const t = list.length >= 3 ? median(list) : 0
      // Wide tracking is kept as a share of the size (0.07em), so one heading style gets one value on every
      // line; slight tightening or loosening (a name set at -0.015em) is kept as measured.
      const em = t / size
      // Kerning moves single pairs; tracking moves nearly all of them by the same amount.
      const steady = list.length >= 6 && list.filter((g) => Math.abs(g - t) <= 0.012).length >= list.length * 0.8
      const value = Math.abs(em) >= 0.03 ? (Math.round(em * 100) / 100) * size : steady && Math.abs(t) >= 0.015 ? t : 0
      tracking.set(k, Math.round(value * 100) / 100)
    }

    const words: Word[] = []
    let word: Word | null = null
    let prev: RawGlyph | null = null
    const close = (): void => {
      if (word && word.runs.length) words.push(word)
      word = null
    }
    for (const g of r) {
      if (g.space) {
        close()
        prev = g
        continue
      }
      if (prev && !prev.space) {
        // The same letter drawn twice on the same spot is fake bold, not a double letter.
        if (prev.ch === g.ch && Math.abs(g.x - prev.x) < Math.max(0.3, prev.adv * 0.25)) continue
        const t = tracking.get(styleKey(prev)) ?? 0
        const gap = g.x - (prev.x + prev.adv)
        // Wider than any kerning: a word break even when the file wrote no space (justified lines often don't).
        const limit = Math.min(prev.size, g.size) * 0.17
        if (gap - t > limit || gap < -Math.max(prev.size, g.size) * 0.6) close()
      }
      const t = tracking.get(styleKey(g)) ?? 0
      if (!word) word = { x0: g.x, x1: g.x + g.adv, runs: [] }
      const last = word.runs.at(-1)
      if (last && last.font === g.font && last.size === g.size && last.color === g.color) last.text += g.ch
      else word.runs.push({ text: g.ch, font: g.font, size: g.size, color: g.color, tracking: t })
      word.x1 = Math.max(word.x1, g.x + g.adv)
      prev = g
    }
    close()
    if (!words.length) continue
    lines.push({
      y: r[0]!.y,
      x0: words[0]!.x0,
      x1: Math.max(...words.map((w) => w.x1)),
      size: Math.max(...words.flatMap((w) => w.runs.map((run) => run.size))),
      words
    })
  }
  return lines
}

// --- columns -------------------------------------------------------------------------

/** Parts of a line separated by a clearly wider gap than a space. */
export function linePieces(line: Line, minGap = 12): Array<{ x0: number; x1: number; words: Word[] }> {
  const out: Array<{ x0: number; x1: number; words: Word[] }> = []
  for (const w of line.words) {
    const last = out.at(-1)
    if (last && w.x0 - last.x1 < Math.max(minGap, line.size * 1.2)) {
      last.words.push(w)
      last.x1 = Math.max(last.x1, w.x1)
    } else out.push({ x0: w.x0, x1: w.x1, words: [w] })
  }
  return out
}

export interface Band {
  /** One entry for a plain band; two for side-by-side columns (left first). */
  cols: Array<{ x0: number; x1: number; lines: Line[] }>
}

/**
 * Splits a page into bands. A page is two columns when a vertical strip stays empty
 * while both sides have many lines of their own that do not share baselines (a table
 * shares them; columns do not).
 */
export function pageBands(lines: Line[], pageWidth: number): Band[] {
  const single = (ls: Line[]): Band => ({ cols: [{ x0: 0, x1: pageWidth, lines: ls }] })
  if (lines.length < 10) return [single(lines)]
  const minX = Math.min(...lines.map((l) => l.x0))
  const maxX = Math.max(...lines.map((l) => l.x1))
  const pieces = lines.map((l) => linePieces(l))

  // Candidate gutters: the middle of every wide gap, and just right of every short line.
  const candidates = new Set<number>()
  for (const ps of pieces) for (let i = 1; i < ps.length; i++) candidates.add(Math.round((ps[i - 1]!.x1 + ps[i]!.x0) / 2))
  let best: { c: number; score: number } | null = null
  for (const c of candidates) {
    if (c < minX + (maxX - minX) * 0.15 || c > minX + (maxX - minX) * 0.85) continue
    let left = 0
    let right = 0
    let both = 0
    let cross = 0
    for (const ps of pieces) {
      if (ps.some((p) => p.x0 < c - 3 && p.x1 > c + 3)) {
        cross++
        continue
      }
      const l = ps.some((p) => p.x1 <= c + 3)
      const r = ps.some((p) => p.x0 >= c - 3)
      if (l && r) both++
      else if (l) left++
      else if (r) right++
    }
    // Lines that live on one side only are what makes columns; rows of a table sit on both.
    if (left >= 5 && right >= 5 && left + right > both * 2 && cross <= lines.length * 0.4) {
      const score = left + right - cross - both
      if (!best || score > best.score) best = { c, score }
    }
  }
  if (!best) return [single(lines)]
  const c = best.c

  // Runs of lines that cross the gutter are full-width bands; the rest splits in two.
  const bands: Band[] = []
  let run: Line[] = []
  let runCross: boolean | null = null
  const flush = (): void => {
    if (!run.length) return
    if (runCross) bands.push(single(run))
    else {
      const leftLines: Line[] = []
      const rightLines: Line[] = []
      for (const l of run) {
        const lw = l.words.filter((w) => w.x1 <= c + 3)
        const rw = l.words.filter((w) => w.x0 >= c - 3)
        const part = (ws: Word[]): Line => ({ ...l, words: ws, x0: ws[0]!.x0, x1: Math.max(...ws.map((w) => w.x1)) })
        if (lw.length) leftLines.push(part(lw))
        if (rw.length) rightLines.push(part(rw))
      }
      if (leftLines.length && rightLines.length) {
        bands.push({ cols: [{ x0: 0, x1: c, lines: leftLines }, { x0: c, x1: pageWidth, lines: rightLines }] })
      } else bands.push(single(run))
    }
    run = []
  }
  lines.forEach((l, i) => {
    const crosses = pieces[i]!.some((p) => p.x0 < c - 3 && p.x1 > c + 3)
    if (runCross !== null && crosses !== runCross) flush()
    runCross = crosses
    run.push(l)
  })
  flush()
  return bands
}

// --- plain text ---------------------------------------------------------------------

/** A page as plain text in reading order: column by column, a blank line where the text pauses. */
export function pageText(page: RawPage): string {
  const out: string[] = []
  for (const band of pageBands(pageLines(page), page.width)) {
    for (const col of band.cols) {
      let prev: Line | null = null
      for (const line of col.lines) {
        if (prev && line.y - prev.y > Math.max(prev.size, line.size) * 2.1) out.push('')
        out.push(
          linePieces(line, 14)
            .map((p) => p.words.map(wordText).join(' '))
            .join('   ')
        )
        prev = line
      }
      out.push('')
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
