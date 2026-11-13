/**
 * "My design": the user's own CV layout, recreated by a vision model as an
 * HTML/CSS template with placeholders. Only the text changes per job; the
 * layout stays theirs. Templates are untrusted model output, so they are
 * sanitised and every value is escaped before it reaches a page.
 */
import type { MasterCv } from './cv'
import { esc, safeImage, type DocHtml } from './docs/common'
import type { CvLabels } from './tailor'

export const MAX_DESIGN_ROUNDS = 3

export interface DesignTemplate {
  html: string
  css: string
}

/** Where the photo sits on page 1, as fractions of the page (0–1). */
export interface PhotoBox {
  x: number
  y: number
  w: number
  h: number
}

export interface DesignDraft extends DesignTemplate {
  sourceName: string
  /** The original pages as JPEG data URLs, for the side-by-side compare. */
  pages: string[]
  photo: string
  photoBox: PhotoBox | null
  /** What the model recognised ("Two columns, sidebar on the left"…). */
  found: string[]
  /** Known differences ("Name font: closest match"…). */
  differences: string[]
  round: number
  feedback: string[]
  updatedAt: string
}

export interface DesignState {
  draft: DesignDraft | null
  saved: DesignDraft | null
}

/** A file the user picked, handed to the renderer to draw its pages. */
export interface DesignSource {
  filename: string
  data: Uint8Array
}

// --- sanitising ---------------------------------------------------------------------

