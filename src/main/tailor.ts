/** CV Studio: a tailored CV per application and document language, its checks and its PDF. */
import type { ProviderId } from '@shared/ai'
import type { Application } from '@shared/applications'
import { cvFacts, cvFactsPrompt, type MasterCv } from '@shared/cv'
import { atsCvDoc } from '@shared/docs/cv'
import { designDoc } from '@shared/design'
import { docLabels, languageCode, type DocHtml } from '@shared/docs/common'
import type { SavedPdf } from '@shared/documents'
import type { Profile } from '@shared/profile'
import {
  applyChoices,
  checkableItems,
  cvLabels,
  diffCv,
  EMPTY_TAILOR,
  resolveCv,
  type CvTailorState,
  type TailoredCv
} from '@shared/tailor'
import { verifyItems } from '@shared/verify'
import { getDb } from './services'
import { getApplication } from './repo/applications'
import { getDocument, saveDocument } from './repo/documents'
import { getProfile } from './repo/profile'
import { findLanguage, paperSize, pdfName, printDoc, storePdf } from './documents'
import { fixItem, getMasterCv } from './cv'
import { savedDesign } from './design'
import { runJson } from './ai/service'
import { buildTailored, TailorOutput, tailorSystem, tailorUser } from './ai/tasks/tailor'

function langInfo(languageId: string): { id: string; code: string; name: string; dir: 'ltr' | 'rtl' } {
  const lang = findLanguage(languageId)
  return { id: lang.id, code: languageCode(lang), name: lang.name, dir: lang.dir }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

function requireMaster(): MasterCv {
  const master = getMasterCv()
  if (!master) throw new Error('MASTER_CV_MISSING')
  return master
}

/** Makes any input a valid state (the tailored CV itself is only ever written by this module). */
export function cleanTailor(input: Partial<CvTailorState>, languageId: string): CvTailorState {
  const x = (input ?? {}) as Record<string, unknown>
  const lang = langInfo(languageId)
  const edits: Record<string, string> = {}
  if (x.edits && typeof x.edits === 'object') {
    for (const [k, v] of Object.entries(x.edits as Record<string, unknown>).slice(0, 400)) {
      if (typeof v === 'string') edits[k.slice(0, 60)] = v.slice(0, 3000)
    }
  }
  const strs = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v : []).slice(0, n).map((s) => str(s, max))
  return {
    ...EMPTY_TAILOR,
    language: lang.id,
    look: x.look === 'mine' ? 'mine' : 'ats',
    highlight: str(x.highlight, 2000),
    tailored: (x.tailored && typeof x.tailored === 'object' ? x.tailored : null) as TailoredCv | null,
    changes: Array.isArray(x.changes) ? (x.changes as CvTailorState['changes']).slice(0, 300) : [],
    rejected: strs(x.rejected, 300, 80),
    edits,
    missing: strs(x.missing, 12, 200),
    warnings: Array.isArray(x.warnings) ? (x.warnings as CvTailorState['warnings']).slice(0, 300) : [],
    dismissed: strs(x.dismissed, 300, 300),
    labels: (x.labels && typeof x.labels === 'object' ? x.labels : {}) as CvTailorState['labels'],
    sourceLanguage: str(x.sourceLanguage, 10),
    generatedAt: str(x.generatedAt, 40)
  }
}

function verifyContext(app: Application, profile: Profile): string[] {
  return [app.company, app.jobTitle, app.location, profile.fullName]
}

/** Warnings for the AI text the user hasn't replaced, minus the ones they chose to keep. */
function check(app: Application, state: CvTailorState, master: MasterCv): CvTailorState['warnings'] {
  if (!state.tailored) return []
  const cv = applyChoices(master, state.tailored, state.changes, state.rejected, state.edits)
  const lang = langInfo(state.language)
  const dismissed = new Set(state.dismissed)
  return verifyItems(checkableItems(cv, state.edits), cvFacts(master), {
    language: lang.code,
    context: verifyContext(app, getProfile(getDb()))
  }).filter((w) => !dismissed.has(w.id))
}

export function cvState(applicationId: string, languageId: string): CvTailorState {
  const db = getDb()
  getApplication(db, applicationId)
  const lang = langInfo(languageId)
  const saved = getDocument<Partial<CvTailorState>>(db, applicationId, 'cv', lang.id)
  return cleanTailor(saved?.data ?? {}, lang.id)
}

/** Saves the user's choices and edits; the tailored CV and its change list stay as they were generated. */
export function saveCvState(applicationId: string, input: Partial<CvTailorState>): CvTailorState {
  const db = getDb()
  const app = getApplication(db, applicationId)
  const incoming = cleanTailor(input, String(input?.language ?? 'en'))
  const stored = cvState(applicationId, incoming.language)
  const next: CvTailorState = {
    ...stored,
    look: incoming.look,
    highlight: incoming.highlight,
    rejected: incoming.rejected,
    edits: incoming.edits,
    dismissed: incoming.dismissed
  }
  const master = getMasterCv()
  if (master && next.tailored) next.warnings = check(app, next, master)
  saveDocument(db, { applicationId, kind: 'cv', language: next.language, layout: next.look, data: next })
  return next
}

