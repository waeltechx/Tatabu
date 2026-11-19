/**
 * "My design", measured: turns what a CV's PDF really contains (see `pdf/extract`)
 * into a document that flows like a web page but lands every line where the PDF
 * has it. Fonts, sizes, colours, spacing, rules and the photo are copied, not guessed;
 * only the text is replaced later (see `bind` and `render`).
 */
import type { RawFont, RawImage, RawPage, RawShape } from '../pdf/extract'
import { pageBands, pageLines, wordText, type Line, type Word } from '../pdf/lines'

export interface CloneStyle {
  family: string
  generic: 'sans-serif' | 'serif' | 'monospace'
  weight: number
  italic: boolean
  size: number
  color: string
  /** Letter-spacing in points. */
  tracking: number
  /** Whether letter pairs are pulled together (AV), as in the original. */
  kern: boolean
  /** The font's ascent and descent as fractions of the size (both positive). */
  asc: number
  desc: number
}

/**
 * How far below the top of a line its baseline sits, in points. The browser centres the
 * font's ascent + descent in the line height, after rounding both to whole pixels.
 */
export function baselineOffset(lh: number, style: Pick<CloneStyle, 'size' | 'asc' | 'desc'>): number {
  const px = (style.size * 96) / 72
  const asc = Math.round(style.asc * px)
  const desc = Math.round(style.desc * px)
  // Chromium rounds the half-leading down to a whole pixel.
  return (Math.floor((lh / 0.75 - (asc + desc)) / 2) + asc) * 0.75
}

/** Chromium lays out in 1/64 of a pixel: lengths on that grid add up without drifting. */
const q = (pt: number): number => (Math.round((pt / 0.75) * 64) / 64) * 0.75

export interface CloneRun {
  t: string
  /** Index into `CloneDoc.styles`. */
  s: number
}

export interface CloneCell {
  /** Left edge in points from the page's left edge. */
  x: number
  align: 'start' | 'end' | 'center' | 'justify'
  /** Line height in points. */
  lh: number
  /** The style most of the cell is written in. */
  s: number
  runs: CloneRun[]
  /** Lines it took in the original. */
  lines: number
  /** Pushes the cell down so its first baseline meets the row's. */
  mt: number
}

export interface CloneRow {
  kind: 'row'
  id: number
  x: number
  w: number
  /** Space above, in points (after the block before it). */
  gap: number
  h: number
  cells: CloneCell[]
  /** The first cell is a bullet or a number. */
  marker: boolean
  page: number
  top: number
  /** Blocks sharing a number stay on one page. */
  keep?: number
}

export interface CloneRule {
  kind: 'rule'
  id: number
  x: number
  w: number
  h: number
  color: string
  gap: number
  page: number
  top: number
  keep?: number
}

export type CloneBlock = CloneRow | CloneRule

export interface ClonePath {
  d: string
  fill: string
  stroke: string
  lw: number
  o: number
}

/** A drawing or picture that travels with the block it sits next to. */
export interface CloneGraphic {
  /** Block id, or -1 for something that repeats on every page (a full-height sidebar). */
  anchor: number
  x: number
  /** Top edge relative to the anchor's top (or to the page top when `anchor` is -1). */
  dy: number
  w: number
  h: number
  paths?: ClonePath[]
  img?: string
}

export interface CloneCol {
  x: number
  w: number
  blocks: CloneBlock[]
}

export interface CloneSection {
  /** Starts on a new page (pages with side-by-side columns keep their own page). */
  breakBefore: boolean
  cols: CloneCol[]
}

