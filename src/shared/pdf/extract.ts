/**
 * Reads what a PDF page really contains: every glyph with its position, size, font
 * and colour, every drawn shape and every image box. It walks pdf.js's operator list,
 * so it needs no canvas and runs in the main process, the renderer and tests alike.
 *
 * Everything comes out in points, measured from the page's top-left corner.
 */

export interface RawFont {
  /** The PDF's own name, e.g. "AAAAAA+FiraSans-Bold". */
  name: string
  serif: boolean
  mono: boolean
  /** Fractions of the font size. */
  ascent: number
  descent: number
}

export interface RawGlyph {
  ch: string
  /** Left end of the baseline. */
  x: number
  y: number
  /** How far the pen moves after it. */
  adv: number
  size: number
  /** Index into `RawPage.fonts`. */
  font: number
  color: string
  space: boolean
  /** Paint order, shared with shapes and images. */
  seq: number
}

export interface RawShape {
  /** SVG path data in page points. */
  d: string
  box: [x0: number, y0: number, x1: number, y1: number]
  /** Hex colours; empty when not filled / not stroked. */
  fill: string
  stroke: string
  lineWidth: number
  opacity: number
  /** True when the path is one axis-aligned rectangle. */
  rect: boolean
  seq: number
}

export interface RawImage {
  x: number
  y: number
  w: number
  h: number
  seq: number
  /** A JPEG/PNG data URL cut from the rendered page (filled in by the renderer). */
  src?: string
}

export interface RawPage {
  width: number
  height: number
  fonts: RawFont[]
  glyphs: RawGlyph[]
  shapes: RawShape[]
  images: RawImage[]
}

type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** m1 × m2: applies m2 first, then m1 (pdf.js `Util.transform`). */
function mul(m1: ArrayLike<number>, m2: ArrayLike<number>): Matrix {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!
  ]
}

const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const r2 = (n: number): number => Math.round(n * 100) / 100
const r3 = (n: number): number => Math.round(n * 1000) / 1000

function hex(args: unknown[]): string {
  const a = args[0]
  if (typeof a === 'string') return /^#[0-9a-f]{6}$/i.test(a) ? a.toLowerCase() : ''
  if (args.length >= 3 && args.slice(0, 3).every((n) => typeof n === 'number')) {
    return '#' + (args.slice(0, 3) as number[]).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')
  }
  return ''
}

interface State {
  ctm: Matrix
  /** The visible area: [x0, y0, x1, y1] in page points. */
  clip: [number, number, number, number]
  fill: string
  stroke: string
  fillAlpha: number
  strokeAlpha: number
  lineWidth: number
  font: number
  fontSize: number
  fontDir: number
  fontScale: number
  charSpacing: number
  wordSpacing: number
  hScale: number
  leading: number
  rise: number
  mode: number
  tm: Matrix
  x: number
  y: number
  lineX: number
  lineY: number
}

interface PdfFontObject {
  name?: string
  loadedName?: string
  isSerifFont?: boolean
  isMonospace?: boolean
  ascent?: number
  descent?: number
  fontMatrix?: number[]
  vertical?: boolean
}

interface PdfGlyph {
  unicode?: string
  width?: number
  isSpace?: boolean
}

/** The parts of a pdf.js page this module uses. */
export interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] }
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown[] | null> }>
  commonObjs: { get(id: string): unknown; has?(id: string): boolean }
}

// Path codes inside `constructPath` data (pdf.js `DrawOPS`).
const MOVE = 0
const LINE = 1
const CURVE = 2
const QUAD = 3
const CLOSE = 4

