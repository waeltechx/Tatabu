/** Saved state of generated documents, one per application, kind and language. */
import { newId, nowIso, type Db } from '../db/open'
import type { DocKind } from '@shared/documents'

export interface DocRow<T> {
  id: string
  applicationId: string
  kind: DocKind
  language: string
  layout: string
  data: T
  fileId: string | null
  updatedAt: string
}

interface Raw {
  id: string
  application_id: string
  kind: DocKind
  language: string
  layout: string
  data: string
  file_id: string | null
  updated_at: string
}

function parse<T>(r: Raw): DocRow<T> {
  let data: T
  try {
    data = JSON.parse(r.data) as T
  } catch {
    data = {} as T
  }
  return {
    id: r.id,
    applicationId: r.application_id,
    kind: r.kind,
    language: r.language,
    layout: r.layout,
    data,
    fileId: r.file_id,
    updatedAt: r.updated_at
  }
}

/** The most recent document of this kind for an application (any language unless given). */
export function getDocument<T>(db: Db, applicationId: string, kind: DocKind, language?: string): DocRow<T> | null {
  const r = (language
    ? db
        .prepare(
          'SELECT * FROM documents WHERE application_id = ? AND kind = ? AND language = ? ORDER BY updated_at DESC LIMIT 1'
        )
        .get(applicationId, kind, language)
    : db
        .prepare('SELECT * FROM documents WHERE application_id = ? AND kind = ? ORDER BY updated_at DESC LIMIT 1')
        .get(applicationId, kind)) as unknown as Raw | undefined
  return r ? parse<T>(r) : null
}

export function saveDocument<T>(
  db: Db,
  doc: { applicationId: string; kind: DocKind; language: string; layout?: string; data: T; fileId?: string | null }
): DocRow<T> {
  const existing = getDocument<T>(db, doc.applicationId, doc.kind, doc.language)
  const now = nowIso()
  if (existing) {
    db.prepare('UPDATE documents SET layout = ?, data = ?, file_id = ?, updated_at = ? WHERE id = ?').run(
      doc.layout ?? existing.layout,
      JSON.stringify(doc.data),
      doc.fileId === undefined ? existing.fileId : doc.fileId,
      now,
      existing.id
    )
    return getDocument<T>(db, doc.applicationId, doc.kind, doc.language) as DocRow<T>
  }
  const id = newId('doc')
  db.prepare(
    'INSERT INTO documents (id, application_id, kind, language, layout, data, file_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, doc.applicationId, doc.kind, doc.language, doc.layout ?? '', JSON.stringify(doc.data), doc.fileId ?? null, now, now)
  return getDocument<T>(db, doc.applicationId, doc.kind, doc.language) as DocRow<T>
}

export function deleteDocuments(db: Db, applicationId: string, kind: DocKind): void {
  db.prepare('DELETE FROM documents WHERE application_id = ? AND kind = ?').run(applicationId, kind)
}

/** Layout remembered per document language for cover letters. */
export function getLetterLayout(db: Db, languageId: string): string | null {
  const r = db.prepare('SELECT layout FROM letter_prefs WHERE language_id = ?').get(languageId) as { layout: string } | undefined
  return r?.layout ?? null
}

export function setLetterLayout(db: Db, languageId: string, layout: string): void {
  db.prepare(
    'INSERT INTO letter_prefs (language_id, layout) VALUES (?, ?) ON CONFLICT (language_id) DO UPDATE SET layout = excluded.layout'
  ).run(languageId, layout)
}
