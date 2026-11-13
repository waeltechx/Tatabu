/**
 * Tailored CVs: one per application and document language, built only from the
 * master CV. The AI returns the CV it would send, with every line citing the
 * master facts it came from. Code then works out what changed (rewritten,
 * reordered, reworded, left out), lets the user reject any change, and keeps the
 * user's own edits on top. Only AI text the user hasn't touched is fact-checked.
 */
import { cvFacts, type CvEducation, type CvEntry, type CvExperience, type CvSection, type MasterCv } from './cv'
import type { FactItem, FactWarning, Translation } from './verify'

export type CvLook = 'ats' | 'mine'

/** One piece of CV text and the master facts it came from. Ids starting "m:" are master text put back. */
export interface TItem {
  id: string
  text: string
  sources: string[]
  translations: Translation[]
}

export interface TRole {
  /** The master role's id ("e1"): organisation, place and dates come from there. */
  id: string
  title: TItem
  bullets: TItem[]
}
export interface TEducation {
  id: string
  degree: TItem
  details: TItem[]
}
export interface TEntry {
  id: string
  name: TItem
  detail: TItem
}
export interface TSection {
  id: string
  title: TItem
  lines: TItem[]
}

export interface TailoredCv {
  headline: TItem
  summary: TItem
  experience: TRole[]
  education: TEducation[]
  skills: TItem[]
  languages: TItem[]
  certificates: TEntry[]
  projects: TEntry[]
  other: TSection[]
}

/** Section names on the page. Built in for en/de/ar; the AI supplies them for other languages. */
export interface CvLabels {
  summary: string
  experience: string
  education: string
  skills: string
  languages: string
  certificates: string
  projects: string
  contact: string
  present: string
}

export type ChangeKind = 'rewritten' | 'reordered' | 'reworded' | 'left_out'
export type ChangeTarget =
  'headline' | 'summary' | 'skills' | 'experience' | 'bullet' | 'role' | 'education' | 'entry' | 'section'

export interface CvChange {
  id: string
  kind: ChangeKind
  target: ChangeTarget
  old: string
  new: string
  sources: string[]
  /** Undoing it would put text in another language into a translated CV. */
  revertible: boolean
}

export interface CvTailorState {
  language: string
  look: CvLook
  /** "Anything to highlight?": steers emphasis only, never a source of facts. */
  highlight: string
  tailored: TailoredCv | null
  changes: CvChange[]
  /** Ids of the changes the user turned off. */
  rejected: string[]
  /** The user's own text by item id. Never fact-checked. */
  edits: Record<string, string>
  /** Job requirements the master CV doesn't show, so they stay out. */
  missing: string[]
  warnings: FactWarning[]
  /** Warning ids the user chose to keep. */
  dismissed: string[]
  labels: Partial<CvLabels>
  /** Language of the master CV when this was tailored. */
  sourceLanguage: string
  generatedAt: string
}

export const EMPTY_TAILOR: Omit<CvTailorState, 'language'> = {
  look: 'ats',
  highlight: '',
  tailored: null,
  changes: [],
  rejected: [],
  edits: {},
  missing: [],
  warnings: [],
  dismissed: [],
  labels: {},
  sourceLanguage: '',
  generatedAt: ''
}

const BUILT_IN: Record<string, CvLabels> = {
  en: {
    summary: 'Summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    languages: 'Languages',
    certificates: 'Certificates',
    projects: 'Projects',
    contact: 'Contact',
    present: 'Present'
  },
  de: {
    summary: 'Profil',
    experience: 'Berufserfahrung',
    education: 'Ausbildung',
    skills: 'Kenntnisse',
    languages: 'Sprachen',
    certificates: 'Zertifikate',
    projects: 'Projekte',
    contact: 'Kontakt',
    present: 'heute'
  },
  ar: {
    summary: 'نبذة مهنية',
    experience: 'الخبرة العملية',
    education: 'التعليم',
    skills: 'المهارات',
    languages: 'اللغات',
    certificates: 'الشهادات',
    projects: 'المشاريع',
    contact: 'التواصل',
    present: 'حتى الآن'
  }
}

