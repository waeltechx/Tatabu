/** Cover letters: state per application and language, prepare, write, check, fix, copy prompt, print. */
import type { ProviderId } from '@shared/ai'
import type { Application } from '@shared/applications'
import { cvFacts, cvFactsPrompt } from '@shared/cv'
import { docLabels, languageCode } from '@shared/docs/common'
import { letterDoc } from '@shared/docs/letter'
import type { SavedPdf } from '@shared/documents'
import { EMPTY_LETTER, isLetterLayout, layoutFor, sanitizeLetter, type EnclosureOption, type LetterState } from '@shared/letter'
import type { Profile } from '@shared/profile'
import { verifyItems, type FactItem } from '@shared/verify'
import { getDb } from './services'
import { getApplication } from './repo/applications'
import { getDocument, getLetterLayout, saveDocument, setLetterLayout } from './repo/documents'
import { getProfile } from './repo/profile'
import { listLibrary } from './repo/library'
import { listFiles } from './applications'
import { findLanguage, paperSize, pdfName, printDoc, storePdf } from './documents'
import { getMasterCv } from './cv'
import { fixItem } from './cv'
import { runJson } from './ai/service'
import {
  assembleLetter,
  externalPrompt,
  LetterOutput,
  LetterPrep,
  letterSystem,
  letterUser,
  prepareSystem,
  type LetterContext
} from './ai/tasks/letter'

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const strs = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v : []).slice(0, n).map((x) => str(x, max))

function langInfo(languageId: string): { id: string; code: string; name: string; dir: 'ltr' | 'rtl' } {
  const lang = findLanguage(languageId)
  return { id: lang.id, code: languageCode(lang), name: lang.name, dir: lang.dir }
}

/** The recipient block from the posting: contact person, company, address lines. */
function defaultRecipient(app: Application): string {
  return [app.contactPerson, app.company, ...app.companyAddress.split(/\s*,\s*|\n/)]
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function cleanItems(v: unknown): FactItem[] {
  return (Array.isArray(v) ? v : []).slice(0, 120).map((x, i) => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return {
      id: str(r.id, 40) || `s${i}`,
      text: str(r.text, 2000),
      sources: strs(r.sources, 20, 60),
      translations: (Array.isArray(r.translations) ? r.translations : []).slice(0, 20).map((t) => ({
        source: str((t as Record<string, unknown>)?.source, 300),
        target: str((t as Record<string, unknown>)?.target, 300)
      }))
    }
  })
}

/** Makes any input a valid letter state for this language. */
export function cleanLetter(input: Partial<LetterState>, languageId: string): LetterState {
  const lang = langInfo(languageId)
  const x = (input ?? {}) as Record<string, unknown>
  const labels = (x.labels && typeof x.labels === 'object' ? x.labels : {}) as Record<string, unknown>
  return {
    language: lang.id,
    layout: layoutFor(lang.code, lang.dir, isLetterLayout(x.layout) ? x.layout : null),
    subject: str(x.subject, 300),
    subjects: strs(x.subjects, 6, 300),
    questions: strs(x.questions, 6, 500),
    answers: strs(x.answers, 6, 2000),
    motivation: str(x.motivation, 3000),
    recipient: str(x.recipient, 1000),
    body: str(x.body, 20_000),
    enclosures: strs(x.enclosures, 20, 200).filter((e) => e.trim()),
    signature: x.signature !== false,
    items: cleanItems(x.items),
    warnings: Array.isArray(x.warnings) ? (x.warnings as LetterState['warnings']).slice(0, 200) : [],
    labels: { subject: str(labels.subject, 40), enclosures: str(labels.enclosures, 40), date: str(labels.date, 40) },
    date: str(x.date, 40),
    generatedAt: str(x.generatedAt, 40)
  }
}

/** The saved letter for an application and language, or a fresh one with the recipient filled in. */
export function letterState(applicationId: string, languageId: string): LetterState {
  const db = getDb()
  const app = getApplication(db, applicationId)
  const lang = langInfo(languageId)
  const saved = getDocument<Partial<LetterState>>(db, applicationId, 'cover_letter', lang.id)
  if (saved) return cleanLetter({ ...saved.data, layout: (saved.layout || saved.data.layout) as LetterState['layout'] }, lang.id)
  return cleanLetter(
    {
      ...EMPTY_LETTER,
      recipient: defaultRecipient(app),
      layout: (getLetterLayout(db, lang.id) ?? undefined) as LetterState['layout']
    },
    lang.id
  )
}