/** Path data → SVG path in page points, its box, and whether it is a plain rectangle. */
function tracePath(data: ArrayLike<number>, ctm: Matrix): { d: string; box: RawShape['box']; rect: boolean } | null {
  const parts: string[] = []
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const pts: Array<[number, number]> = []
  let curves = false
  let subpaths = 0
  const pt = (x: number, y: number): string => {
    const [px, py] = apply(ctm, x, y)
    x0 = Math.min(x0, px)
    y0 = Math.min(y0, py)
    x1 = Math.max(x1, px)
    y1 = Math.max(y1, py)
    pts.push([px, py])
    return `${r2(px)} ${r2(py)}`
  }
  for (let i = 0; i < data.length; ) {
    const op = data[i++]
    if (op === MOVE) {
      parts.push(`M${pt(data[i]!, data[i + 1]!)}`)
      i += 2
      subpaths++
    } else if (op === LINE) {
      parts.push(`L${pt(data[i]!, data[i + 1]!)}`)
      i += 2
    } else if (op === CURVE) {
      parts.push(`C${pt(data[i]!, data[i + 1]!)} ${pt(data[i + 2]!, data[i + 3]!)} ${pt(data[i + 4]!, data[i + 5]!)}`)
      i += 6
      curves = true
    } else if (op === QUAD) {
      parts.push(`Q${pt(data[i]!, data[i + 1]!)} ${pt(data[i + 2]!, data[i + 3]!)}`)
      i += 4
      curves = true
    } else if (op === CLOSE) {
      parts.push('Z')
    } else {
      return null // unknown code: don't guess
    }
  }
  if (!pts.length || !Number.isFinite(x0 + y0 + x1 + y1)) return null
  // A rectangle: one subpath, straight lines, every point on a corner of the box.
  const onCorner = ([x, y]: [number, number]): boolean =>
    (Math.abs(x - x0) < 0.05 || Math.abs(x - x1) < 0.05) && (Math.abs(y - y0) < 0.05 || Math.abs(y - y1) < 0.05)
  const rect = !curves && subpaths === 1 && pts.length >= 2 && pts.length <= 5 && pts.every(onCorner)
  return { d: parts.join(''), box: [r2(x0), r2(y0), r2(x1), r2(y1)], rect }
}

/**
 * Walks one page. `OPS` is pdf.js's operator table (`pdfjs.OPS`).
 * Text drawn sideways or upside down is left out.
 */