export function cvLabels(code: string, overrides?: Partial<CvLabels>): CvLabels {
  const base = BUILT_IN[code] ?? BUILT_IN.en!
  const out = { ...base }
  if (!BUILT_IN[code] && overrides) {
    for (const [k, v] of Object.entries(overrides)) if (typeof v === 'string' && v.trim()) out[k as keyof CvLabels] = v.trim()
  }
  return out
}

/** "Present", "now", "heute", "حتى الآن"… → the label in the CV's language. */
export function localEnd(end: string, labels: CvLabels): string {
  return /^(present|now|current|today|ongoing|heute|aktuell|derzeit|bis heute|حتى الآن|الآن|حاليا|حالياً)$/i.test(end.trim())
    ? labels.present
    : end
}

// --- items ---------------------------------------------------------------------------

const item = (id: string, text: string, sources: string[] = [], translations: Translation[] = []): TItem => ({
  id,
  text,
  sources,
  translations
})

/** Master text put back into the CV, citing itself. */
const masterItem = (key: string, text: string): TItem => item(`m:${key}`, text, [key])

/** Every item of a tailored CV, in page order. */
export function allItems(cv: TailoredCv): TItem[] {
  const out: TItem[] = [cv.headline, cv.summary]
  for (const r of cv.experience) out.push(r.title, ...r.bullets)
  for (const e of cv.education) out.push(e.degree, ...e.details)
  out.push(...cv.skills, ...cv.languages)
  for (const c of [...cv.certificates, ...cv.projects]) out.push(c.name, c.detail)
  for (const s of cv.other) out.push(s.title, ...s.lines)
  return out
}

const keyIndex = (key: string | undefined): number => Number(/(\d+)$/.exec(key ?? '')?.[1] ?? 9999)
const masterOrder = <T extends { id: string }>(list: T[], master: Array<{ id: string }>): T[] => {
  const pos = new Map(master.map((m, i) => [m.id, i]))
  return [...list].sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999))
}

