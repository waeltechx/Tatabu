/** The master CV: upload, read with AI, check against the file, edit, and "Fix it". */
import type { ProviderId } from '@shared/ai'
import { cleanCv, cvFacts, type FixRequest, type MasterCv, type MasterState } from '@shared/cv'
import { verifyItems, type FactItem, type FactWarning } from '@shared/verify'
import { getDb, dataFolder } from './services'
import { runJson } from './ai/service'
import { CV_SYSTEM, CvExtraction, cvUserPrompt, FIX_SYSTEM, FixResult, fixUserPrompt } from './ai/tasks/cv'
import { addLibraryFile, getLibraryRow, latestCvSource } from './repo/library'
import { copyIntoLibrary, resolveInside } from './storage/dataFolder'
import { fileText } from './pdf/read'
import { basename } from 'node:path'
import { existsSync } from 'node:fs'
import { nowIso } from './db/open'

interface Stored {
  cv?: MasterCv | null
  /** The CV file's text, kept so AI output can be checked against it later. */
  sourceText?: string
  warnings?: FactWarning[]
}

function load(): { data: Stored; sourceFileId: string | null; updatedAt: string } {
  const r = getDb().prepare('SELECT data, source_file_id, updated_at FROM cv_master WHERE id = 1').get() as
    { data: string; source_file_id: string | null; updated_at: string } | undefined
  let data: Stored = {}
  try {
    data = JSON.parse(r?.data || '{}') as Stored
  } catch {
    data = {}
  }
  return { data, sourceFileId: r?.source_file_id ?? null, updatedAt: r?.updated_at ?? '' }
}

function store(data: Stored, sourceFileId: string | null): void {
  getDb()
    .prepare('UPDATE cv_master SET data = ?, source_file_id = ?, updated_at = ? WHERE id = 1')
    .run(JSON.stringify(data), sourceFileId, nowIso())
}

/** The master CV, if the user has one. */
export function getMasterCv(): MasterCv | null {
  const cv = load().data.cv
  return cv ? cleanCv(cv) : null
}

export function masterState(): MasterState {
  const { data, sourceFileId, updatedAt } = load()
  const latest = latestCvSource(getDb())
  const cv = data.cv ? cleanCv(data.cv) : null
  return {
    cv,
    source: latest ?? null,
    unread: !!latest && (!cv || latest.id !== sourceFileId),
    updatedAt,
    warnings: cv ? (data.warnings ?? []) : []
  }
}

/** Copies a picked CV file into the library; it waits there until the user reads it. */
export function uploadCv(sourcePath: string): MasterState {
  const relPath = copyIntoLibrary(dataFolder(), sourcePath)
  addLibraryFile(getDb(), { label: 'CV', kind: 'cv_source', filename: basename(relPath), relPath })
  return masterState()
}

/** Short fields that must appear in the CV as they are; longer ones are checked fact by fact. */
const EXACT_KEY = /^(name|headline)$|\.(title|organization|institution|degree|name)$|^skills\./

/** Checks what the AI read against the file's own text. */
export function checkAgainstFile(cv: MasterCv, sourceText: string): FactWarning[] {
  const items: FactItem[] = Object.entries(cvFacts(cv))
    .filter(([k]) => !k.startsWith('contact.'))
    .map(([k, text]) => ({ id: k, text, sources: ['cv'], exact: EXACT_KEY.test(k) }))
  return verifyItems(items, { cv: sourceText }, { language: cv.language })
}

/** Reads the newest uploaded CV with AI and makes it the master CV. */
export async function readCv(override?: ProviderId): Promise<MasterState> {
  const latest = latestCvSource(getDb())
  if (!latest) throw new Error('NOT_FOUND')
  const path = resolveInside(dataFolder(), getLibraryRow(getDb(), latest.id).relPath)
  if (!existsSync(path)) throw new Error('FILE_MISSING')
  const text = (await fileText(path)).trim()
  if (text.replace(/\s+/g, '').length < 80) throw new Error('CV_NO_TEXT')

  const result = await runJson(
    {
      system: CV_SYSTEM,
      user: cvUserPrompt(text),
      schema: CvExtraction,
      schemaName: 'cv_extraction',
      maxTokens: 8000,
      timeoutMs: 180_000
    },
    override
  )
  const cv = cleanCv(result.data)
  store({ cv, sourceText: text, warnings: checkAgainstFile(cv, text) }, latest.id)
  return masterState()
}

/**
 * Saves the user's edits. What the user types is never flagged: a warning stays
 * only while its item still holds exactly the text the AI wrote.
 */
export function saveMasterCv(input: unknown): MasterState {
  const { data, sourceFileId } = load()
  const cv = cleanCv(input)
  const facts = cvFacts(cv)
  const warnings = (data.warnings ?? []).filter((w) => facts[w.itemId] === w.text)
  store({ ...data, cv, warnings }, sourceFileId ?? latestCvSource(getDb())?.id ?? null)
  return masterState()
}

/** "Keep it": the user decided the text is right. */
export function dismissCvWarning(id: string): MasterState {
  const { data, sourceFileId } = load()
  store({ ...data, warnings: (data.warnings ?? []).filter((w) => w.id !== id) }, sourceFileId)
  return masterState()
}

/** The CV file's text, for "Fix it" on the master CV. */
export function masterSourceText(): string {
  return load().data.sourceText ?? ''
}

/** "Fix it": AI rewrites one item from its sources only. */
export async function fixItem(req: FixRequest, override?: ProviderId): Promise<string> {
  const clean: FixRequest = {
    text: String(req?.text ?? '').slice(0, 4000),
    sources: (Array.isArray(req?.sources) ? req.sources : []).map((s) => String(s).slice(0, 20_000)).slice(0, 20),
    problems: (Array.isArray(req?.problems) ? req.problems : []).map((p) => String(p).slice(0, 200)).slice(0, 20),
    language: String(req?.language ?? 'en').slice(0, 10)
  }
  if (!clean.text.trim()) throw new Error('TEXT_EMPTY')
  const result = await runJson(
    { system: FIX_SYSTEM, user: fixUserPrompt(clean), schema: FixResult, schemaName: 'fix_item', temperature: 0.2 },
    override
  )
  return result.data.text.trim()
}
