/** Generated documents: saving their state and printing them into the application folder. */
import { existsSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { DocHtml } from '@shared/docs/common'
import { docLabels, languageCode } from '@shared/docs/common'
import { referenceDocFor } from '@shared/docs/reference'
import type { DocKind, ReferenceState, SavedPdf } from '@shared/documents'
import type { PaperSize, Profile } from '@shared/profile'
import type { DocLanguage, Referee } from '@shared/settings'
import { dataFolder, getDb } from './services'
import { getApplication, getFileRow, insertFileRow } from './repo/applications'
import { deleteDocuments, getDocument, saveDocument } from './repo/documents'
import { getProfile } from './repo/profile'
import { listReferees } from './repo/referees'
import { listLanguages } from './repo/languages'
import { getSetting } from './repo/settings'
import { resolveInside, writeIntoFolder } from './storage/dataFolder'
import { folderPath, listFiles } from './applications'
import { renderPdf } from './pdf/render'

export function paperSize(): PaperSize {
  return getSetting<string>(getDb(), 'paper', 'A4') === 'Letter' ? 'Letter' : 'A4'
}

export function findLanguage(id: string): DocLanguage {
  const all = listLanguages(getDb())
  return all.find((l) => l.id === id) ?? all[0] ?? { id: 'en', name: 'English', dir: 'ltr', builtin: true }
}

/** "Nordlicht – CV.pdf": safe on Windows and macOS. */
export function pdfName(...parts: string[]): string {
  const name = parts
    .map((p) =>
      p
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join(' – ')
    .slice(0, 100)
  return `${name || 'Document'}.pdf`
}

/**
 * Writes a PDF into the application folder. Printing the same document again replaces
 * its previous file (unless that file is open elsewhere; then a new copy is written).
 */
export function storePdf(
  applicationId: string,
  kind: DocKind,
  language: string,
  filename: string,
  pdf: Uint8Array,
  data: unknown,
  layout = ''
): SavedPdf {
  const db = getDb()
  folderPath(applicationId) // makes sure the folder exists
  const app = getApplication(db, applicationId)
  const previous = getDocument(db, applicationId, kind, language)
  let fileId: string | null = null

  if (previous?.fileId) {
    try {
      const row = getFileRow(db, previous.fileId)
      const path = resolveInside(dataFolder(), row.relPath)
      if (row.filename === filename && existsSync(path)) {
        writeFileSync(path, pdf)
        fileId = row.id
      }
    } catch {
      fileId = null // missing row or the file is locked: write a fresh copy below
    }
  }
  if (!fileId) {
    const relPath = writeIntoFolder(dataFolder(), app.folder, filename, pdf)
    fileId = insertFileRow(db, { applicationId, type: kind, relPath, filename: basename(relPath) }).id
  }
  saveDocument(db, { applicationId, kind, language, layout, data, fileId })
  const files = listFiles(applicationId)
  return { files, fileId, filename: files.find((f) => f.id === fileId)?.filename ?? filename }
}

export async function printDoc(doc: DocHtml): Promise<Uint8Array> {
  return new Uint8Array(await renderPdf(doc, paperSize()))
}

// --- references --------------------------------------------------------------

function cleanReferee(r: Partial<Referee>, i: number): Referee {
  const s = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    id: s(r.id, 80) || `custom-${i}`,
    name: s(r.name).trim(),
    affiliation: s(r.affiliation).trim(),
    relationship: s(r.relationship).trim(),
    includeRelationship: r.includeRelationship === true,
    email: s(r.email).trim(),
    phone: s(r.phone).trim(),
    address: s(r.address, 600).trim()
  }
}

/** The saved References page for an application, or one built from the defaults. */
export function referenceState(applicationId: string): ReferenceState {
  const db = getDb()
  getApplication(db, applicationId)
  const saved = getDocument<Partial<ReferenceState>>(db, applicationId, 'reference')
  const defaults = listReferees(db)
  if (!saved) return { title: '', language: 'en', custom: false, referees: defaults }
  const custom = saved.data.custom === true
  return {
    title: typeof saved.data.title === 'string' ? saved.data.title : '',
    language: saved.language || 'en',
    custom,
    referees: custom && Array.isArray(saved.data.referees) ? saved.data.referees.map(cleanReferee) : defaults
  }
}

function cleanState(state: Partial<ReferenceState>): ReferenceState {
  const custom = state.custom === true
  return {
    title: typeof state.title === 'string' ? state.title.slice(0, 200) : '',
    language: findLanguage(String(state.language ?? 'en')).id,
    custom,
    referees: custom && Array.isArray(state.referees) ? state.referees.slice(0, 12).map(cleanReferee) : listReferees(getDb())
  }
}

export function saveReferenceState(applicationId: string, state: Partial<ReferenceState>): ReferenceState {
  const db = getDb()
  getApplication(db, applicationId)
  const clean = cleanState(state)
  // One saved state per application: switching language replaces it.
  const prev = getDocument(db, applicationId, 'reference')
  if (prev && prev.language !== clean.language) deleteDocuments(db, applicationId, 'reference')
  saveDocument(db, {
    applicationId,
    kind: 'reference',
    language: clean.language,
    data: { title: clean.title, custom: clean.custom, referees: clean.custom ? clean.referees : [] },
    fileId: prev && prev.language === clean.language ? prev.fileId : null
  })
  return referenceState(applicationId)
}

export function buildReferenceDoc(applicationId: string, state: ReferenceState, profile: Profile = getProfile(getDb())): DocHtml {
  const app = getApplication(getDb(), applicationId)
  return referenceDocFor({
    job: app,
    title: state.title,
    referees: state.referees,
    profile,
    language: findLanguage(state.language),
    paper: paperSize()
  })
}

export async function printReference(applicationId: string, state: Partial<ReferenceState>): Promise<SavedPdf> {
  const saved = saveReferenceState(applicationId, state)
  const profile = getProfile(getDb())
  const doc = buildReferenceDoc(applicationId, saved, profile)
  const pdf = await printDoc(doc)
  const code = languageCode(findLanguage(saved.language))
  const name = pdfName(docLabels(code).references, profile.fullName)
  return storePdf(applicationId, 'reference', saved.language, name, pdf, {
    title: saved.title,
    custom: saved.custom,
    referees: saved.custom ? saved.referees : []
  })
}