// --- what changed ---------------------------------------------------------------------

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Compares the AI's CV with the master CV. Translated CVs list fewer changes: rewording there is just translation. */
export function diffCv(master: MasterCv, cv: TailoredCv, sameLanguage: boolean): CvChange[] {
  const facts = cvFacts(master)
  const out: CvChange[] = []
  const change = (c: CvChange): void => {
    out.push(c)
  }

  if (sameLanguage && cv.headline.text && master.headline && norm(cv.headline.text) !== norm(master.headline)) {
    change({
      id: 'headline',
      kind: 'rewritten',
      target: 'headline',
      old: master.headline,
      new: cv.headline.text,
      sources: cv.headline.sources,
      revertible: true
    })
  }
  if (cv.summary.text && norm(cv.summary.text) !== norm(master.summary)) {
    change({
      id: 'summary',
      kind: 'rewritten',
      target: 'summary',
      old: master.summary,
      new: cv.summary.text,
      sources: cv.summary.sources,
      revertible: sameLanguage && !!master.summary
    })
  }

  // Skills that moved up.
  const skillKeys = cv.skills.map((s) => s.sources.find((k) => k.startsWith('skills.'))).filter((k): k is string => !!k)
  const sorted = [...skillKeys].sort((a, b) => keyIndex(a) - keyIndex(b))
  if (skillKeys.join() !== sorted.join()) {
    change({
      id: 'order:skills',
      kind: 'reordered',
      target: 'skills',
      old: '',
      new: cv.skills
        .slice(0, 4)
        .map((s) => s.text)
        .join(', '),
      sources: [],
      revertible: true
    })
  }

  // Roles in a new order.
  const roleIds = cv.experience.map((r) => r.id)
  const masterRoleIds = master.experience.map((r) => r.id).filter((id) => roleIds.includes(id))
  if (roleIds.join() !== masterRoleIds.join()) {
    change({
      id: 'order:experience',
      kind: 'reordered',
      target: 'experience',
      old: '',
      new: cv.experience.map((r) => r.title.text).join(' · '),
      sources: [],
      revertible: true
    })
  }

  // Bullets reworded (same language only) and bullets left out.
  for (const role of cv.experience) {
    const m = master.experience.find((r) => r.id === role.id)
    if (!m) continue
    if (sameLanguage) {
      for (const b of role.bullets) {
        const cited = b.sources.filter((k) => k in facts)
        if (!cited.length) continue
        const old = cited.map((k) => facts[k]).join(' ')
        if (norm(old) !== norm(b.text)) {
          change({ id: `word:${b.id}`, kind: 'reworded', target: 'bullet', old, new: b.text, sources: cited, revertible: true })
        }
      }
    }
    const used = new Set(role.bullets.flatMap((b) => b.sources))
    m.bullets.forEach((text, i) => {
      const key = `${m.id}.b${i}`
      if (!used.has(key))
        change({ id: `out:${key}`, kind: 'left_out', target: 'bullet', old: text, new: '', sources: [key], revertible: true })
    })
  }

  // Whole roles, schooling and entries left out.
  for (const r of master.experience) {
    if (!roleIds.includes(r.id)) {
      change({
        id: `out:${r.id}`,
        kind: 'left_out',
        target: 'role',
        old: [r.title, r.organization].filter(Boolean).join(' · '),
        new: '',
        sources: [`${r.id}.title`],
        revertible: true
      })
    }
  }
  for (const e of master.education) {
    if (!cv.education.some((x) => x.id === e.id)) {
      change({
        id: `out:${e.id}`,
        kind: 'left_out',
        target: 'education',
        old: [e.degree, e.institution].filter(Boolean).join(' · '),
        new: '',
        sources: [`${e.id}.degree`],
        revertible: true
      })
    }
  }
  for (const c of [...master.certificates, ...master.projects]) {
    if (![...cv.certificates, ...cv.projects].some((x) => x.id === c.id)) {
      change({
        id: `out:${c.id}`,
        kind: 'left_out',
        target: 'entry',
        old: c.name,
        new: '',
        sources: [`${c.id}.name`],
        revertible: true
      })
    }
  }
  for (const s of master.other) {
    if (!cv.other.some((x) => x.id === s.id)) {
      change({
        id: `out:${s.id}`,
        kind: 'left_out',
        target: 'section',
        old: s.title,
        new: '',
        sources: [`${s.id}.title`],
        revertible: true
      })
    }
  }

  // Skills left out: one change for all of them.
  const usedSkills = new Set(cv.skills.flatMap((s) => s.sources))
  const outSkills = master.skills.map((s, i) => ({ s, key: `skills.${i}` })).filter((x) => !usedSkills.has(x.key))
  if (outSkills.length) {
    change({
      id: 'out:skills',
      kind: 'left_out',
      target: 'skills',
      old: outSkills.map((x) => x.s).join(', '),
      new: '',
      sources: outSkills.map((x) => x.key),
      revertible: true
    })
  }
  return out
}

// --- applying the user's choices --------------------------------------------------------