export interface CloneDoc {
  v: 1
  page: { w: number; h: number }
  margin: { top: number; bottom: number }
  /** Whether the original joins fi / fl into one shape; copied so lines stay as wide. */
  ligatures: boolean
  styles: CloneStyle[]
  sections: CloneSection[]
  graphics: CloneGraphic[]
  /** Font families the design uses, most used first. */
  fonts: string[]
  pages: number
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const median = (list: number[]): number => {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// --- fonts ----------------------------------------------------------------------------

const WEIGHTS: Array<[RegExp, number]> = [
  [/(extra|ultra)[\s-]?light/i, 200],
  [/(semi|demi)[\s-]?bold/i, 600],
  [/(extra|ultra)[\s-]?bold/i, 800],
  [/\bthin\b|hairline/i, 100],
  [/light/i, 300],
  [/medium/i, 500],
  [/black|heavy/i, 900],
  [/bold/i, 700]
]

/** Names as PDFs write them → the family a computer knows them by. */
const KNOWN: Array<[RegExp, string]> = [
  [/^arial\s?narrow/i, 'Arial Narrow'],
  [/^arial/i, 'Arial'],
  [/^helvetica\s?neue/i, 'Helvetica Neue'],
  [/^helvetica|^nimbus\s?sans|^liberation\s?sans/i, 'Arial'],
  [/^times|^nimbus\s?rom|^liberation\s?serif/i, 'Times New Roman'],
  [/^courier|^liberation\s?mono/i, 'Courier New'],
  [/^segoe\s?ui/i, 'Segoe UI'],
  [/^carlito/i, 'Calibri'],
  [/^caladea/i, 'Cambria'],
  [/^source\s?sans/i, 'Source Sans 3'],
  [/^(cm|lm|sf)(r|ss|bx|ti|sl|tt|roman|sans)\d*/i, 'Latin Modern Roman'],
  [/^latin\s?modern|^computer\s?modern/i, 'Latin Modern Roman']
]

/** "AAAAAA+FiraSans-SemiBold" → Fira Sans, 600, upright. */
export function parseFontName(name: string): { family: string; weight: number; italic: boolean } {
  let n = String(name ?? '')
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[^\w\s,+-]/g, ' ')
    .trim()
  const italic = /italic|oblique|\bit\b|-it$|kursiv/i.test(n)
  let weight = 400
  for (const [re, w] of WEIGHTS) {
    if (re.test(n)) {
      weight = w
      break
    }
  }
  n = n
    .replace(/[,-]/g, ' ')
    .replace(/(PS)?MT\b/g, ' ')
    .replace(/\bPS\b/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(
      /\b(extra|ultra|semi|demi)?[\s-]?(thin|hairline|light|regular|normal|roman|book|medium|bold|black|heavy|italic|oblique|it|kursiv)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
  const known = KNOWN.find(([re]) => re.test(n.replace(/\s/g, '')) || re.test(n))
  const family = (known ? known[1] : n).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 60)
  return { family, weight, italic }
}

// --- lines → cells --------------------------------------------------------------------

const BULLET = /^([-–—•·▪◦‣*■●○➢→✓»›▸►✔♦◆❖⁃∙]|\d{1,2}[.)]|[a-zA-Z][.)])$/

interface Piece {
  x0: number
  x1: number
  words: Word[]
}

interface PLine {
  line: Line
  pieces: Piece[]
  marker: boolean
  /** The last piece ends at the column's right edge after a wide gap. */
  tail: boolean
}

const gapBefore = (words: Word[], i: number): number => words[i]!.x0 - words[i - 1]!.x1

