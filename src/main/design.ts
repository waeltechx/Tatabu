/** "Teach your design": read the user's CV layout from page images, refine it in rounds, keep it. */
import { readFileSync, statSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { ProviderId } from '@shared/ai'
import { MAX_DESIGN_ROUNDS, sanitizeTemplate, type DesignDraft, type DesignSource, type DesignState } from '@shared/design'
import { safeImage } from '@shared/docs/common'
import { getDb, dataFolder } from './services'
import { nowIso } from './db/open'
import { readPrefs } from './prefs'
import { runVisionJson } from './ai/service'
import { cleanPhotoBox, DesignOutput, designFixUser, designSystem, designUser } from './ai/tasks/design'
import { getLibraryRow, latestCvSource } from './repo/library'
import { resolveInside } from './storage/dataFolder'

const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_PAGE_CHARS = 4_000_000
const MAX_PAGES = 3

type Row = { id: string; name: string; html: string; css: string; meta: string; created_at: string }

function readRow(id: 'draft' | 'mine'): DesignDraft | null {
  const r = getDb().prepare('SELECT id, name, html, css, meta, created_at FROM cv_templates WHERE id = ?').get(id) as
    Row | undefined
  if (!r) return null
  let meta: Partial<DesignDraft> = {}
  try {
    meta = JSON.parse(r.meta) as Partial<DesignDraft>
  } catch {
    meta = {}
  }
  return {
    html: r.html,
    css: r.css,
    sourceName: r.name,
    pages: Array.isArray(meta.pages) ? meta.pages.filter((p) => typeof p === 'string') : [],
    photo: safeImage(String(meta.photo ?? '')),
    photoBox: meta.photoBox ?? null,
    found: Array.isArray(meta.found) ? meta.found : [],
    differences: Array.isArray(meta.differences) ? meta.differences : [],
    round: Number(meta.round) || 1,
    feedback: Array.isArray(meta.feedback) ? meta.feedback : [],
    updatedAt: r.created_at
  }
}

function writeRow(id: 'draft' | 'mine', d: DesignDraft): void {
  const { html, css } = sanitizeTemplate(d)
  const meta = JSON.stringify({
    pages: d.pages,
    photo: d.photo,
    photoBox: d.photoBox,
    found: d.found,
    differences: d.differences,
    round: d.round,
    feedback: d.feedback
  })
  getDb()
    .prepare(
      `INSERT INTO cv_templates (id, name, kind, html, css, meta, created_at) VALUES (?, ?, 'custom', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, html = excluded.html, css = excluded.css,
         meta = excluded.meta, created_at = excluded.created_at`
    )
    .run(id, d.sourceName.slice(0, 200), html, css, meta, nowIso())
}

function deleteRow(id: 'draft' | 'mine'): void {
  getDb().prepare('DELETE FROM cv_templates WHERE id = ?').run(id)
}

export function designState(): DesignState {
  return { draft: readRow('draft'), saved: readRow('mine') }
}

/** The saved design, for CV Studio. */
export function savedDesign(): DesignDraft | null {
  return readRow('mine')
}

export function readDesignPdf(path: string): DesignSource {
  if (!/\.pdf$/i.test(path)) throw new Error('UNSUPPORTED_FILE')
  if (statSync(path).size > MAX_PDF_BYTES) throw new Error('FILE_TOO_LARGE')
  return { filename: basename(path), data: new Uint8Array(readFileSync(path)) }
}

/** The CV the master CV was read from, when it is a PDF. */
export function masterSourcePdf(): DesignSource | null {
  const latest = latestCvSource(getDb())
  if (!latest) return null
  const row = getLibraryRow(getDb(), latest.id)
  if (!/\.pdf$/i.test(row.relPath)) return null
  const path = resolveInside(dataFolder(), row.relPath)
  if (!existsSync(path)) return null
  return readDesignPdf(path)
}

const isPage = (p: unknown): p is string =>
  typeof p === 'string' && p.length < MAX_PAGE_CHARS && /^data:image\/(jpeg|png);base64,[a-z0-9+/=]+$/i.test(p)

const uiLanguage = (): string => (readPrefs().language === 'ar' ? 'Arabic' : 'English')
const notes = (list: string[]): string[] =>
  list
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 5)

/** Round 1: the model looks at the pages and writes the template. */
export async function readDesign(input: { filename: string; pages: string[] }, override?: ProviderId): Promise<DesignState> {
  const pages = (Array.isArray(input?.pages) ? input.pages : []).filter(isPage).slice(0, MAX_PAGES)
  if (!pages.length) throw new Error('PDF_FAILED')
  const result = await runVisionJson(
    {
      system: designSystem(uiLanguage()),
      user: designUser(pages.length),
      images: pages,
      schema: DesignOutput,
      schemaName: 'cv_design',
      temperature: 0.2,
      maxTokens: 8000,
      timeoutMs: 180_000
    },
    override
  )
  const out = result.data
  writeRow('draft', {
    ...sanitizeTemplate(out),
    sourceName: String(input.filename ?? '').slice(0, 200),
    pages,
    photo: '',
    photoBox: cleanPhotoBox(out.photo),
    found: notes(out.found),
    differences: notes(out.differences),
    round: 1,
    feedback: [],
    updatedAt: nowIso()
  })
  return designState()
}

/** The photo cut out of page 1 by the renderer. */
export function setDesignPhoto(dataUrl: string): DesignState {
  const draft = readRow('draft')
  if (!draft) throw new Error('NOT_FOUND')
  const photo = typeof dataUrl === 'string' && dataUrl.length < 2_000_000 ? safeImage(dataUrl) : ''
  writeRow('draft', { ...draft, photo })
  return designState()
}

/** Another round: the user says what is still different. */
export async function fixDesign(feedback: string, override?: ProviderId): Promise<DesignState> {
  const draft = readRow('draft')
  if (!draft) throw new Error('NOT_FOUND')
  if (draft.round >= MAX_DESIGN_ROUNDS) throw new Error('DESIGN_ROUNDS')
  const said = String(feedback ?? '').slice(0, 2000)
  if (!said.trim()) throw new Error('TEXT_EMPTY')
  const result = await runVisionJson(
    {
      system: designSystem(uiLanguage()),
      user: designFixUser({ html: draft.html, css: draft.css, feedback: said, pageCount: draft.pages.length }),
      images: draft.pages,
      schema: DesignOutput,
      schemaName: 'cv_design',
      temperature: 0.2,
      maxTokens: 8000,
      timeoutMs: 180_000
    },
    override
  )
  const out = result.data
  writeRow('draft', {
    ...draft,
    ...sanitizeTemplate(out),
    found: notes(out.found).length ? notes(out.found) : draft.found,
    differences: notes(out.differences),
    // Keep the photo we already cut out unless the model now sees none.
    photoBox: draft.photoBox ?? cleanPhotoBox(out.photo),
    round: draft.round + 1,
    feedback: [...draft.feedback, said]
  })
  return designState()
}

export function saveDesign(): DesignState {
  const draft = readRow('draft')
  if (!draft) throw new Error('NOT_FOUND')
  writeRow('mine', draft)
  deleteRow('draft')
  return designState()
}

/** "Re-check": the saved design goes back on the compare screen with fresh rounds. */
export function recheckDesign(): DesignState {
  const saved = readRow('mine')
  if (!saved) throw new Error('NOT_FOUND')
  writeRow('draft', { ...saved, round: 1, feedback: [] })
  return designState()
}

export function discardDesign(): DesignState {
  deleteRow('draft')
  return designState()
}

export function removeDesign(): DesignState {
  deleteRow('mine')
  return designState()
}