export function saveLetter(applicationId: string, input: Partial<LetterState>): LetterState {
  const db = getDb()
  getApplication(db, applicationId)
  const state = cleanLetter(input, String(input?.language ?? 'en'))
  const prev = getDocument(db, applicationId, 'cover_letter', state.language)
  saveDocument(db, { applicationId, kind: 'cover_letter', language: state.language, layout: state.layout, data: state })
  // The layout is remembered per document language for the next letter.
  if (!prev || prev.layout !== state.layout) setLetterLayout(db, state.language, state.layout)
  return state
}

/** What can go under "Enclosures": this application's files and the library. */
export function enclosureOptions(applicationId: string): EnclosureOption[] {
  const seen = new Set<string>()
  const out: EnclosureOption[] = []
  const add = (label: string, from: EnclosureOption['from']): void => {
    const clean = label.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase())
      out.push({ label: clean, from })
    }
  }
  for (const f of listFiles(applicationId)) if (f.type !== 'cover_letter' && f.type !== 'combined') add(f.filename, 'application')
  for (const l of listLibrary(getDb())) if (l.label !== 'CV') add(l.label || l.filename, 'library')
  return out
}

// --- AI --------------------------------------------------------------------------

function context(applicationId: string, state: LetterState): { app: Application; profile: Profile; ctx: LetterContext } {
  const db = getDb()
  const app = getApplication(db, applicationId)
  const profile = getProfile(db)
  const master = getMasterCv()
  if (!master) throw new Error('MASTER_CV_MISSING')
  return {
    app,
    profile,
    ctx: {
      profile,
      job: app,
      facts: cvFactsPrompt(master),
      answers: state.questions.map((q, i) => ({ question: q, answer: state.answers[i] ?? '' })),
      motivation: state.motivation,
      subject: state.subject
    }
  }
}

/** Facts a letter may use: the master CV, the user's answers and their reason for applying. */
function letterSources(state: LetterState): Record<string, string> {
  const master = getMasterCv()
  const sources: Record<string, string> = master ? cvFacts(master) : {}
  state.questions.forEach((q, i) => {
    const a = state.answers[i]?.trim()
    if (a) sources[`answer:${i + 1}`] = a
  })
  if (state.motivation.trim()) sources.motivation = state.motivation.trim()
  return sources
}

function verifyContext(app: Application, profile: Profile, state: LetterState): string[] {
  return [
    app.company,
    app.jobTitle,
    app.contactPerson,
    app.companyAddress,
    app.location,
    profile.fullName,
    state.subject,
    state.recipient
  ]
}

function checkLetter(applicationId: string, state: LetterState): LetterState['warnings'] {
  const db = getDb()
  const app = getApplication(db, applicationId)
  const lang = langInfo(state.language)
  return verifyItems(state.items, letterSources(state), {
    language: lang.code,
    context: verifyContext(app, getProfile(db), state)
  })
}

export async function prepareLetter(
  applicationId: string,
  input: Partial<LetterState>,
  override?: ProviderId
): Promise<LetterState> {
  const state = cleanLetter(input, String(input?.language ?? 'en'))
  const lang = langInfo(state.language)
  const { ctx } = context(applicationId, state)
  const result = await runJson(
    {
      system: prepareSystem(lang.code, lang.name),
      user: letterUser(ctx, 'Prepare now.'),
      schema: LetterPrep,
      schemaName: 'letter_prep',
      temperature: 0.4
    },
    override
  )
  const subjects = [...new Set(result.data.subjects.map((s) => s.trim()).filter(Boolean))].slice(0, 4)
  const questions = result.data.questions
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 4)
  const keepAnswers = questions.map((q) => {
    const i = state.questions.indexOf(q)
    return i >= 0 ? (state.answers[i] ?? '') : ''
  })
  return saveLetter(applicationId, {
    ...state,
    subjects,
    questions,
    answers: keepAnswers,
    subject: state.subject || subjects[0] || '',
    labels: ['en', 'ar', 'de'].includes(lang.code) ? {} : result.data.labels
  })
}