/** Splits each line of a column at tab stops, right-aligned tails and very wide gaps. */
function splitLines(lines: Line[], right: number): PLine[] {
  // A start position that several lines jump to is a tab stop (label | value).
  const starts = new Map<number, number>()
  /** Where the lines that jump to a start position end: all at the right edge means right-aligned text. */
  const ends = new Map<number, number[]>()
  const wide = (l: Line, i: number): boolean => gapBefore(l.words, i) >= Math.max(5, l.size * 0.75)
  for (const l of lines) {
    const seen = new Set<number>()
    for (let i = 1; i < l.words.length; i++) {
      if (!wide(l, i)) continue
      const key = Math.round(l.words[i]!.x0)
      if (!seen.has(key)) starts.set(key, (starts.get(key) ?? 0) + 1)
      seen.add(key)
      ends.set(key, [...(ends.get(key) ?? []), l.x1])
    }
  }
  const near = (x: number): number[] => [Math.round(x) - 1, Math.round(x), Math.round(x) + 1]
  const count = (x: number): number => near(x).reduce((n, k) => n + (starts.get(k) ?? 0), 0)
  // Dates of equal width start at the same place too, but they all end at the right edge: not a tab stop.
  const flushRight = (x: number): boolean => near(x).flatMap((k) => ends.get(k) ?? []).every((x1) => x1 >= right - 1.5)
  const isStop = (x: number): boolean => count(x) >= 2 && !flushRight(x)

  return lines.map((l) => {
    const words = l.words
    const marker = words.length > 1 && BULLET.test(wordText(words[0]!))
    const cuts = new Set<number>()
    if (marker) cuts.add(1)
    const gaps = words.slice(1).map((_, i) => gapBefore(words, i + 1))
    // A justified line stretches every gap alike: no columns in there.
    const even = gaps.length >= 3 && Math.max(...gaps) < Math.min(...gaps.filter((g) => g > 0.5), Infinity) * 2.2
    let lastWide = -1
    for (let i = 1; i < words.length; i++) {
      if (!wide(l, i) || (even && !isStop(words[i]!.x0))) continue
      lastWide = i
      if (isStop(words[i]!.x0) || gapBefore(words, i) >= l.size * 4) cuts.add(i)
    }
    let tail = false
    if (lastWide > 0 && l.x1 >= right - 1.5 && gapBefore(words, lastWide) >= l.size * 1.5 && !isStop(words[lastWide]!.x0)) {
      cuts.add(lastWide)
      tail = true
    }
    const pieces: Piece[] = []
    let cur: Word[] = []
    words.forEach((w, i) => {
      if (cuts.has(i) && cur.length) {
        pieces.push({ x0: cur[0]!.x0, x1: Math.max(...cur.map((c) => c.x1)), words: cur })
        cur = []
      }
      cur.push(w)
    })
    if (cur.length) pieces.push({ x0: cur[0]!.x0, x1: Math.max(...cur.map((c) => c.x1)), words: cur })
    return { line: l, pieces, marker, tail: tail && pieces.length > 1 }
  })
}

interface DraftCell {
  x: number
  /** Where its text may run to. */
  right: number
  end: boolean
  lines: Array<{ y: number; x0: number; x1: number; words: Word[] }>
}

interface DraftRow {
  cells: DraftCell[]
  marker: boolean
}

const dominantSize = (words: Word[]): number => {
  const by = new Map<number, number>()
  for (const w of words) for (const r of w.runs) by.set(r.size, (by.get(r.size) ?? 0) + r.text.length)
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
}

/** Lines → rows: a line that only exists because the one above was full joins its cell. */
function groupRows(plines: PLine[], right: number): DraftRow[] {
  const rows: DraftRow[] = []
  for (const pl of plines) {
    const y = pl.line.y
    const prev = rows.at(-1)
    if (prev && pl.pieces.length === 1 && !pl.marker) {
      const piece = pl.pieces[0]!
      const first = piece.words[0]!
      const cell = prev.cells.find((c, i) => {
        if (c.end || (prev.marker && i === 0)) return false
        const last = c.lines.at(-1)!
        const size = dominantSize(last.words)
        const dy = y - last.y
        // Same left edge (a hanging first line may set it), same text size, a normal line step…
        const sameX = Math.abs(piece.x0 - (c.lines.length > 1 ? c.lines[1]!.x0 : c.x)) <= 1.2
        const hanging = c.lines.length === 1 && prev.cells.length === 1 && Math.abs(piece.x0 - c.x) <= size * 3
        if (!sameX && !hanging) return false
        if (Math.abs(dominantSize(piece.words) - size) > 0.35) return false
        if (dy < size * 0.85 || dy > size * 2) return false
        if (c.lines.length > 1) {
          const pitch = c.lines[1]!.y - c.lines[0]!.y
          if (Math.abs(dy - pitch) > pitch * 0.14 + 0.8) return false
        }
        // …and the line above had no room left for this line's first word.
        return last.x1 + size * 0.2 + (first.x1 - first.x0) > c.right - 0.5
      })
      if (cell) {
        cell.lines.push({ y, x0: piece.x0, x1: piece.x1, words: piece.words })
        continue
      }
    }
    rows.push({
      marker: pl.marker,
      cells: pl.pieces.map((p, i) => {
        const next = pl.pieces[i + 1]
        const end = pl.tail && i === pl.pieces.length - 1
        // Text stops short of the next cell, or of the tail's left edge, or at the column's right edge.
        const limit = next ? next.x0 - (pl.tail && i === pl.pieces.length - 2 ? 6 : 2) : right
        return { x: p.x0, right: limit, end, lines: [{ y, x0: p.x0, x1: p.x1, words: p.words }] }
      })
    })
  }
  return rows
}

