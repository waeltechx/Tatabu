/**
 * The master CV: the user's CV turned into structured facts. It is the only
 * source of facts for tailored CVs and cover letters. Every fact-bearing piece
 * has a stable key ("e1.title", "e1.b0", "skills.3", …) that AI output cites and
 * the fact checker looks up.
 */
import type { FactWarning } from './verify'

export interface CvContact {
  email: string
  phone: string
  location: string
  links: string[]
}

export interface CvExperience {
  id: string
  title: string
  organization: string
  location: string
  start: string
  end: string
  bullets: string[]
}

export interface CvEducation {
  id: string
  degree: string
  institution: string
  location: string
  start: string
  end: string
  details: string[]
}

export interface CvLanguage {
  name: string
  level: string
}

/** Certificates, projects, awards… a name plus an optional line. */
export interface CvEntry {
  id: string
  name: string
  detail: string
  date: string
}

/** Anything else on the CV, kept as written (publications, volunteering…). */
export interface CvSection {
  id: string
  title: string
  lines: string[]
}

export interface MasterCv {
  name: string
  headline: string
  contact: CvContact
  summary: string
  experience: CvExperience[]
  education: CvEducation[]
  skills: string[]
  languages: CvLanguage[]
  certificates: CvEntry[]
  projects: CvEntry[]
  other: CvSection[]
  /** ISO 639-1 code of the CV's own language. */
  language: string
}

export const EMPTY_CV: MasterCv = {
  name: '',
  headline: '',
  contact: { email: '', phone: '', location: '', links: [] },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certificates: [],
  projects: [],
  other: [],
  language: 'en'
}

/** What the master CV screen shows. */
export interface MasterState {
  cv: MasterCv | null
  /** The uploaded file the facts were read from (or are waiting to be read from). */
  source: { id: string; filename: string } | null
  /** True when `source` is newer than the facts (uploaded but not read yet). */
  unread: boolean
  updatedAt: string
  /** Things the AI wrote while reading the CV that the file doesn't seem to say. */
  warnings: FactWarning[]
}

/** "Fix it": rewrite one item using only these sources. */
export interface FixRequest {
  text: string
  /** Source texts the item may use. */
  sources: string[]
  /** Short notes on what didn't check out ("20", "Snowflake"…). */
  problems: string[]
  language: string
}

// --- keys ----------------------------------------------------------------------

/** Every fact in the master CV by key, for prompts and for the fact checker. */
export function cvFacts(cv: MasterCv): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (k: string, v: string): void => {
    if (v && v.trim()) out[k] = v.trim()
  }
  put('name', cv.name)
  put('headline', cv.headline)
  put('contact.email', cv.contact.email)
  put('contact.phone', cv.contact.phone)
  put('contact.location', cv.contact.location)
  cv.contact.links.forEach((l, i) => put(`contact.link${i}`, l))
  put('summary', cv.summary)
  for (const e of cv.experience) {
    put(`${e.id}.title`, e.title)
    put(`${e.id}.organization`, e.organization)
    put(`${e.id}.location`, e.location)
    put(`${e.id}.dates`, [e.start, e.end].filter(Boolean).join(' – '))
    e.bullets.forEach((b, i) => put(`${e.id}.b${i}`, b))
  }
  for (const e of cv.education) {
    put(`${e.id}.degree`, e.degree)
    put(`${e.id}.institution`, e.institution)
    put(`${e.id}.location`, e.location)
    put(`${e.id}.dates`, [e.start, e.end].filter(Boolean).join(' – '))
    e.details.forEach((d, i) => put(`${e.id}.d${i}`, d))
  }
  cv.skills.forEach((s, i) => put(`skills.${i}`, s))
  cv.languages.forEach((l, i) => put(`languages.${i}`, [l.name, l.level].filter(Boolean).join(' – ')))
  for (const c of [...cv.certificates, ...cv.projects]) {
    put(`${c.id}.name`, c.name)
    put(`${c.id}.detail`, c.detail)
    put(`${c.id}.date`, c.date)
  }
  for (const s of cv.other) {
    put(`${s.id}.title`, s.title)
    s.lines.forEach((l, i) => put(`${s.id}.l${i}`, l))
  }
  return out
}

/** The master CV as "[key] text" lines, the form AI prompts use so the model can cite keys. */
export function cvFactsPrompt(cv: MasterCv): string {
  return Object.entries(cvFacts(cv))
    .filter(([k]) => !k.startsWith('contact.'))
    .map(([k, v]) => `[${k}] ${v.replace(/\s+/g, ' ')}`)
    .join('\n')
}

