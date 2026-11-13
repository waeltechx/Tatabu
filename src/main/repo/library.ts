import { newId, nowIso, type Db } from '../db/open'
import type { ImportedFile } from '@shared/settings'
import { fileKind, type LibraryItem } from '@shared/applications'

export function addLibraryFile(
  db: Db,
  file: { label: string; kind: 'document' | 'cv_source'; filename: string; relPath: string }
): ImportedFile {
  const id = newId('lib')
  db.prepare('INSERT INTO library_files (id, label, kind, filename, rel_path, date_added) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    file.label,
    file.kind,
    file.filename,
    file.relPath,
    nowIso()
  )
  return { id, filename: file.filename }
}

/** The most recent CV the user handed in (first run or Profile). */
export function latestCvSource(db: Db): ImportedFile | null {
  const row = db
    .prepare("SELECT id, filename FROM library_files WHERE kind = 'cv_source' ORDER BY date_added DESC, rowid DESC LIMIT 1")
    .get() as ImportedFile | undefined
  return row ?? null
}

export function listLibrary(db: Db): LibraryItem[] {
  const rows = db
    .prepare('SELECT id, label, filename FROM library_files ORDER BY date_added DESC, rowid DESC')
    .all() as unknown as Array<{ id: string; label: string; filename: string }>
  return rows.map((r) => ({ ...r, kind: fileKind(r.filename) }))
}

export function getLibraryRow(db: Db, id: string): { id: string; filename: string; relPath: string } {
  const row = db.prepare('SELECT id, filename, rel_path AS relPath FROM library_files WHERE id = ?').get(id) as
    { id: string; filename: string; relPath: string } | undefined
  if (!row) throw new Error('NOT_FOUND')
  return row
}