// --- building ---------------------------------------------------------------------------

interface Builder {
  styles: CloneStyle[]
  styleIndex: Map<string, number>
  fonts: RawFont[]
  usage: Map<string, number>
  /** Whether a font + size + colour is kerned in the original. */
  kern: Map<string, boolean>
  kernDefault: boolean
}

const kernKey = (g: { font: number; size: number; color: string }): string => `${g.font}|${Math.round(g.size * 20) / 20}|${g.color}`

function styleOf(b: Builder, run: Word['runs'][number]): number {
  const font = b.fonts[run.font]
  const parsed = parseFontName(font?.name ?? '')
  const generic: CloneStyle['generic'] = font?.mono ? 'monospace' : font?.serif ? 'serif' : 'sans-serif'
  const style: CloneStyle = {
    family: parsed.family,
    generic,
    weight: parsed.weight,
    italic: parsed.italic,
    // Sizes come through page transforms: 9.49 is 9.5.
    size: Math.round(run.size * 20) / 20,
    color: /^#[0-9a-f]{6}$/.test(run.color) ? run.color : '#000000',
    tracking: r2(run.tracking),
    kern: b.kern.get(kernKey(run)) ?? b.kernDefault,
    asc: Math.round((font?.ascent ?? 0.9) * 1000) / 1000,
    desc: Math.round(Math.abs(font?.descent ?? -0.25) * 1000) / 1000
  }
  const key = JSON.stringify(style)
  let idx = b.styleIndex.get(key)
  if (idx === undefined) {
    idx = b.styles.length
    b.styles.push(style)
    b.styleIndex.set(key, idx)
  }
  if (style.family) b.usage.set(style.family, (b.usage.get(style.family) ?? 0) + run.text.length)
  return idx
}

/** The words of a cell as styled runs, lines joined the way they were broken. */
function cellRuns(b: Builder, cell: DraftCell): CloneRun[] {
  const runs: CloneRun[] = []
  const push = (t: string, s: number): void => {
    const last = runs.at(-1)
    if (last && last.s === s) last.t += t
    else runs.push({ t, s })
  }
  cell.lines.forEach((ln, li) => {
    // A gap about twice the line's usual one was typed as two spaces: keep it.
    const gaps = ln.words.slice(1).map((w, i) => w.x0 - ln.words[i]!.x1)
    const usual = median(gaps)
    ln.words.forEach((w, wi) => {
      const gap = wi > 0 ? gaps[wi - 1]! : 0
      let glue = wi > 0 ? (gaps.length >= 3 && usual > 0.5 && gap >= usual * 1.7 ? ' '.repeat(Math.min(4, Math.round(gap / usual))) : ' ') : ''
      if (wi === 0 && li > 0) {
        // A word hyphenated at the line end continues without a space.
        const before = runs.at(-1)?.t ?? ''
        const broken = /[A-Za-zÀ-ÿ]{2}[-­‐]$/.test(before) && /^[a-zà-ÿ]/.test(wordText(w))
        if (broken && /­$/.test(before)) runs.at(-1)!.t = before.slice(0, -1)
        glue = broken ? '' : ' '
      }
      w.runs.forEach((r, ri) => push((ri === 0 ? glue : '') + r.text, styleOf(b, r)))
    })
  })
  return runs
}

interface PageBlocks {
  /** One entry per band; each band has one or two columns. */
  bands: Array<Array<{ x: number; w: number; blocks: CloneBlock[] }>>
  graphics: CloneGraphic[]
}

