/**
 * "Same design, different words": finds where each fact of the master CV sits in the
 * measured design, then swaps in the tailored text. Lines the tailored CV leaves out
 * disappear, reordered bullets move, and everything that is not a fact (labels,
 * headings, rules, the photo) stays exactly where it was.
 */
import { cvFacts, type MasterCv } from '../cv'
import type { DocHtml } from '../docs/common'
import type { CvLabels, TailoredCv, TItem } from '../tailor'
import { cellText, type CloneBlock, type CloneCell, type CloneDoc, type CloneRow, type CloneRun } from './build'
import { cloneHtml } from './render'

// --- finding text -----------------------------------------------------------------------

interface Norm {
  s: string
  /** Position in the original text of each character of `s` (one extra entry for the end). */
  map: number[]
}

/** Lower case, single spaces, plain quotes and dashes: differences that are not differences. */
function norm(text: string): Norm {
  let s = ''
  const map: number[] = []
  let space = true
  for (let i = 0; i < text.length; i++) {
    let ch = text[i]!
    if (ch === '­' || ch === '​') continue
    if (/\s/.test(ch)) {
      if (space) continue
      space = true
      ch = ' '
    } else {
      space = false
      if (/[‘’ʼ′]/.test(ch)) ch = "'"
      else if (/[“”„«»]/.test(ch)) ch = '"'
      else if (/[‐-―−]/.test(ch)) ch = '-'
      else {
        const lower = ch.toLowerCase()
        if (lower.length === 1) ch = lower
      }
    }
    s += ch
    map.push(i)
  }
  if (s.endsWith(' ')) {
    s = s.slice(0, -1)
    map.pop()
  }
  map.push(text.length)
  return { s, map }
}

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch)
const words = (s: string): string[] => s.match(/[\p{L}\p{N}]+/gu) ?? []

export interface Hit {
  row: CloneRow
  cell: number
  start: number
  end: number
  /** The rest of a fact that runs on into the row's next cells (a title on the left, its dates on the right). */
  more?: Array<{ cell: number; start: number; end: number }>
}

const rowsOf = (doc: CloneDoc): CloneRow[] =>
  doc.sections.flatMap((s) => s.cols.flatMap((c) => c.blocks.filter((b): b is CloneRow => b.kind === 'row')))

const entryOf = (key: string): string => /^([a-z]+\d+)\./.exec(key)?.[1] ?? ''

/** The facts to look for: the master CV's, with each language split into its name and its level. */
export function bindableFacts(cv: MasterCv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(cvFacts(cv))) if (!k.startsWith('languages.')) out[k] = v
  cv.languages.forEach((l, i) => {
    if (l.name.trim()) out[`languages.${i}.name`] = l.name.trim()
    if (l.level.trim()) out[`languages.${i}.level`] = l.level.trim()
  })
  return out
}