/** The CV with rejected changes undone and the user's edits on top. */
export function applyChoices(
  master: MasterCv,
  base: TailoredCv,
  changes: CvChange[],
  rejected: string[],
  edits: Record<string, string>
): TailoredCv {
  const cv: TailoredCv = structuredClone(base)
  const off = new Set(rejected.filter((id) => changes.some((c) => c.id === id && c.revertible)))
  const byId = new Map(changes.map((c) => [c.id, c]))

  if (off.has('headline')) cv.headline = masterItem('headline', master.headline)
  if (off.has('summary')) cv.summary = masterItem('summary', master.summary)

  for (const role of cv.experience) {
    role.bullets = role.bullets.map((b) => {
      const c = byId.get(`word:${b.id}`)
      return c && off.has(c.id) ? { ...b, text: c.old, translations: [] } : b
    })
  }
  for (const m of master.experience) {
    if (off.has(`out:${m.id}`) && !cv.experience.some((r) => r.id === m.id)) {
      const role: TRole = {
        id: m.id,
        title: masterItem(`${m.id}.title`, m.title),
        bullets: m.bullets.map((b, i) => masterItem(`${m.id}.b${i}`, b))
      }
      const at = cv.experience.findIndex((r) => keyIndex(r.id) > keyIndex(m.id))
      cv.experience.splice(at < 0 ? cv.experience.length : at, 0, role)
    }
    const role = cv.experience.find((r) => r.id === m.id)
    if (!role) continue
    m.bullets.forEach((b, i) => {
      const key = `${m.id}.b${i}`
      if (off.has(`out:${key}`) && !role.bullets.some((x) => x.id === `m:${key}`)) role.bullets.push(masterItem(key, b))
    })
  }
  if (off.has('order:experience')) cv.experience = masterOrder(cv.experience, master.experience)

  for (const e of master.education) {
    if (off.has(`out:${e.id}`) && !cv.education.some((x) => x.id === e.id)) {
      cv.education.push({
        id: e.id,
        degree: masterItem(`${e.id}.degree`, e.degree),
        details: e.details.map((d, i) => masterItem(`${e.id}.d${i}`, d))
      })
    }
  }
  cv.education = cv.education.length && master.education.length ? masterOrderKeep(cv.education, master.education) : cv.education

  const putBack = (list: TEntry[], from: CvEntry[]): void => {
    for (const c of from) {
      if (off.has(`out:${c.id}`) && !list.some((x) => x.id === c.id)) {
        list.push({ id: c.id, name: masterItem(`${c.id}.name`, c.name), detail: masterItem(`${c.id}.detail`, c.detail) })
      }
    }
  }
  putBack(cv.certificates, master.certificates)
  putBack(cv.projects, master.projects)
  for (const s of master.other) {
    if (off.has(`out:${s.id}`) && !cv.other.some((x) => x.id === s.id)) {
      cv.other.push({
        id: s.id,
        title: masterItem(`${s.id}.title`, s.title),
        lines: s.lines.map((l, i) => masterItem(`${s.id}.l${i}`, l))
      })
    }
  }

  if (off.has('order:skills')) {
    cv.skills = [...cv.skills].sort(
      (a, b) =>
        keyIndex(a.sources.find((k) => k.startsWith('skills.'))) - keyIndex(b.sources.find((k) => k.startsWith('skills.')))
    )
  }
  if (off.has('out:skills')) {
    for (const key of byId.get('out:skills')?.sources ?? []) {
      const text = master.skills[keyIndex(key)]
      if (text && !cv.skills.some((s) => s.id === `m:${key}`)) cv.skills.push(masterItem(key, text))
    }
  }

  // The user's own words win.
  for (const it of allItems(cv)) if (typeof edits[it.id] === 'string') it.text = edits[it.id]!
  return cv
}

/** Education stays in the order the AI chose, except put-back entries go where they were. */
function masterOrderKeep(list: TEducation[], master: CvEducation[]): TEducation[] {
  const restored = list.filter((e) => e.degree.id.startsWith('m:'))
  if (!restored.length) return list
  return masterOrder(list, master)
}

/** AI text the user hasn't replaced: the only text the fact checker looks at. */
export function checkableItems(cv: TailoredCv, edits: Record<string, string>): FactItem[] {
  const exact = new Set<string>()
  for (const r of cv.experience) exact.add(r.title.id)
  for (const s of cv.skills) exact.add(s.id)
  for (const c of [...cv.certificates, ...cv.projects]) exact.add(c.name.id)
  return allItems(cv)
    .filter((it) => it.text.trim() && !it.id.startsWith('m:') && typeof edits[it.id] !== 'string')
    .map((it) => ({ id: it.id, text: it.text, sources: it.sources, translations: it.translations, exact: exact.has(it.id) }))
}

// --- the page ----------------------------------------------------------------------------

export interface ResolvedCv {
  cv: MasterCv
  /** Item id → its key in `cv` (for highlighting and "Show me"). */
  keys: Record<string, string>
}