export async function generateLetter(
  applicationId: string,
  input: Partial<LetterState>,
  override?: ProviderId
): Promise<LetterState> {
  const state = cleanLetter(input, String(input?.language ?? 'en'))
  const lang = langInfo(state.language)
  const { profile, ctx } = context(applicationId, state)
  const result = await runJson(
    {
      system: letterSystem(lang.code, lang.name),
      user: letterUser(ctx),
      schema: LetterOutput,
      schemaName: 'cover_letter',
      temperature: 0.55,
      maxTokens: 4000,
      timeoutMs: 150_000
    },
    override
  )
  const { body, items } = assembleLetter(result.data, lang.code, profile.fullName, sanitizeLetter)
  const next: LetterState = {
    ...state,
    body,
    items,
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString()
  }
  next.warnings = checkLetter(applicationId, next)
  return saveLetter(applicationId, next)
}

/** "Fix it": rewrites one sentence from the facts it cites, puts it into the letter and checks it again. */
export async function fixLetterItem(
  applicationId: string,
  input: Partial<LetterState>,
  itemId: string,
  override?: ProviderId
): Promise<LetterState> {
  const state = cleanLetter(input, String(input?.language ?? 'en'))
  const item = state.items.find((i) => i.id === itemId)
  if (!item) throw new Error('NOT_FOUND')
  const lang = langInfo(state.language)
  const sources = letterSources(state)
  const problems = state.warnings.filter((w) => w.itemId === itemId).map((w) => `${w.token} (${w.reason.replace('_', ' ')})`)
  const fixed = sanitizeLetter(
    await fixItem(
      {
        text: item.text,
        sources: item.sources.map((k) => sources[k]).filter((s): s is string => !!s),
        problems,
        language: lang.name
      },
      override
    ),
    lang.code
  ).replace(/\n+/g, ' ')
  const nextItem: FactItem = { ...item, text: fixed, translations: [] }
  const next: LetterState = {
    ...state,
    body: state.body.includes(item.text) ? state.body.replace(item.text, fixed) : state.body,
    items: state.items.map((i) => (i.id === itemId ? nextItem : i))
  }
  const db = getDb()
  const app = getApplication(db, applicationId)
  const again = verifyItems([nextItem], sources, { language: lang.code, context: verifyContext(app, getProfile(db), next) })
  next.warnings = [...state.warnings.filter((w) => w.itemId !== itemId), ...again]
  return saveLetter(applicationId, next)
}

/** "Keep it": the user decided a flagged sentence is fine. */
export function dismissLetterWarnings(applicationId: string, input: Partial<LetterState>, itemId: string): LetterState {
  const state = cleanLetter(input, String(input?.language ?? 'en'))
  return saveLetter(applicationId, { ...state, warnings: state.warnings.filter((w) => w.itemId !== itemId) })
}

export function letterPrompt(applicationId: string, input: Partial<LetterState>): string {
  const state = cleanLetter(input, String(input?.language ?? 'en'))
  const lang = langInfo(state.language)
  return externalPrompt(lang.code, lang.name, context(applicationId, state).ctx)
}

// --- PDF -------------------------------------------------------------------------

export function buildLetterDoc(state: LetterState, profile: Profile = getProfile(getDb())) {
  const lang = langInfo(state.language)
  return letterDoc({
    layout: state.layout,
    profile,
    recipient: state.recipient,
    subject: state.subject,
    body: state.body,
    enclosures: state.enclosures,
    signature: state.signature,
    date: state.date,
    lang: lang.code,
    dir: lang.dir,
    labels: state.labels,
    paper: paperSize()
  })
}

export async function printLetter(applicationId: string, input: Partial<LetterState>): Promise<SavedPdf> {
  const state = saveLetter(applicationId, input)
  if (!state.body.trim()) throw new Error('TEXT_EMPTY')
  const profile = getProfile(getDb())
  const pdf = await printDoc(buildLetterDoc(state, profile))
  const lang = langInfo(state.language)
  const known = ['en', 'ar', 'de'].includes(lang.code)
  const name = pdfName(docLabels(lang.code).coverLetter, profile.fullName, known ? '' : lang.name)
  return storePdf(applicationId, 'cover_letter', state.language, name, pdf, state, state.layout)
}