/** Removes anything that could run code or load something from outside. */
export function sanitizeTemplate(t: DesignTemplate): DesignTemplate {
  let html = String(t.html ?? '').slice(0, 60_000)
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|form|template|svg|math|frame|frameset|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ''
    )
    .replace(
      /<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|template|svg|math|frame|frameset|noscript|html|head|body)\b[^>]*>/gi,
      ''
    )
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|xlink:href|action|formaction|srcset|background|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Images may only show the photo placeholder.
    .replace(/\s+src\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, v: string) =>
      /^["']?\{\{\s*photo\s*\}\}["']?$/.test(v) ? ' src="{{photo}}"' : ''
    )
    .replace(/javascript:/gi, '')
  let css = String(t.css ?? '').slice(0, 40_000)
  css = css
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*\}/gi, '')
    .replace(/@page\s*[^{]*\{[^}]*\}/gi, '')
    .replace(/url\s*\(\s*(?!["']?data:image\/(png|jpe?g|webp|gif);)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
    .replace(/javascript:/gi, '')
    .replace(/behavior\s*:/gi, 'x:')
  return { html, css }
}

// --- filling in ------------------------------------------------------------------------

type Data = Record<string, unknown>

function lookup(ctx: Data[], name: string): unknown {
  if (name === '.') return ctx[ctx.length - 1]?.['.'] ?? ctx[ctx.length - 1]
  const parts = name.split('.')
  for (let i = ctx.length - 1; i >= 0; i--) {
    let v: unknown = ctx[i]
    let ok = true
    for (const p of parts) {
      if (v && typeof v === 'object' && p in (v as Data)) v = (v as Data)[p]
      else {
        ok = false
        break
      }
    }
    if (ok) return v
  }
  return undefined
}

const truthy = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : !!v)

/**
 * A small Mustache: {{name}}, {{a.b}}, {{.}}, {{#list}}…{{/list}}, {{^list}}…{{/list}}.
 * Every value is escaped; there is no way to output raw HTML.
 */
export function fillTemplate(html: string, data: Data): string {
  const render = (src: string, ctx: Data[], depth: number): string => {
    if (depth > 8) return ''
    let out = ''
    let i = 0
    const open = /\{\{\s*([#^/]?)\s*([a-zA-Z0-9_.]+|\.)\s*\}\}/g
    while (i < src.length) {
      open.lastIndex = i
      const m = open.exec(src)
      if (!m) {
        out += src.slice(i)
        break
      }
      out += src.slice(i, m.index)
      const [tag, kind, name] = m as unknown as [string, string, string]
      i = m.index + tag.length
      if (kind === '/') continue // stray closing tag
      if (!kind) {
        const v = lookup(ctx, name)
        out += v === undefined || v === null || typeof v === 'object' ? '' : esc(v)
        continue
      }
      // Find the matching close, allowing nested sections of the same name.
      const re = new RegExp(`\\{\\{\\s*([#^/])\\s*${name.replace(/\./g, '\\.')}\\s*\\}\\}`, 'g')
      re.lastIndex = i
      let level = 1
      let end = -1
      let after = i
      let t: RegExpExecArray | null
      while ((t = re.exec(src))) {
        if (t[1] === '/') level--
        else level++
        if (level === 0) {
          end = t.index
          after = t.index + t[0].length
          break
        }
      }
      if (end < 0) continue
      const inner = src.slice(i, end)
      i = after
      const v = lookup(ctx, name)
      if (kind === '^') {
        if (!truthy(v)) out += render(inner, ctx, depth + 1)
      } else if (Array.isArray(v)) {
        for (const item of v.slice(0, 200)) {
          out += render(inner, [...ctx, item && typeof item === 'object' ? (item as Data) : { '.': item }], depth + 1)
        }
      } else if (truthy(v)) {
        out += render(inner, v && typeof v === 'object' ? [...ctx, v as Data] : ctx, depth + 1)
      }
    }
    return out
  }
  return render(html, [data], 0)
}

/** The values a template can use. */
export function templateData(cv: MasterCv, labels: CvLabels, photo: string): Data {
  const dates = (a: string, b: string): string => [a, b].filter(Boolean).join(' – ')
  const contact = cv.contact
  return {
    name: cv.name,
    headline: cv.headline,
    summary: cv.summary,
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    links: contact.links,
    photo: safeImage(photo),
    experience: cv.experience.map((e) => ({ ...e, dates: dates(e.start, e.end) })),
    education: cv.education.map((e) => ({ ...e, dates: dates(e.start, e.end) })),
    skills: cv.skills,
    skillsText: cv.skills.join(' · '),
    languages: cv.languages.map((l) => ({ ...l, text: [l.name, l.level].filter(Boolean).join(' – ') })),
    certificates: cv.certificates,
    projects: cv.projects,
    other: cv.other,
    labels,
    has: {
      photo: !!safeImage(photo),
      headline: !!cv.headline,
      summary: !!cv.summary,
      experience: cv.experience.length > 0,
      education: cv.education.length > 0,
      skills: cv.skills.length > 0,
      languages: cv.languages.length > 0,
      certificates: cv.certificates.length > 0,
      projects: cv.projects.length > 0,
      other: cv.other.length > 0,
      links: contact.links.length > 0,
      contact: !!(contact.email || contact.phone || contact.location)
    }
  }
}

/**
 * Flips a left-to-right design for right-to-left text: grids and flex already
 * mirror with dir="rtl", so physical left/right and gradient angles flip too.
 */
export function mirrorCss(css: string): string {
  return css
    .replace(/\b(left|right)\b/g, (w) => (w === 'left' ? 'right' : 'left'))
    .replace(
      /(linear-gradient\(\s*)(-?\d+(?:\.\d+)?)deg/g,
      (_m, pre: string, deg: string) => `${pre}${(360 - Number(deg)) % 360}deg`
    )
}

export interface DesignDocInput {
  template: DesignTemplate
  cv: MasterCv
  labels: CvLabels
  photo: string
  lang: string
  dir: 'ltr' | 'rtl'
  paper?: 'A4' | 'Letter'
}

/** The user's design filled with a CV. The page has no margin: the design sets its own spacing. */
export function designDoc(input: DesignDocInput): DocHtml {
  const pageHeight = input.paper === 'Letter' ? '278.9mm' : '296.5mm'
  const clean = sanitizeTemplate(input.template)
  const t = input.dir === 'rtl' ? { ...clean, css: mirrorCss(clean.css) } : clean
  const body = fillTemplate(t.html, templateData(input.cv, input.labels, input.photo))
  const css = `
  @page { size: ${input.paper ?? 'A4'}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: 'Inter', 'IBM Plex Sans Arabic', sans-serif; color: #1d2433; font-size: 10pt; line-height: 1.45;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  img { max-width: 100%; }
  /* At least one page tall, so full-height sidebars reach the bottom (a hair short of it, so no empty second page). */
  .tatabu-design, .tatabu-design > :first-child { min-height: ${pageHeight}; }
  ${t.css}
  `
  return {
    title: input.cv.name || 'CV',
    css,
    body: `<div class="tatabu-design" dir="${input.dir}">${body}</div>`,
    dir: input.dir,
    lang: input.lang
  }
}