/** A plain CV to print: AI text where it is, master facts (organisations, places, dates) around it. */
export function resolveCv(master: MasterCv, tailored: TailoredCv, labels: CvLabels, language: string): ResolvedCv {
  const keys: Record<string, string> = {}
  const t = (it: TItem, key: string): string => {
    keys[it.id] = key
    return it.text.trim()
  }
  const experience: CvExperience[] = []
  for (const r of tailored.experience) {
    const m = master.experience.find((x) => x.id === r.id)
    if (!m) continue
    const id = `e${experience.length + 1}`
    const bullets: string[] = []
    for (const b of r.bullets) {
      const text = b.text.trim()
      if (!text) continue
      keys[b.id] = `${id}.b${bullets.length}`
      bullets.push(text)
    }
    experience.push({
      id,
      title: t(r.title, `${id}.title`),
      organization: m.organization,
      location: m.location,
      start: m.start,
      end: localEnd(m.end, labels),
      bullets
    })
  }
  const education: CvEducation[] = []
  for (const e of tailored.education) {
    const m = master.education.find((x) => x.id === e.id)
    if (!m) continue
    const id = `ed${education.length + 1}`
    const details: string[] = []
    for (const d of e.details) {
      if (!d.text.trim()) continue
      keys[d.id] = `${id}.d${details.length}`
      details.push(d.text.trim())
    }
    education.push({
      id,
      degree: t(e.degree, `${id}.degree`),
      institution: m.institution,
      location: m.location,
      start: m.start,
      end: localEnd(m.end, labels),
      details
    })
  }
  const entries = (list: TEntry[], from: CvEntry[], prefix: string): CvEntry[] => {
    const out: CvEntry[] = []
    for (const c of list) {
      const m = from.find((x) => x.id === c.id)
      if (!m) continue
      const id = `${prefix}${out.length + 1}`
      out.push({ id, name: t(c.name, `${id}.name`), detail: t(c.detail, `${id}.detail`), date: m.date })
    }
    return out.filter((c) => c.name || c.detail)
  }
  const skills: string[] = []
  for (const s of tailored.skills) {
    if (!s.text.trim() || skills.includes(s.text.trim())) continue
    keys[s.id] = `skills.${skills.length}`
    skills.push(s.text.trim())
  }
  const languages = tailored.languages
    .filter((l) => l.text.trim())
    .map((l, i) => {
      keys[l.id] = `languages.${i}`
      return { name: l.text.trim(), level: '' }
    })
  const other: CvSection[] = []
  for (const s of tailored.other) {
    const id = `o${other.length + 1}`
    const lines: string[] = []
    for (const l of s.lines) {
      if (!l.text.trim()) continue
      keys[l.id] = `${id}.l${lines.length}`
      lines.push(l.text.trim())
    }
    other.push({ id, title: t(s.title, `${id}.title`), lines })
  }
  return {
    cv: {
      name: master.name,
      headline: t(tailored.headline, 'headline'),
      contact: master.contact,
      summary: t(tailored.summary, 'summary'),
      experience,
      education,
      skills,
      languages,
      certificates: entries(tailored.certificates, master.certificates, 'c'),
      projects: entries(tailored.projects, master.projects, 'p'),
      other: other.filter((s) => s.title || s.lines.length),
      language
    },
    keys
  }
}

/** Where a change's text came from, in words: "Senior Data Analyst · Brightwave", "Skills"… */
export function describeSource(master: MasterCv, key: string): string {
  const id = /^([a-z]+\d+)\./.exec(key)?.[1]
  if (id) {
    const r = master.experience.find((x) => x.id === id)
    if (r) return [r.title, r.organization].filter(Boolean).join(' · ')
    const e = master.education.find((x) => x.id === id)
    if (e) return [e.degree, e.institution].filter(Boolean).join(' · ')
    const c = [...master.certificates, ...master.projects].find((x) => x.id === id)
    if (c) return c.name
    const s = master.other.find((x) => x.id === id)
    if (s) return s.title
  }
  return key.split('.')[0] ?? key
}