// --- cleaning --------------------------------------------------------------------

const s = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '')
const list = (v: unknown, max = 60, len = 1000): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => s(x, len))
    .filter(Boolean)
    .slice(0, max)

/** Numbers entries after empty ones are dropped: e1, e2… */
const ids =
  (prefix: string) =>
  <T extends { id: string }>(r: T, i: number): T => ({ ...r, id: `${prefix}${i + 1}` })

/** Makes any input (AI output, the user's edits) a valid master CV with fresh, unique ids. */
export function cleanCv(input: unknown): MasterCv {
  const x = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const contact = (x.contact && typeof x.contact === 'object' ? x.contact : {}) as Record<string, unknown>
  const arr = (v: unknown): Record<string, unknown>[] =>
    (Array.isArray(v) ? v : []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').slice(0, 40)
  const language = s(x.language, 10).toLowerCase().split(/[-_]/)[0] ?? ''
  const entries = (v: unknown, prefix: string): CvEntry[] =>
    arr(v)
      .map((r) => ({ id: '', name: s(r.name, 300), detail: s(r.detail, 1000), date: s(r.date, 60) }))
      .filter((r) => r.name || r.detail)
      .map(ids(prefix))
  return {
    name: s(x.name, 200),
    headline: s(x.headline, 300),
    contact: {
      email: s(contact.email, 200),
      phone: s(contact.phone, 80),
      location: s(contact.location, 300),
      links: list(contact.links, 10, 300)
    },
    summary: s(x.summary, 4000),
    experience: arr(x.experience)
      .map((r) => ({
        id: '',
        title: s(r.title, 300),
        organization: s(r.organization, 300),
        location: s(r.location, 200),
        start: s(r.start, 40),
        end: s(r.end, 40),
        bullets: list(r.bullets, 30)
      }))
      .filter((r) => r.title || r.organization || r.bullets.length)
      .map(ids('e')),
    education: arr(x.education)
      .map((r) => ({
        id: '',
        degree: s(r.degree, 300),
        institution: s(r.institution, 300),
        location: s(r.location, 200),
        start: s(r.start, 40),
        end: s(r.end, 40),
        details: list(r.details, 20)
      }))
      .filter((r) => r.degree || r.institution)
      .map(ids('ed')),
    skills: [...new Set(list(x.skills, 80, 120))],
    languages: arr(x.languages)
      .map((r) => ({ name: s(r.name, 80), level: s(r.level, 120) }))
      .filter((r) => r.name)
      .slice(0, 20),
    certificates: entries(x.certificates, 'c'),
    projects: entries(x.projects, 'p'),
    other: arr(x.other)
      .map((r) => ({ id: '', title: s(r.title, 200), lines: list(r.lines, 40) }))
      .filter((r) => r.title || r.lines.length)
      .map(ids('o')),
    language: /^[a-z]{2,3}$/.test(language) ? language : 'en'
  }
}

/** True when nothing but the language is filled in. */
export function isEmptyCv(cv: MasterCv): boolean {
  return Object.keys(cvFacts(cv)).length === 0
}

/** Replaces one fact by its key (for "Fix it"). Returns null when the key can't be set on its own. */
export function setCvFact(cv: MasterCv, key: string, value: string): MasterCv | null {
  const next: MasterCv = structuredClone(cv)
  if (key === 'name' || key === 'headline' || key === 'summary') {
    next[key] = value
    return next
  }
  const skill = /^skills\.(\d+)$/.exec(key)
  if (skill) {
    const i = Number(skill[1])
    if (i >= next.skills.length) return null
    next.skills[i] = value
    return next
  }
  const m = /^([a-z]+\d+)\.(title|organization|location|degree|institution|name|detail|date|b\d+|d\d+|l\d+)$/.exec(key)
  if (!m) return null
  const [, id, field] = m as unknown as [string, string, string]
  const listField = /^([bdl])(\d+)$/.exec(field)
  const groups = [next.experience, next.education, next.certificates, next.projects, next.other] as Array<Array<{ id: string }>>
  for (const group of groups) {
    const entry = group.find((e) => e.id === id) as Record<string, unknown> | undefined
    if (!entry) continue
    if (listField) {
      const name = { b: 'bullets', d: 'details', l: 'lines' }[listField[1] as 'b' | 'd' | 'l']
      const arr = entry[name]
      const i = Number(listField[2])
      if (!Array.isArray(arr) || i >= arr.length) return null
      arr[i] = value
      return next
    }
    if (typeof entry[field] !== 'string') return null
    entry[field] = value
    return next
  }
  return null
}