/** Moves an SVG path ("M1 2L3 4…": numbers always come as x y pairs). */
function shiftPath(d: string, dx: number, dy: number): string {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${r2(Number(x) + dx)} ${r2(Number(y) + dy)}`)
}

/** Shapes that are plain separators: thin, wide, horizontal. */
function ruleOf(sh: RawShape): { x: number; y: number; w: number; h: number; color: string } | null {
  const [x0, y0, x1, y1] = sh.box
  const w = x1 - x0
  if (sh.rect && sh.fill && y1 - y0 <= 3.2 && w >= 20) return { x: x0, y: y0, w, h: Math.max(0.25, y1 - y0), color: sh.fill }
  // A stroked straight line.
  if (!sh.fill && sh.stroke && y1 - y0 < 0.6 && w >= 20 && sh.lineWidth <= 3.2) {
    return { x: x0, y: (y0 + y1) / 2 - sh.lineWidth / 2, w, h: Math.max(0.25, sh.lineWidth), color: sh.stroke }
  }
  return null
}

function buildPage(b: Builder, page: RawPage, pageNo: number, nextId: () => number, ratio: (size: number) => number): PageBlocks {
  const lines = pageLines(page)
  const bands = pageBands(lines, page.width)
  const covered = (box: [number, number, number, number], seq: number, images: RawImage[]): boolean =>
    images.some((im) => im.seq > seq && box[0] >= im.x - 1 && box[2] <= im.x + im.w + 1 && box[1] >= im.y - 1 && box[3] <= im.y + im.h + 1)
  const area = page.width * page.height
  const shapes = page.shapes.filter((sh) => {
    const [x0, y0, x1, y1] = sh.box
    const white = (sh.fill === '#ffffff' || !sh.fill) && (!sh.stroke || sh.stroke === '#ffffff')
    if (white && (x1 - x0) * (y1 - y0) > area * 0.2) return false // the page's own background
    if (!sh.fill && !sh.stroke) return false
    return !covered(sh.box, sh.seq, page.images)
  })
  const rules = shapes.map((sh) => ({ sh, rule: ruleOf(sh) })).filter((r) => r.rule)
  const usedShapes = new Set<RawShape>()

  const out: PageBlocks = { bands: [], graphics: [] }
  for (const band of bands) {
    const cols: PageBlocks['bands'][number] = []
    for (const col of band.cols) {
      if (!col.lines.length) continue
      const right = Math.max(...col.lines.map((l) => l.x1))
      const left = Math.min(...col.lines.map((l) => l.x0))
      const drafts = groupRows(splitLines(col.lines, right), right)
      const blocks: CloneBlock[] = []
      for (const d of drafts) {
        const cells: CloneCell[] = []
        const offsets: number[] = []
        for (const c of d.cells) {
          const runs = cellRuns(b, c)
          const chars = new Map<number, number>()
          for (const r of runs) chars.set(r.s, (chars.get(r.s) ?? 0) + r.t.trim().length)
          const s = [...chars.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? 0
          const st = b.styles[s]!
          const pitches = c.lines.slice(1).map((l, i) => l.y - c.lines[i]!.y)
          const lh = q(Math.max(st.size, pitches.length ? median(pitches) : st.size * ratio(st.size)))
          // Justified: every line but the last runs to the right limit.
          const full = c.lines.slice(0, -1).every((l) => Math.abs(l.x1 - c.right) <= 1.2)
          const first = c.lines[0]!
          const centred =
            d.cells.length === 1 && c.lines.length === 1 && first.x0 - left > 12 && Math.abs((first.x0 + first.x1) / 2 - (left + right) / 2) <= 1.5
          cells.push({
            x: r2(centred ? left : c.x),
            align: c.end ? 'end' : centred ? 'center' : c.lines.length > 1 && full && c.right - c.x > 120 ? 'justify' : 'start',
            lh,
            s,
            runs,
            lines: c.lines.length,
            mt: 0
          })
          offsets.push(baselineOffset(lh, st))
        }
        const maxOff = Math.max(...offsets)
        cells.forEach((c, i) => (c.mt = q(maxOff - offsets[i]!)))
        const baseline = d.cells[0]!.lines[0]!.y
        const x = Math.min(...cells.map((c) => c.x))
        blocks.push({
          kind: 'row',
          id: nextId(),
          x: r2(x),
          w: r2(right - x),
          gap: 0,
          h: q(Math.max(...cells.map((c) => c.mt + c.lines * c.lh))),
          cells,
          marker: d.marker,
          page: pageNo,
          top: q(baseline - maxOff)
        })
      }
      // Rules between the lines of this column become blocks of their own.
      for (const { sh, rule } of rules) {
        if (!rule || usedShapes.has(sh)) continue
        const mid = rule.x + rule.w / 2
        if (mid < col.x0 || mid > col.x1) continue
        const cy = rule.y + rule.h / 2
        const throughText = col.lines.some((l) => cy > l.y - l.size * 0.8 && cy < l.y + l.size * 0.12 && rule.x < l.x1 && rule.x + rule.w > l.x0)
        if (throughText) continue
        usedShapes.add(sh)
        blocks.push({ kind: 'rule', id: nextId(), x: r2(rule.x), w: r2(rule.w), h: q(rule.h), color: rule.color, gap: 0, page: pageNo, top: q(rule.y) })
      }
      blocks.sort((a, z) => a.top - z.top)
      cols.push({ x: r2(col.x0), w: r2(col.x1 - col.x0), blocks })
    }
    if (cols.length) out.bands.push(cols)
  }

  // Everything else that was drawn travels with the nearest block.
  const all = out.bands.flatMap((cols) => cols.flatMap((c) => c.blocks))
  const anchorFor = (x0: number, x1: number, y0: number, y1: number): CloneBlock | null => {
    let best: CloneBlock | null = null
    let bestScore = Infinity
    const cy = (y0 + y1) / 2
    for (const blk of all) {
      const bx1 = blk.x + blk.w
      const overlapX = Math.min(x1, bx1) - Math.max(x0, blk.x) > -40
      const inside = cy >= blk.top && cy <= blk.top + blk.h
      const dist = inside ? 0 : Math.min(Math.abs(y0 - blk.top), Math.abs(cy - (blk.top + blk.h / 2)))
      const score = dist + (overlapX ? 0 : 200) + (blk.kind === 'rule' ? 30 : 0) + (y0 < blk.top - 2 && !inside ? 6 : 0)
      if (score < bestScore) {
        bestScore = score
        best = blk
      }
    }
    return best
  }
  const items: Array<{ box: [number, number, number, number]; seq: number; path?: ClonePath; img?: string }> = []
  for (const sh of shapes) {
    if (usedShapes.has(sh)) continue
    const pad = sh.stroke ? sh.lineWidth / 2 + 0.25 : 0
    items.push({
      box: [sh.box[0] - pad, sh.box[1] - pad, sh.box[2] + pad, sh.box[3] + pad],
      seq: sh.seq,
      path: { d: shiftPath(sh.d, -(sh.box[0] - pad), -(sh.box[1] - pad)), fill: sh.fill, stroke: sh.stroke, lw: sh.lineWidth, o: sh.opacity }
    })
  }
  for (const im of page.images) {
    if (im.src) items.push({ box: [im.x, im.y, im.x + im.w, im.y + im.h], seq: im.seq, img: im.src })
  }
  items.sort((a, z) => a.seq - z.seq)
  for (const it of items) {
    const [x0, y0, x1, y1] = it.box
    const tall = y1 - y0 >= page.height * 0.6
    const anchor = tall ? null : anchorFor(x0, x1, y0, y1)
    out.graphics.push({
      anchor: anchor ? anchor.id : -1,
      x: r2(x0),
      dy: r2(anchor ? y0 - anchor.top : y0),
      w: r2(x1 - x0),
      h: r2(y1 - y0),
      ...(it.path ? { paths: [it.path] } : {}),
      ...(it.img ? { img: it.img } : {})
    })
  }
  return out
}

export interface BuildResult {
  doc: CloneDoc
  /** Characters of text found; a scan has next to none. */
  chars: number
}

/** The whole document. Returns null when the PDF has too little real text to copy (a scan). */
export function buildClone(pages: RawPage[]): BuildResult | null {
  const usable = pages.filter((p) => p && p.width > 50 && p.height > 50).slice(0, 6)
  if (!usable.length) return null
  // Right-to-left scripts are stored letter by letter in drawing order: not copied this way yet.
  const letters = usable.flatMap((p) => p.glyphs.map((g) => g.ch)).join('')
  if ((letters.match(/[\u0590-\u08ff\ufb1d-\ufefc]/g) ?? []).length > letters.length * 0.2) return null
  const fonts: RawFont[] = []
  // Font indexes are per page: make them one list.
  const remapped = usable.map((p) => {
    const offset = fonts.length
    fonts.push(...p.fonts)
    return { ...p, glyphs: p.glyphs.map((g) => ({ ...g, font: g.font + offset })) }
  })
  const b: Builder = { styles: [], styleIndex: new Map(), fonts, usage: new Map(), kern: new Map(), kernDefault: true }

  // Does the original kern? Without kerning every letter starts exactly where the one before ends
  // (or at one steady distance, when the text is letter-spaced). Measured per style: a file can
  // kern its headings and not its body text.
  const lineGaps = new Map<string, number[]>()
  let joined = false
  let joinable = false
  remapped.forEach((p, pi) => {
    const gs = [...p.glyphs].sort((a, z) => a.y - z.y || a.x - z.x)
    for (let i = 1; i < gs.length; i++) {
      const a = gs[i - 1]!
      const g = gs[i]!
      if (g.ch.length > 1 || /[ﬀ-ﬆ]/.test(g.ch)) joined = true
      if (a.y !== g.y || a.font !== g.font || a.size !== g.size || a.color !== g.color || a.space || g.space) continue
      const gap = g.x - (a.x + a.adv)
      if (Math.abs(gap) > a.size * 0.25) continue
      if (a.ch === 'f' && /^[fil]$/.test(g.ch)) joinable = true
      const key = `${kernKey(a)}@${pi}:${a.y}`
      const list = lineGaps.get(key) ?? []
      list.push(gap)
      lineGaps.set(key, list)
    }
  })
  const stats = new Map<string, { pairs: number; moved: number }>()
  for (const [key, list] of lineGaps) {
    const usual = median(list)
    const k = key.slice(0, key.indexOf('@'))
    const st = stats.get(k) ?? { pairs: 0, moved: 0 }
    st.pairs += list.length
    st.moved += list.filter((gap) => Math.abs(gap - usual) > 0.03).length
    stats.set(k, st)
  }
  const total = [...stats.values()].reduce((t, st) => ({ pairs: t.pairs + st.pairs, moved: t.moved + st.moved }), { pairs: 0, moved: 0 })
  const usualKern = total.pairs < 200 || total.moved > total.pairs * 0.015
  for (const [k, st] of stats) b.kern.set(k, st.pairs < 40 ? (st.moved > 0 ? true : usualKern) : st.moved > st.pairs * 0.015)
  b.kernDefault = usualKern
  // "fi" written as two letters although the font could join them: the original has ligatures off.
  const ligatures = joined || !joinable

  // How tall a line is compared with its text: measured on paragraphs, used for single lines.
  const ratios: number[] = []
  for (const p of remapped) {
    const ls = pageLines(p)
    for (let i = 1; i < ls.length; i++) {
      const dy = ls[i]!.y - ls[i - 1]!.y
      const size = ls[i]!.size
      if (Math.abs(ls[i]!.size - ls[i - 1]!.size) < 0.3 && Math.abs(ls[i]!.x0 - ls[i - 1]!.x0) < 1 && dy > size && dy < size * 1.9) ratios.push(dy / size)
    }
  }
  const lineRatio = ratios.length >= 3 ? median(ratios) : 1.4
  let id = 0
  const built = remapped.map((p, i) => buildPage(b, p, i, () => id++, () => lineRatio))
  const chars = built.reduce(
    (n, pb) =>
      n +
      pb.bands.reduce(
        (m, cols) =>
          m + cols.reduce((k, c) => k + c.blocks.reduce((j, blk) => j + (blk.kind === 'row' ? blk.cells.reduce((q, cell) => q + cell.runs.reduce((z, r) => z + r.t.length, 0), 0) : 0), 0), 0),
        0
      ),
    0
  )
  if (chars < 150) return null

  const page = { w: usable[0]!.width, h: usable[0]!.height }
  const tops = built.map((pb) => Math.min(...pb.bands.flatMap((cols) => cols.flatMap((c) => c.blocks.map((blk) => blk.top))), Infinity))
  const bottoms = built.map((pb) => Math.max(...pb.bands.flatMap((cols) => cols.flatMap((c) => c.blocks.map((blk) => blk.top + blk.h))), 0))
  // The top margin is where later pages start: that is where text lands after a page break.
  const later = tops.slice(1).filter(Number.isFinite)
  const top = q(Math.max(0, Math.min(...(later.length ? later : tops.filter(Number.isFinite)), page.h * 0.25)))
  const room = bottoms.map((y) => page.h - y)
  const bottom = Math.max(0, Math.min(top, ...(room.length > 1 ? room.slice(0, -1) : room)))
  const multi = built.some((pb) => pb.bands.some((cols) => cols.length > 1))

  const sections: CloneSection[] = []
  const setGaps = (blocks: CloneBlock[], start: number): void => {
    let prevBottom = start
    for (const blk of blocks) {
      blk.gap = q(blk.top - prevBottom)
      prevBottom = blk.top + blk.h
    }
  }

  if (multi) {
    built.forEach((pb, pi) => {
      let y = top
      pb.bands.forEach((cols, bi) => {
        for (const c of cols) setGaps(c.blocks, y)
        y = Math.max(y, ...cols.flatMap((c) => c.blocks.map((blk) => blk.top + blk.h)))
        sections.push({ breakBefore: pi > 0 && bi === 0, cols: cols.map((c) => ({ x: c.x, w: c.w, blocks: c.blocks })) })
      })
    })
  } else {
    // One column all the way: the pages become one flow, so longer text moves on to the next page by itself.
    const flow: CloneBlock[] = []
    let keep = 0
    built.forEach((pb, pi) => {
      const blocks = pb.bands.flatMap((cols) => cols.flatMap((c) => c.blocks))
      setGaps(blocks, top)
      if (pi > 0 && blocks.length) {
        const first = blocks[0]!
        // Its natural gap: what the same kind of block has above it elsewhere.
        const alike = flow
          .filter((x, i) => i > 0 && x.kind === first.kind && (x.kind === 'rule' || (first.kind === 'row' && x.cells[0]!.s === first.cells[0]!.s)))
          .map((x) => x.gap)
        first.gap = q(alike.length ? median(alike) : first.h * 0.8)
        // The original moved these blocks to a new page although some room was left: they belong together.
        const free = page.h - bottom - bottoms[pi - 1]!
        let used = 0
        keep++
        for (const blk of blocks) {
          used += blk.gap + blk.h
          blk.keep = keep
          if (used > free) break
        }
      }
      flow.push(...blocks)
    })
    sections.push({ breakBefore: false, cols: [{ x: 0, w: page.w, blocks: flow }] })
  }

  const graphics = built.flatMap((pb, pi) => pb.graphics.map((g) => (g.anchor < 0 && pi > 0 ? null : g))).filter((g): g is CloneGraphic => !!g)
  const fontList = [...b.usage.entries()].sort((a, z) => z[1] - a[1]).map(([f]) => f)
  return {
    doc: { v: 1, page, margin: { top, bottom: q(bottom) }, ligatures, styles: b.styles, sections, graphics, fonts: fontList, pages: usable.length },
    chars
  }
}

/** Every block of a document, in reading order. */
export function cloneBlocks(doc: CloneDoc): CloneBlock[] {
  return doc.sections.flatMap((s) => s.cols.flatMap((c) => c.blocks))
}

export const cellText = (cell: CloneCell): string => cell.runs.map((r) => r.t).join('')