export async function extractPage(page: PdfPageLike, OPS: Record<string, number>): Promise<RawPage> {
  const viewport = page.getViewport({ scale: 1 })
  const list = await page.getOperatorList()
  const fonts: RawFont[] = []
  const fontIndex = new Map<string, number>()
  const fontObjs: PdfFontObject[] = []
  const glyphs: RawGlyph[] = []
  const shapes: RawShape[] = []
  const images: RawImage[] = []
  let seq = 0

  const base = viewport.transform as unknown as Matrix
  let s: State = {
    ctm: [...base] as Matrix,
    clip: [0, 0, viewport.width, viewport.height],
    fill: '#000000',
    stroke: '#000000',
    fillAlpha: 1,
    strokeAlpha: 1,
    lineWidth: 1,
    font: -1,
    fontSize: 0,
    fontDir: 1,
    fontScale: 0.001,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    mode: 0,
    tm: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0
  }
  const stack: State[] = []
  let pendingClip = false
  const save = (): void => {
    stack.push({ ...s })
  }
  const restore = (): void => {
    const prev = stack.pop()
    if (prev) s = prev
  }

  const setFont = (ref: string, size: number): void => {
    let idx = fontIndex.get(ref)
    if (idx === undefined) {
      let obj: PdfFontObject = {}
      try {
        obj = (page.commonObjs.get(ref) as PdfFontObject) ?? {}
      } catch {
        obj = {}
      }
      idx = fonts.length
      fontIndex.set(ref, idx)
      fontObjs.push(obj)
      const ascent = Number(obj.ascent)
      const descent = Number(obj.descent)
      fonts.push({
        name: String(obj.name ?? ''),
        serif: !!obj.isSerifFont,
        mono: !!obj.isMonospace,
        ascent: Number.isFinite(ascent) && ascent > 0.3 && ascent < 1.6 ? ascent : 0.9,
        descent: Number.isFinite(descent) && descent < -0.05 && descent > -0.8 ? descent : -0.25
      })
    }
    s.font = idx
    s.fontDir = size < 0 ? -1 : 1
    s.fontSize = Math.abs(size)
    const fm = fontObjs[idx]?.fontMatrix
    s.fontScale = fm && fm[0] ? fm[0] : 0.001
  }

  const moveText = (x: number, y: number): void => {
    s.x = s.lineX += x
    s.y = s.lineY += y
  }

  const showText = (items: Array<PdfGlyph | number | null>): void => {
    if (s.font < 0 || !s.fontSize) return
    const vertical = !!fontObjs[s.font]?.vertical
    const hScale = s.hScale * s.fontDir
    const advScale = s.fontSize * s.fontScale
    // Text space → page space.
    const m = mul(s.ctm, s.tm)
    const sx = Math.hypot(m[0], m[1])
    const sy = Math.hypot(m[2], m[3])
    // Upright, left-to-right text only: the x axis points right and the y axis is not sheared.
    const upright = m[0] > 0 && Math.abs(m[1]) < 0.02 * sx && Math.abs(m[2]) < 0.02 * sy
    const visible = s.mode !== 3 && s.mode !== 7 && s.fillAlpha > 0.02
    let x = 0
    for (const g of items) {
      if (g === null || g === undefined) continue
      if (typeof g === 'number') {
        x += ((vertical ? 1 : -1) * g * s.fontSize) / 1000
        continue
      }
      const spacing = (g.isSpace ? s.wordSpacing : 0) + s.charSpacing
      const width = Number(g.width) || 0
      const charWidth = width * advScale + spacing * s.fontDir
      if (!vertical && upright && visible) {
        const [px, py] = apply(m, s.x + x * hScale, s.y + s.rise)
        const ch = typeof g.unicode === 'string' ? g.unicode : ''
        if (ch && ch !== '\u0000') {
          glyphs.push({
            ch,
            x: r3(px),
            y: r2(py),
            adv: r3(width * advScale * Math.abs(hScale) * sx),
            size: r2(s.fontSize * sy),
            font: s.font,
            color: s.fill || '#000000',
            space: !!g.isSpace || /^\s+$/.test(ch),
            seq: seq++
          })
        }
      }
      x += charWidth
    }
    if (vertical) s.y -= x
    else s.x += x * hScale
  }

  const name: Record<number, string> = {}
  for (const [k, v] of Object.entries(OPS)) name[v] = k

  for (let i = 0; i < list.fnArray.length; i++) {
    const args = (list.argsArray[i] ?? []) as unknown[]
    switch (name[list.fnArray[i]!]) {
      case 'save':
        save()
        break
      case 'restore':
        restore()
        break
      case 'transform':
        if (args.length >= 6) s.ctm = mul(s.ctm, args as number[])
        break
      case 'paintFormXObjectBegin':
        save()
        if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) s.ctm = mul(s.ctm, args[0] as ArrayLike<number>)
        break
      case 'paintFormXObjectEnd':
        restore()
        break
      case 'beginGroup':
        save()
        break
      case 'endGroup':
        restore()
        break
      case 'beginAnnotation':
        // Form fields and stamps are not part of the layout: skip to the end of the annotation.
        while (i < list.fnArray.length && name[list.fnArray[i]!] !== 'endAnnotation') i++
        break
      case 'setLineWidth':
        s.lineWidth = Number(args[0]) || 0
        break
      case 'setFillRGBColor':
      case 'setFillGray':
      case 'setFillCMYKColor':
      case 'setFillColor':
        s.fill = hex(args) || s.fill
        break
      case 'setStrokeRGBColor':
      case 'setStrokeGray':
      case 'setStrokeCMYKColor':
      case 'setStrokeColor':
        s.stroke = hex(args) || s.stroke
        break
      case 'setFillColorN':
        s.fill = hex(args) // patterns and shadings have no single colour
        break
      case 'setStrokeColorN':
        s.stroke = hex(args)
        break
      case 'setFillTransparent':
        s.fill = ''
        break
      case 'setStrokeTransparent':
        s.stroke = ''
        break
      case 'setGState':
        for (const pair of (args[0] as Array<[string, unknown]>) ?? []) {
          const [key, value] = pair
          if (key === 'LW') s.lineWidth = Number(value) || 0
          else if (key === 'ca') s.fillAlpha = Number(value)
          else if (key === 'CA') s.strokeAlpha = Number(value)
          else if (key === 'Font' && Array.isArray(value)) setFont(String(value[0]), Number(value[1]))
        }
        break
      case 'clip':
      case 'eoClip':
        pendingClip = true
        break
      case 'constructPath': {
        const op = name[args[0] as number]
        const data = (args[1] as unknown[] | undefined)?.[0]
        if (!data || !(Array.isArray(data) || ArrayBuffer.isView(data))) {
          pendingClip = false
          break
        }
        if (pendingClip) {
          // The path also narrows what is visible from here on (a photo cut to a rounded frame).
          pendingClip = false
          const box = tracePath(data as ArrayLike<number>, s.ctm)?.box
          if (box) {
            s.clip = [Math.max(s.clip[0], box[0]), Math.max(s.clip[1], box[1]), Math.min(s.clip[2], box[2]), Math.min(s.clip[3], box[3])]
          }
        }
        if (!op || op === 'endPath') break
        const fills = /fill/i.test(op)
        const strokes = /stroke/i.test(op)
        const fill = fills && s.fillAlpha > 0.02 ? s.fill : ''
        const stroke = strokes && s.strokeAlpha > 0.02 && s.lineWidth >= 0 ? s.stroke : ''
        if (!fill && !stroke) break
        const traced = tracePath(data as ArrayLike<number>, s.ctm)
        if (!traced) break
        const scale = Math.sqrt(Math.abs(s.ctm[0] * s.ctm[3] - s.ctm[1] * s.ctm[2]))
        shapes.push({
          ...traced,
          fill,
          stroke,
          lineWidth: stroke ? r2(Math.max(s.lineWidth, 0.1) * scale) : 0,
          opacity: r2(Math.min(1, fill ? s.fillAlpha : s.strokeAlpha)),
          seq: seq++
        })
        break
      }
      case 'paintImageXObject':
      case 'paintInlineImageXObject':
      case 'paintImageMaskXObject':
      case 'paintImageXObjectRepeat': {
        const corners = [apply(s.ctm, 0, 0), apply(s.ctm, 1, 0), apply(s.ctm, 0, 1), apply(s.ctm, 1, 1)]
        const xs = corners.map((c) => c[0])
        const ys = corners.map((c) => c[1])
        const x = Math.max(Math.min(...xs), s.clip[0])
        const y = Math.max(Math.min(...ys), s.clip[1])
        const w = Math.min(Math.max(...xs), s.clip[2]) - x
        const h = Math.min(Math.max(...ys), s.clip[3]) - y
        if (w > 1 && h > 1) images.push({ x: r2(x), y: r2(y), w: r2(w), h: r2(h), seq: seq++ })
        break
      }
      case 'beginText':
        s.tm = IDENTITY
        s.x = s.lineX = 0
        s.y = s.lineY = 0
        break
      case 'setFont':
        setFont(String(args[0]), Number(args[1]))
        break
      case 'setCharSpacing':
        s.charSpacing = Number(args[0]) || 0
        break
      case 'setWordSpacing':
        s.wordSpacing = Number(args[0]) || 0
        break
      case 'setHScale':
        s.hScale = (Number(args[0]) || 100) / 100
        break
      case 'setLeading':
        s.leading = -(Number(args[0]) || 0)
        break
      case 'setTextRise':
        s.rise = Number(args[0]) || 0
        break
      case 'setTextRenderingMode':
        s.mode = Number(args[0]) || 0
        break
      case 'moveText':
        moveText(Number(args[0]) || 0, Number(args[1]) || 0)
        break
      case 'setLeadingMoveText':
        s.leading = Number(args[1]) || 0
        moveText(Number(args[0]) || 0, Number(args[1]) || 0)
        break
      case 'setTextMatrix': {
        const m = (args.length >= 6 ? args : args[0]) as ArrayLike<number> | undefined
        if (m && m.length >= 6) s.tm = [m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!]
        s.x = s.lineX = 0
        s.y = s.lineY = 0
        break
      }
      case 'nextLine':
        moveText(0, s.leading)
        break
      case 'showText':
      case 'showSpacedText':
        if (Array.isArray(args[0])) showText(args[0] as Array<PdfGlyph | number>)
        break
      case 'nextLineShowText':
        moveText(0, s.leading)
        if (Array.isArray(args[0])) showText(args[0] as Array<PdfGlyph | number>)
        break
      case 'nextLineSetSpacingShowText':
        s.wordSpacing = Number(args[0]) || 0
        s.charSpacing = Number(args[1]) || 0
        moveText(0, s.leading)
        if (Array.isArray(args[2])) showText(args[2] as Array<PdfGlyph | number>)
        break
      default:
        break
    }
  }

  return { width: r2(viewport.width), height: r2(viewport.height), fonts, glyphs, shapes, images }
}
