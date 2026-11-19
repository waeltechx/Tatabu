/**
 * The renderer measures the PDF and sends the result to the main process. This
 * makes sure what arrives is really a list of measured pages: plain numbers,
 * short strings, colours, and pictures we produced ourselves.
 */
import { safeImage } from '../docs/common'
import type { RawFont, RawGlyph, RawImage, RawPage, RawShape } from './extract'

const num = (v: unknown, min = -20_000, max = 20_000): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0
}
const hex = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '')
const list = (v: unknown, max: number): Array<Record<string, unknown>> =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, max)

export function cleanRawPages(input: unknown): RawPage[] | null {
  const pages = list(input, 6)
  if (!pages.length) return null
  const out: RawPage[] = pages.map((p) => {
    const fonts: RawFont[] = list(p.fonts, 200).map((f) => ({
      name: String(f.name ?? '').slice(0, 120),
      serif: f.serif === true,
      mono: f.mono === true,
      ascent: num(f.ascent, 0.3, 1.6) || 0.9,
      descent: num(f.descent, -0.8, -0.05) || -0.25
    }))
    const glyphs: RawGlyph[] = list(p.glyphs, 60_000)
      .map((g) => ({
        ch: typeof g.ch === 'string' ? g.ch.slice(0, 8) : '',
        x: num(g.x),
        y: num(g.y),
        adv: num(g.adv, 0, 2000),
        size: num(g.size, 0, 2000),
        font: Math.min(Math.max(0, Math.trunc(num(g.font))), Math.max(0, fonts.length - 1)),
        color: hex(g.color) || '#000000',
        space: g.space === true,
        seq: Math.trunc(num(g.seq, 0, 10_000_000))
      }))
      .filter((g) => g.ch && fonts.length > 0)
    const shapes: RawShape[] = list(p.shapes, 3000)
      .map((s) => {
        const box = (Array.isArray(s.box) ? s.box : []).slice(0, 4).map((v) => num(v))
        return {
          d: typeof s.d === 'string' && s.d.length < 20_000 && /^[MLCQZ0-9 .-]*$/.test(s.d) ? s.d : '',
          box: [box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0] as RawShape['box'],
          fill: hex(s.fill),
          stroke: hex(s.stroke),
          lineWidth: num(s.lineWidth, 0, 200),
          opacity: num(s.opacity, 0, 1),
          rect: s.rect === true,
          seq: Math.trunc(num(s.seq, 0, 10_000_000))
        }
      })
      .filter((s) => s.d && (s.fill || s.stroke))
    const images: RawImage[] = list(p.images, 12).map((im) => {
      const src = typeof im.src === 'string' && im.src.length < 1_500_000 ? safeImage(im.src) : ''
      return {
        x: num(im.x),
        y: num(im.y),
        w: num(im.w, 0),
        h: num(im.h, 0),
        seq: Math.trunc(num(im.seq, 0, 10_000_000)),
        ...(src ? { src } : {})
      }
    })
    return { width: num(p.width, 0, 5000), height: num(p.height, 0, 5000), fonts, glyphs, shapes, images }
  })
  return out.some((p) => p.glyphs.length > 0) ? out : null
}