export async function tailorCv(
  applicationId: string,
  input: Partial<CvTailorState>,
  override?: ProviderId
): Promise<CvTailorState> {
  const db = getDb()
  const app = getApplication(db, applicationId)
  const master = requireMaster()
  const state = cleanTailor(input, String(input?.language ?? 'en'))
  const lang = langInfo(state.language)
  const cvLang = master.language || 'en'
  const result = await runJson(
    {
      system: tailorSystem(lang.code, lang.name),
      user: tailorUser({
        job: app,
        facts: cvFactsPrompt(master),
        cvLanguage: cvLang,
        code: lang.code,
        name: lang.name,
        highlight: state.highlight
      }),
      schema: TailorOutput,
      schemaName: 'tailored_cv',
      temperature: 0.35,
      maxTokens: 7000,
      timeoutMs: 180_000
    },
    override
  )
  const built = buildTailored(result.data, master)
  const next: CvTailorState = {
    ...state,
    tailored: built.cv,
    changes: diffCv(master, built.cv, cvLang === lang.code),
    rejected: [],
    edits: {},
    dismissed: [],
    missing: built.missing,
    labels: built.labels,
    sourceLanguage: cvLang,
    generatedAt: new Date().toISOString()
  }
  next.warnings = check(app, next, master)
  saveDocument(db, { applicationId, kind: 'cv', language: next.language, layout: next.look, data: next })
  return next
}

/** "Fix it": rewrites one item from the facts it cites and checks it again. */
export async function fixCvItem(
  applicationId: string,
  input: Partial<CvTailorState>,
  itemId: string,
  override?: ProviderId
): Promise<CvTailorState> {
  const state = saveCvState(applicationId, input)
  const master = requireMaster()
  if (!state.tailored) throw new Error('NOT_FOUND')
  const tailored: TailoredCv = structuredClone(state.tailored)
  const all = [
    tailored.headline,
    tailored.summary,
    ...tailored.experience.flatMap((r) => [r.title, ...r.bullets]),
    ...tailored.education.flatMap((e) => [e.degree, ...e.details]),
    ...tailored.skills,
    ...tailored.languages,
    ...[...tailored.certificates, ...tailored.projects].flatMap((c) => [c.name, c.detail]),
    ...tailored.other.flatMap((s) => [s.title, ...s.lines])
  ]
  const target = all.find((i) => i.id === itemId)
  if (!target) throw new Error('NOT_FOUND')
  const facts = cvFacts(master)
  const lang = langInfo(state.language)
  const problems = state.warnings.filter((w) => w.itemId === itemId).map((w) => `${w.token} (${w.reason.replace('_', ' ')})`)
  const fixed = await fixItem(
    {
      text: target.text,
      sources: (target.sources.length ? target.sources : Object.keys(facts)).map((k) => facts[k]).filter((s): s is string => !!s),
      problems,
      language: lang.name
    },
    override
  )
  target.text = fixed.replace(/\s+/g, ' ').trim()
  target.translations = []
  const db = getDb()
  const app = getApplication(db, applicationId)
  // The change card shows the new wording too.
  const changes = state.changes.map((c) =>
    c.id === `word:${itemId}` ||
    (c.kind === 'rewritten' && (c.id === 'summary' ? itemId === 's' : c.id === 'headline' && itemId === 'h'))
      ? { ...c, new: target.text }
      : c
  )
  const next: CvTailorState = { ...state, tailored, changes }
  next.warnings = check(app, next, master)
  saveDocument(db, { applicationId, kind: 'cv', language: next.language, layout: next.look, data: next })
  return next
}

/** "Keep it": the user decided a flagged item is fine. */
export function keepCvItem(applicationId: string, input: Partial<CvTailorState>, itemId: string): CvTailorState {
  const state = cleanTailor(input, String(input?.language ?? 'en'))
  const ids = state.warnings.filter((w) => w.itemId === itemId).map((w) => w.id)
  return saveCvState(applicationId, { ...state, dismissed: [...new Set([...state.dismissed, ...ids])] })
}

// --- PDF -----------------------------------------------------------------------------

export function buildCvDoc(state: CvTailorState, master: MasterCv, profile: Profile, marks?: Set<string>): DocHtml {
  const lang = langInfo(state.language)
  const labels = cvLabels(lang.code, state.labels)
  const cv = state.tailored ? applyChoices(master, state.tailored, state.changes, state.rejected, state.edits) : null
  const resolved = cv ? resolveCv(master, cv, labels, lang.code).cv : { ...master, language: lang.code }
  // "My design" when one is saved; the ATS template otherwise.
  const design = state.look === 'mine' ? savedDesign() : null
  if (design) {
    return designDoc({
      template: design,
      cv: resolved,
      labels,
      photo: design.photo,
      lang: lang.code,
      dir: lang.dir,
      paper: paperSize()
    })
  }
  return atsCvDoc({ cv: resolved, profile, labels, lang: lang.code, dir: lang.dir, paper: paperSize(), marks })
}

export async function printCv(applicationId: string, input: Partial<CvTailorState>): Promise<SavedPdf> {
  const state = saveCvState(applicationId, input)
  const master = requireMaster()
  if (!state.tailored) throw new Error('TEXT_EMPTY')
  const profile = getProfile(getDb())
  const pdf = await printDoc(buildCvDoc(state, master, profile))
  const lang = langInfo(state.language)
  const known = ['en', 'ar', 'de'].includes(lang.code)
  const name = pdfName(docLabels(lang.code).cv, master.name || profile.fullName, known ? '' : lang.name)
  return storePdf(applicationId, 'cv', state.language, name, pdf, state, state.look)
}
