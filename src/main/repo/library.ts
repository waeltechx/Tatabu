import { newId, nowIso, type Db } from '../db/open'
import type { ImportedFile } from '@shared/settings'

export function addLibraryFile(
  db: Db,
  file: { label: string; kind: 'document' | 'cv_source'; filename: string; relPath: string }
): ImportedFile {
  const id = newId('lib')
  db.prepare(
    'INSERT INTO library_files (id, label, kind, filename, rel_path, date_added) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, file.label, file.kind, file.filename, file.relPath, nowIso())
  return { id, filename: file.filename }
}

/** The most recent CV the user handed in (first run or Profile). */
export function latestCvSource(db: Db): ImportedFile | null {
  const row = db
    .prepare("SELECT id, filename FROM library_files WHERE kind = 'cv_source' ORDER BY date_added DESC, rowid DESC LIMIT 1")
    .get() as ImportedFile | undefined
  return row ?? null
}