/** Where each fact sits in the design. Long facts claim their place first; short ones take what is left. */
export function bindFacts(doc: CloneDoc, facts: Record<string, string>): Map<string, Hit> {
  const rows = rowsOf(doc)
  const order = new Map(rows.map((r, i) => [r, i]))
  const cells: Array<{ row: CloneRow; cell: number; n: Norm; taken: Array<[number, number]> }> = []
  for (const row of rows) {
    row.cells.forEach((c, i) => {
      if (row.marker && i === 0) return
      cells.push({ row, cell: i, n: norm(cellText(c)), taken: [] })
    })
  }
  const hits = new Map<string, Hit>()
  const entryRows = new Map<string, number[]>()
  const free = (c: (typeof cells)[number], a: number, b: number): boolean => c.taken.every(([x, y]) => b <= x || a >= y)
  const claim = (key: string, c: (typeof cells)[number], a: number, b: number): void => {
    c.taken.push([a, b])
    hits.set(key, { row: c.row, cell: c.cell, start: c.n.map[a]!, end: c.n.map[b - 1]! + 1 })
    const id = entryOf(key)
    if (id) entryRows.set(id, [...(entryRows.get(id) ?? []), order.get(c.row)!])
  }

  const list = Object.entries(facts)
    .map(([key, text]) => ({ key, needle: norm(text).s }))
    .filter((f) => f.needle.length > 0)
    .sort((a, b) => b.needle.length - a.needle.length)

  for (const f of list) {
    const found: Array<{ c: (typeof cells)[number]; at: number }> = []
    for (const c of cells) {
      let from = 0
      for (;;) {
        const at = c.n.s.indexOf(f.needle, from)
        if (at < 0) break
        from = at + 1
        const end = at + f.needle.length
        // Short facts ("2.1", "SQL") must stand as whole words.
        if (f.needle.length < 12 && (isWordChar(c.n.s[at - 1]) || isWordChar(c.n.s[end]))) continue
        if (free(c, at, end)) found.push({ c, at })
      }
    }
    if (!found.length) continue
    // Several places: the one closest to the rest of its entry (a town named in the header and under a job).
    const near = entryRows.get(entryOf(f.key))
    const best =
      near && found.length > 1
        ? found.reduce((p, x) => {
            const d = (y: typeof x): number => Math.min(...near.map((r) => Math.abs(r - order.get(y.c.row)!)))
            return d(x) < d(p) ? x : p
          })
        : found[0]!
    claim(f.key, best.c, best.at, best.at + f.needle.length)
  }

  // A fact spread over the cells of one row: "Board member — Club, Town" on the left, "2022 – 2024" on the right.
  for (const f of list) {
    if (hits.has(f.key) || f.needle.length < 12) continue
    for (const row of rows) {
      const parts = cells.filter((c) => c.row === row)
      if (parts.length < 2) continue
      let joined = ''
      const offsets: number[] = []
      for (const p of parts) {
        if (joined) joined += ' '
        offsets.push(joined.length)
        joined += p.n.s
      }
      const at = joined.indexOf(f.needle)
      if (at < 0) continue
      const end = at + f.needle.length
      const pieces = parts
        .map((p, i) => ({ p, a: Math.max(0, at - offsets[i]!), b: Math.min(p.n.s.length, end - offsets[i]!) }))
        .filter((x) => x.b > x.a)
      if (pieces.length < 2 || !pieces.every((x) => free(x.p, x.a, x.b))) continue
      const [first, ...rest] = pieces
      claim(f.key, first!.p, first!.a, first!.b)
      hits.get(f.key)!.more = rest.map((x) => {
        x.p.taken.push([x.a, x.b])
        return { cell: x.p.cell, start: x.p.n.map[x.a]!, end: x.p.n.map[x.b - 1]! + 1 }
      })
      break
    }
  }

  // Facts the user reworded after importing: the cell that shares most of their words.
  for (const f of list) {
    if (hits.has(f.key)) continue
    const fw = new Set(words(f.needle))
    if (fw.size < 4) continue
    let best: { c: (typeof cells)[number]; score: number } | null = null
    for (const c of cells) {
      if (c.taken.length || !c.n.s) continue
      const cw = new Set(words(c.n.s))
      let shared = 0
      for (const w of fw) if (cw.has(w)) shared++
      const score = (2 * shared) / (fw.size + cw.size)
      if (score >= 0.72 && (!best || score > best.score)) best = { c, score }
    }
    if (best) claim(f.key, best.c, 0, best.c.n.s.length)
  }
  return hits
}

// --- changing text ---------------------------------------------------------------------

function mergeRuns(runs: CloneRun[]): CloneRun[] {
  const out: CloneRun[] = []
  for (const r of runs) {
    if (!r.t) continue
    const last = out.at(-1)
    if (last && last.s === r.s) last.t += r.t
    else out.push({ ...r })
  }
  return out
}

