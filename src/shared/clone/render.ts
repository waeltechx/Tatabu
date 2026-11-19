/**
 * A measured design (`CloneDoc`) → the HTML and CSS that print it. Everything is
 * generated from numbers and escaped text, so nothing from the PDF can run as code.
 */
import { esc, safeImage, type DocHtml } from '../docs/common'
import type { CloneBlock, CloneDoc, CloneGraphic, CloneRow, CloneStyle } from './build'

const n = (v: number): string => {
  const x = Number(v)
  return Number.isFinite(x) ? String(Math.round(x * 10000) / 10000) : '0'
}
const color = (c: string): string => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000')

/** Families that stand in when the design's own font is not on the computer. */
const FALLBACK: Record<CloneStyle['generic'], string> = {
  'sans-serif': "'Inter', 'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif",
  serif: "Georgia, 'Times New Roman', 'IBM Plex Sans Arabic', serif",
  monospace: "'IBM Plex Mono', 'Courier New', monospace"
}
const ALIASES: Record<string, string[]> = {
  'Source Sans 3': ['Source Sans Pro'],
  'Latin Modern Roman': ['CMU Serif', 'Computer Modern'],
  Arial: ['Helvetica', 'Liberation Sans'],
  'Times New Roman': ['Times', 'Liberation Serif'],
  Calibri: ['Carlito'],
  Cambria: ['Caladea']
}

export function fontStack(style: Pick<CloneStyle, 'family' | 'generic'>): string {
  const family = style.family.replace(/[^A-Za-z0-9 _-]/g, '').trim()
  const names = family ? [family, ...(ALIASES[family] ?? [])] : []
  return [...names.map((f) => `'${f}'`), FALLBACK[style.generic] ?? FALLBACK['sans-serif']].join(', ')
}

function styleCss(s: CloneStyle, i: number): string {
  return (
    `.tc .s${i}{font-family:${fontStack(s)};font-size:${n(s.size)}pt;font-weight:${Math.round(s.weight) || 400};` +
    `font-style:${s.italic ? 'italic' : 'normal'};color:${color(s.color)};letter-spacing:${s.tracking ? `${n(s.tracking)}pt` : 'normal'};` +
    `font-kerning:${s.kern === false ? 'none' : 'normal'}}`
  )
}

function graphicHtml(g: CloneGraphic, left: number, top: number, fixed = false, bottom: number | null = null): string {
  const pos = `inset-inline-start:${n(left)}pt;top:${n(top)}pt;width:${n(g.w)}pt;` + (bottom === null ? `height:${n(g.h)}pt` : `bottom:${n(bottom)}pt`)
  if (g.img) {
    const src = safeImage(g.img)
    return src ? `<img class="g${fixed ? ' fx' : ''}" alt="" src="${src}" style="${pos}">` : ''
  }
  const paths = (g.paths ?? [])
    .filter((p) => /^[MLCQZ0-9 .-]*$/.test(p.d))
    .map(
      (p) =>
        `<path d="${p.d}" fill="${p.fill ? color(p.fill) : 'none'}"` +
        (p.stroke ? ` stroke="${color(p.stroke)}" stroke-width="${n(p.lw)}"` : '') +
        (p.o < 1 ? ` opacity="${n(Math.max(0, p.o))}"` : '') +
        '/>'
    )
    .join('')
  if (!paths) return ''
  return `<svg class="g${fixed ? ' fx' : ''}" style="${pos}" viewBox="0 0 ${n(g.w)} ${n(g.h)}" preserveAspectRatio="none">${paths}</svg>`
}

function rowHtml(row: CloneRow, colX: number, extra: string, after: string): string {
  const cells = row.cells
  const single = cells.length === 1
  const cols = cells
    .map((c, i) => {
      const next = cells[i + 1]
      if (!next) return c.align === 'end' ? 'auto' : 'minmax(0,1fr)'
      return next.align === 'end' ? 'minmax(0,1fr)' : `${n(Math.max(0, next.x - c.x))}pt`
    })
    .join(' ')
  const inner = cells
    .map((c) => {
      const text = c.runs.map((r) => (r.s === c.s ? esc(r.t) : `<span class="s${r.s}">${esc(r.t)}</span>`)).join('')
      const style =
        `line-height:${n(c.lh)}pt;` +
        (c.mt ? `margin-top:${n(c.mt)}pt;` : '') +
        (c.align !== 'start' ? `text-align:${c.align};` : '') +
        (c.align === 'end' ? 'white-space:nowrap;padding-inline-start:6pt;' : '')
      return `<div class="c s${c.s}" style="${style}">${text}</div>`
    })
    .join('')
  // A long paragraph may run over a page end; everything else stays whole.
  const whole = !(single && cells[0]!.lines >= 5)
  const style =
    `margin-top:${n(row.gap)}pt;margin-inline-start:${n(row.x - colX)}pt;width:${n(row.w)}pt;` +
    (single ? '' : `grid-template-columns:${cols};`) +
    after
  return `<div class="${single ? 'r r1' : 'r'}${whole ? ' w' : ''}" data-b="${row.id}" style="${style}">${extra}${inner}</div>`
}