/** New text takes the look of what it replaces; a bold "Label:" in front stays bold. */
function restyle(mid: CloneRun[], text: string, fallback: number): CloneRun[] {
  if (!text) return []
  const solid = mid.filter((r) => r.t.trim())
  if (solid.length <= 1) return [{ t: text, s: (solid[0] ?? mid[0])?.s ?? fallback }]
  const size = new Map<number, number>()
  for (const r of solid) size.set(r.s, (size.get(r.s) ?? 0) + r.t.length)
  const main = [...size.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  const lead = solid[0]!
  if (lead.s !== main) {
    const label = lead.t.trim()
    if (text.toLowerCase().startsWith(label.toLowerCase())) return [{ t: text.slice(0, label.length), s: lead.s }, { t: text.slice(label.length), s: main }]
    if (/[:：]$/.test(label)) {
      const m = /^[^:：]{1,40}[:：]/.exec(text)
      if (m) return [{ t: m[0], s: lead.s }, { t: text.slice(m[0].length), s: main }]
    }
  }
  return [{ t: text, s: main }]
}

function splice(cell: CloneCell, start: number, end: number, text: string): void {
  const before: CloneRun[] = []
  const mid: CloneRun[] = []
  const after: CloneRun[] = []
  let pos = 0
  for (const r of cell.runs) {
    const a = pos
    const b = pos + r.t.length
    pos = b
    if (b <= start) before.push(r)
    else if (a >= end) after.push(r)
    else {
      if (a < start) before.push({ t: r.t.slice(0, start - a), s: r.s })
      mid.push({ t: r.t.slice(Math.max(0, start - a), Math.min(r.t.length, end - a)), s: r.s })
      if (b > end) after.push({ t: r.t.slice(end - a), s: r.s })
    }
  }
  cell.runs = mergeRuns([...before, ...restyle(mid, text, cell.s), ...after])
}

const SEPARATOR = /\s*[·•|,;،؛/]\s*/
const isUpper = (s: string): boolean => /\p{L}/u.test(s) && s === s.toLocaleUpperCase() && s !== s.toLocaleLowerCase()

// --- what the tailored CV wants ----------------------------------------------------------

interface ListWant {
  /** The master keys of the list, in master order. */
  keys: string[]
  /** What the list should read now, in order; `key` is the master line it came from, if any. */
  items: Array<{ key: string | null; text: string }>
}

interface Want {
  text: Map<string, string>
  lists: ListWant[]
  /** Master entries (a job, a degree, a whole section) the tailored CV leaves out. */
  dropEntries: string[]
}

function listWant(keys: string[], items: TItem[]): ListWant {
  const taken = new Set<string>()
  const out: ListWant['items'] = []
  for (const it of items) {
    const text = it.text.trim()
    if (!text) continue
    const own = it.id.startsWith('m:') ? it.id.slice(2) : ''
    const key = [own, ...it.sources].find((k) => k && keys.includes(k) && !taken.has(k)) ?? null
    if (key) taken.add(key)
    out.push({ key, text })
  }
  return { keys, items: out }
}

function wantFrom(master: MasterCv, t: TailoredCv | null): Want {
  const want: Want = { text: new Map(), lists: [], dropEntries: [] }
  if (!t) {
    // No tailoring yet: the design shows the master CV as it is now.
    for (const [k, v] of Object.entries(bindableFacts(master))) want.text.set(k, v)
    return want
  }
  const set = (key: string, text: string): void => {
    if (text.trim()) want.text.set(key, text.trim())
  }
  set('headline', t.headline.text)
  set('summary', t.summary.text)
  for (const m of master.experience) {
    const r = t.experience.find((x) => x.id === m.id)
    if (!r) {
      want.dropEntries.push(m.id)
      continue
    }
    set(`${m.id}.title`, r.title.text)
    want.lists.push(listWant(m.bullets.map((_, i) => `${m.id}.b${i}`), r.bullets))
  }
  for (const m of master.education) {
    const e = t.education.find((x) => x.id === m.id)
    if (!e) {
      want.dropEntries.push(m.id)
      continue
    }
    set(`${m.id}.degree`, e.degree.text)
    want.lists.push(listWant(m.details.map((_, i) => `${m.id}.d${i}`), e.details))
  }
  want.lists.push(listWant(master.skills.map((_, i) => `skills.${i}`), t.skills))
  want.lists.push(listWant(master.languages.map((_, i) => `languages.${i}`), t.languages))
  for (const m of [...master.certificates, ...master.projects]) {
    const c = [...t.certificates, ...t.projects].find((x) => x.id === m.id)
    if (!c) {
      want.dropEntries.push(m.id)
      continue
    }
    set(`${m.id}.name`, c.name.text)
    set(`${m.id}.detail`, c.detail.text)
  }
  for (const m of master.other) {
    const s = t.other.find((x) => x.id === m.id)
    if (!s) {
      want.dropEntries.push(m.id)
      continue
    }
    set(`${m.id}.title`, s.title.text)
    want.lists.push(listWant(m.lines.map((_, i) => `${m.id}.l${i}`), s.lines))
  }
  return want
}

// --- section headings ---------------------------------------------------------------------

/** Words that make a short line a section heading, in the languages CVs here are written in. */
const HEADING_WORD =
  /\b(summary|profile|profil|objective|about|experience|employment|education|skills|languages|certificat\w*|projects?|publications?|awards?|volunteer\w*|interests|references|contact|kurzprofil|berufserfahrung|erfahrung|ausbildung|bildung|studium|kenntnisse|f[aä]higkeiten|sprachen|zertifikate|projekte|ehrenamt|interessen|kontakt|exp[eé]riences?|formation|comp[eé]tences|langues|experiencia|educaci[oó]n|habilidades|idiomas)\b|الملخص|نبذة|الخبر|التعليم|المهارات|اللغات|الشهادات|المشاريع/i

const LABEL_ALIASES: Array<[keyof CvLabels, RegExp]> = [
  ['summary', /^(professional )?(summary|profile)$|^about( me)?$|^profil$|^kurzprofil$/],
  ['experience', /^((work|professional) )?experience$|^employment( history)?$|^berufserfahrung$/],
  ['education', /^education$|^ausbildung$|^bildung$/],
  ['skills', /^((technical|key|core) )?skills$|^kenntnisse$|^f[aä]higkeiten$/],
  ['languages', /^languages$|^sprachen$/],
  ['certificates', /^certificat(es|ions)$|^zertifikate$/],
  ['projects', /^projects$|^projekte$/],
  ['contact', /^contact$|^kontakt$/]
]

function headingRows(rows: CloneRow[], hits: Map<string, Hit>): Set<CloneRow> {
  const titled = new Set<CloneRow>()
  for (const [k, h] of hits) if (/^o\d+\.title$/.test(k)) titled.add(h.row)
  const bound = new Set([...hits.values()].map((h) => h.row))
  const short = (r: CloneRow): boolean => r.cells.length === 1 && r.cells[0]!.lines === 1 && words(cellText(r.cells[0]!)).length <= 8
  const styles = new Set<number>()
  for (const r of rows) {
    if (short(r) && (titled.has(r) || (!bound.has(r) && HEADING_WORD.test(cellText(r.cells[0]!))))) styles.add(r.cells[0]!.s)
  }
  return new Set(rows.filter((r) => short(r) && styles.has(r.cells[0]!.s) && (titled.has(r) || !bound.has(r))))
}

// --- putting it together -------------------------------------------------------------------

export interface CloneCvResult {
  doc: CloneDoc
  /** Tailored lines that have no place in the design (text added to the master CV after the design was read). */
  unplaced: string[]
}

/**
 * The design with the CV's current words: the master CV when `tailored` is null,
 * the tailored one otherwise. `labels` are used for section headings when the CV
 * is written in another language than the design.
 */
export function applyCv(
  source: CloneDoc,
  master: MasterCv,
  tailored: TailoredCv | null,
  options: { labels?: CvLabels; translate?: boolean } = {}
): CloneCvResult {
  const doc: CloneDoc = structuredClone(source)
  const hits = bindFacts(doc, bindableFacts(master))
  const want = wantFrom(master, tailored)
  const unplaced: string[] = []
  const cols = doc.sections.flatMap((s) => s.cols)
  const colOf = (row: CloneRow): CloneBlock[] => cols.find((c) => c.blocks.includes(row))!.blocks
  const headings = headingRows(rowsOf(doc), hits)
  const removed = new Set<CloneBlock>()
  /** Cells emptied on purpose: their rows go when nothing but labels is left. */
  const emptied = new Set<CloneRow>()
  let nextId = Math.max(0, ...cols.flatMap((c) => c.blocks.map((b) => b.id))) + 1

  // Edits are collected first and applied back to front, so positions found earlier stay valid.
  const edits: Array<{ hit: Hit; text: string | null }> = []
  const parts = (h: Hit): Array<{ cell: number; start: number; end: number }> => [h, ...(h.more ?? [])]
  /** The fact is all its row says (apart from a bullet): the row is the fact's own line. */
  const whole = (h: Hit): boolean =>
    h.row.cells.every((c, i) => {
      if (h.row.marker && i === 0) return true
      const text = cellText(c)
      const p = parts(h).find((x) => x.cell === i)
      return !!p && text.slice(0, p.start).trim() === '' && text.slice(p.end).trim() === ''
    })
  const slice = (h: Hit, p: { cell: number; start: number; end: number }): string => cellText(h.row.cells[p.cell]!).slice(p.start, p.end)
  const current = (h: Hit): string => parts(h).map((p) => slice(h, p)).join(' ')
  const drop = (h: Hit): void => {
    for (const p of parts(h)) edits.push({ hit: { ...h, ...p, more: undefined }, text: null })
  }
  const change = (h: Hit, text: string): void => {
    const now = current(h)
    let next = isUpper(now) && !isUpper(text) ? text.toLocaleUpperCase() : text
    if (norm(now).s === norm(next).s) return
    // What still ends the new text (the dates) stays in its own cell; the rest moves into the first one.
    for (const p of [...(h.more ?? [])].reverse()) {
      const tail = norm(slice(h, p)).s
      const n = norm(next)
      if (tail && n.s.endsWith(tail)) next = next.slice(0, n.map[n.s.length - tail.length]!).replace(/[\s,;·–—-]+$/, '')
      else edits.push({ hit: { ...h, ...p, more: undefined }, text: null })
    }
    edits.push({ hit: { ...h, more: undefined }, text: next })
  }

  for (const [key, text] of want.text) {
    const h = hits.get(key)
    if (h) change(h, text)
  }

  for (const list of want.lists) {
    const isLang = list.keys[0]?.startsWith('languages.')
    const hitOf = (key: string): Hit | undefined => hits.get(isLang ? `${key}.name` : key)
    const kept = new Set(list.items.map((i) => i.key).filter((k): k is string => !!k))

    // Left out: a line of its own goes; a piece of a line goes with one of its separators.
    for (const key of list.keys) {
      if (kept.has(key)) continue
      for (const h of isLang ? [hits.get(`${key}.name`), hits.get(`${key}.level`)] : [hits.get(key)]) {
        if (!h) continue
        if (whole(h)) removed.add(h.row)
        else {
          drop(h)
          emptied.add(h.row)
        }
      }
    }

    // Lines of their own keep their look but take the tailored order.
    const slots = list.keys
      .map((k) => hitOf(k))
      .filter((h): h is Hit => !!h && whole(h))
      .map((h) => h.row)
      .filter((r, i, a) => a.indexOf(r) === i)
    const placed: CloneRow[] = []
    let lastInline: Hit | null = null
    for (const item of list.items) {
      const h = item.key ? hitOf(item.key) : undefined
      if (h && isLang) {
        const level = hits.get(`${item.key}.level`)
        const master = [current(h), level ? current(level) : ''].filter(Boolean).join(' – ')
        if (norm(master).s !== norm(item.text).s) {
          const bits = item.text.split(/\s+[–—-]\s+|\s*:\s+/)
          change(h, level && bits.length > 1 ? bits[0]! : item.text)
          if (level) {
            if (bits.length > 1) change(level, bits.slice(1).join(' – '))
            else drop(level)
          }
        }
        if (whole(h)) placed.push(h.row)
        continue
      }
      if (h) {
        change(h, item.text)
        if (whole(h)) placed.push(h.row)
        else lastInline = h
        continue
      }
      // A line the design has no place for: it borrows the look of the line before it.
      const model = placed.at(-1) ?? slots[0]
      if (model && !isLang) {
        const copy: CloneRow = structuredClone(model)
        copy.id = nextId++
        const cell = copy.cells[copy.marker ? 1 : 0] ?? copy.cells[0]!
        cell.runs = mergeRuns(restyle(cell.runs, item.text, cell.s))
        delete copy.keep
        for (const g of doc.graphics.filter((x) => x.anchor === model.id)) doc.graphics.push({ ...g, anchor: copy.id })
        placed.push(copy)
      } else if (lastInline) {
        const cell = lastInline.row.cells[lastInline.cell]!
        const sep = SEPARATOR.exec(cellText(cell))?.[0] ?? ', '
        cell.runs = mergeRuns([...cell.runs, { t: sep + item.text, s: cell.s }])
      } else unplaced.push(item.text)
    }
    if (slots.length) {
      // Put the lines back into the places the list had: same gaps, new order.
      const blocks = colOf(slots[0]!)
      const at = slots
        .map((r) => blocks.indexOf(r))
        .filter((i) => i >= 0)
        .sort((x, y) => x - y)
      const gaps = at.map((i) => blocks[i]!.gap)
      const typical = gaps[1] ?? gaps[0] ?? 0
      const still = placed.filter((r) => !removed.has(r))
      still.forEach((r, i) => (r.gap = gaps[i] ?? typical))
      const next: CloneBlock[] = []
      let k = 0
      blocks.forEach((blk, i) => {
        if (!at.includes(i)) {
          next.push(blk)
          return
        }
        if (k < still.length) next.push(still[k++]!)
        // More lines than places: the rest follow the last place.
        if (i === at.at(-1)) while (k < still.length) next.push(still[k++]!)
      })
      blocks.splice(0, blocks.length, ...next)
    }
  }

  // Whole entries left out: from their first line to the next entry or heading.
  if (want.dropEntries.length) {
    const owner = new Map<CloneRow, Set<string>>()
    for (const [key, h] of hits) {
      const id = entryOf(key)
      if (!id || !/\.(title|degree|name|detail|b\d+|d\d+|l\d+)$/.test(key)) continue
      owner.set(h.row, (owner.get(h.row) ?? new Set()).add(id))
    }
    for (const id of want.dropEntries) {
      const own = [...owner.entries()].filter(([, ids]) => ids.has(id) && ids.size === 1).map(([r]) => r)
      if (!own.length) continue
      const blocks = colOf(own[0]!)
      const idx = own.map((r) => blocks.indexOf(r)).filter((i) => i >= 0)
      let from = Math.min(...idx)
      let to = Math.max(...idx)
      // A section of its own ("Volunteering") goes with its heading.
      const title = hits.get(`${id}.title`)
      const sectionHeading = /^o\d+$/.test(id) && title && headings.has(title.row)
      for (let i = to + 1; i < blocks.length; i++) {
        const b = blocks[i]!
        if (b.kind === 'rule') {
          const next = blocks[i + 1]
          if (!next || (next.kind === 'row' && headings.has(next))) break
          continue
        }
        if (headings.has(b) || [...(owner.get(b) ?? [])].some((x) => x !== id)) break
        to = i
      }
      if (sectionHeading) {
        from = Math.min(from, blocks.indexOf(title.row))
        if (blocks[from + 1]?.kind === 'rule') to = Math.max(to, from + 1)
      }
      for (let i = from; i <= to; i++) removed.add(blocks[i]!)
    }
  }

  // Apply the text edits, last position first within each cell.
  edits.sort((a, b) => b.hit.start - a.hit.start)
  for (const e of edits) {
    const cell = e.hit.row.cells[e.hit.cell]!
    let { start, end } = e.hit
    if (e.text === null) {
      const text = cellText(cell)
      const before = new RegExp(`${SEPARATOR.source}$`).exec(text.slice(0, start))
      const after = new RegExp(`^${SEPARATOR.source}`).exec(text.slice(end))
      if (before) start -= before[0].length
      else if (after) end += after[0].length
    }
    splice(cell, start, end, e.text ?? '')
  }
  for (const row of emptied) {
    const blank = (c: CloneCell): boolean => !/[\p{L}\p{N}]/u.test(cellText(c))
    const hasFacts = (i: number): boolean => [...hits.values()].some((h) => h.row === row && h.cell === i)
    // The value is gone and what is left is its label: the whole row goes.
    if (row.cells.every((c, i) => blank(c) || !hasFacts(i))) removed.add(row)
  }

  // Section headings in the CV's language when it differs from the design's.
  if (options.translate && options.labels) {
    for (const row of headings) {
      const cell = row.cells[0]!
      const text = cellText(cell)
      const key = LABEL_ALIASES.find(([, re]) => re.test(norm(text).s))?.[0]
      const label = key ? options.labels[key] : ''
      if (label) cell.runs = [{ t: isUpper(text) ? label.toLocaleUpperCase() : label, s: cell.s }]
    }
  }

  for (const col of cols) {
    let blocks = col.blocks.filter((b) => !removed.has(b))
    // A heading with nothing under it goes too, with its rule.
    for (;;) {
      const empty = blocks.findIndex((b, i) => {
        if (b.kind !== 'row' || !headings.has(b)) return false
        const rest = blocks.slice(i + 1).find((x) => x.kind === 'row')
        return removed.size > 0 && (!rest || headings.has(rest))
      })
      if (empty < 0) break
      const next = blocks[empty + 1]
      blocks = blocks.filter((b, i) => i !== empty && !(i === empty + 1 && next?.kind === 'rule'))
    }
    col.blocks = blocks
  }
  const alive = new Set(cols.flatMap((c) => c.blocks.map((b) => b.id)))
  doc.graphics = doc.graphics.filter((g) => g.anchor < 0 || alive.has(g.anchor))
  return { doc, unplaced }
}

/** How well the master CV and the design fit: long passages of the design that no fact covers. */
export function looseText(doc: CloneDoc, master: MasterCv): string[] {
  const hits = bindFacts(doc, bindableFacts(master))
  const covered = new Map<CloneCell, number>()
  for (const h of hits.values()) {
    const cell = h.row.cells[h.cell]!
    covered.set(cell, (covered.get(cell) ?? 0) + (h.end - h.start))
  }
  const out: string[] = []
  for (const row of rowsOf(doc)) {
    for (const cell of row.cells) {
      const text = cellText(cell).trim()
      if (text.length >= 90 && (covered.get(cell) ?? 0) < text.length * 0.5) out.push(text)
    }
  }
  return out
}

export interface CloneCvInput {
  layout: CloneDoc
  master: MasterCv
  tailored: TailoredCv | null
  labels: CvLabels
  lang: string
  dir: 'ltr' | 'rtl'
}

/** The printable CV in the user's own design. */
export function cloneCvDoc(input: CloneCvInput): DocHtml & { unplaced: string[] } {
  const translate = !!input.tailored && (input.master.language || 'en') !== input.lang
  const { doc, unplaced } = applyCv(input.layout, input.master, input.tailored, { labels: input.labels, translate })
  return { ...cloneHtml(doc, { title: input.master.name || 'CV', lang: input.lang, dir: input.dir }), unplaced }
}