export interface CloneRenderOptions {
  title: string
  lang: string
  dir: 'ltr' | 'rtl'
}

export function cloneHtml(doc: CloneDoc, opts: CloneRenderOptions): DocHtml {
  const byAnchor = new Map<number, CloneGraphic[]>()
  for (const g of doc.graphics) {
    const list = byAnchor.get(g.anchor) ?? []
    list.push(g)
    byAnchor.set(g.anchor, list)
  }

  const blockHtml = (blk: CloneBlock, colX: number, next: CloneBlock | undefined): string => {
    const extra = (byAnchor.get(blk.id) ?? []).map((g) => graphicHtml(g, g.x - blk.x, g.dy)).join('')
    if (blk.kind === 'rule') {
      return (
        `<div class="hr" data-b="${blk.id}" style="margin-top:${n(blk.gap)}pt;margin-inline-start:${n(blk.x - colX)}pt;` +
        `width:${n(blk.w)}pt;height:${n(blk.h)}pt;background:${color(blk.color)}">${extra}</div>`
      )
    }
    // A line with a rule under it is a heading: it stays with what follows.
    return rowHtml(blk, colX, extra, next?.kind === 'rule' ? 'break-after:avoid;' : '')
  }

  const colHtml = (blocks: CloneBlock[], colX: number): string => {
    let out = ''
    for (let i = 0; i < blocks.length; i++) {
      const blk = blocks[i]!
      if (blk.keep === undefined) {
        out += blockHtml(blk, colX, blocks[i + 1])
        continue
      }
      let j = i
      let group = ''
      while (j < blocks.length && blocks[j]!.keep === blk.keep) {
        group += blockHtml(blocks[j]!, colX, blocks[j + 1])
        j++
      }
      out += `<div class="k">${group}</div>`
      i = j - 1
    }
    return out
  }

  const sections = doc.sections
    .map((sec) => {
      const cols = sec.cols.map((c) => `<div class="col" style="width:${n(c.w)}pt">${colHtml(c.blocks, c.x)}</div>`).join('')
      const brk = sec.breakBefore ? ' style="break-before:page"' : ''
      return sec.cols.length > 1 ? `<div class="sec cols"${brk}>${cols}</div>` : `<div class="sec"${brk}>${cols}</div>`
    })
    .join('')

  // Tall backgrounds (a sidebar) repeat on every printed page.
  const fixed = (byAnchor.get(-1) ?? [])
    .map((g) => graphicHtml(g, g.x, g.dy - doc.margin.top, true, doc.page.h - (g.dy + g.h) - doc.margin.bottom))
    .join('')

  const css = `
  @page { size: ${n(doc.page.w)}pt ${n(doc.page.h)}pt; margin: ${n(doc.margin.top)}pt 0 ${n(doc.margin.bottom)}pt 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tc { position: relative; z-index: 0; display: flow-root; width: ${n(doc.page.w)}pt; font-variant-ligatures: ${doc.ligatures === false ? 'none' : 'normal'}; font-synthesis: weight style; orphans: 2; widows: 2; }
  .tc .sec { display: flow-root; }
  .tc .cols { display: flex; align-items: flex-start; }
  .tc .col { display: flow-root; flex: none; }
  .tc .r { position: relative; display: grid; align-items: start; }
  .tc .r1 { display: block; }
  .tc .w, .tc .k { break-inside: avoid; }
  .tc .c { min-width: 0; overflow-wrap: break-word; white-space: pre-wrap; }
  .tc .c span { line-height: 0; }
  .tc .hr { position: relative; break-before: avoid; break-after: avoid; }
  .tc .g { position: absolute; z-index: -1; display: block; max-width: none; pointer-events: none; }
  @media print { .tc .fx { position: fixed; } }
  ${doc.styles.map(styleCss).join('\n  ')}
  `
  return {
    title: opts.title || 'CV',
    css,
    body: `<div class="tc" dir="${opts.dir === 'rtl' ? 'rtl' : 'ltr'}">${fixed}${sections}</div>`,
    dir: opts.dir,
    lang: opts.lang
  }
}
