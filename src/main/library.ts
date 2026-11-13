/** Reusable documents kept in `_Library` (diplomas, certificates, the uploaded CV). */
import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { LibraryItem } from '@shared/applications'
import { dataFolder, getDb } from './services'
import { addLibraryFile, getLibraryRow, listLibrary } from './repo/library'
import { copyIntoLibrary, resolveInside } from './storage/dataFolder'

export function libraryItems(): LibraryItem[] {
  const root = dataFolder()
  return listLibrary(getDb()).map((item) => {
    const row = getLibraryRow(getDb(), item.id)
    const path = resolveInside(root, row.relPath)
    const exists = existsSync(path)
    return { ...item, size: exists ? statSync(path).size : 0, missing: !exists }
  })
}

export function addToLibrary(sourcePath: string, label: string): LibraryItem[] {
  const relPath = copyIntoLibrary(dataFolder(), sourcePath)
  const name = basename(relPath)
  addLibraryFile(getDb(), {
    label: label.trim().slice(0, 120) || name.replace(/\.[^.]+$/, ''),
    kind: 'document',
    filename: name,
    relPath
  })
  return libraryItems()
}

export function renameLibrary(id: string, label: string): LibraryItem[] {
  getLibraryRow(getDb(), id)
  getDb().prepare('UPDATE library_files SET label = ? WHERE id = ?').run(label.trim().slice(0, 120), id)
  return libraryItems()
}

/** Forgets the item and returns its path so the caller can move it to the trash. */
export function removeLibrary(id: string): { items: LibraryItem[]; path: string | null } {
  const row = getLibraryRow(getDb(), id)
  getDb().prepare('DELETE FROM library_files WHERE id = ?').run(id)
  const path = resolveInside(dataFolder(), row.relPath)
  return { items: libraryItems(), path: existsSync(path) ? path : null }
}

export function libraryPath(id: string): string {
  const path = resolveInside(dataFolder(), getLibraryRow(getDb(), id).relPath)
  if (!existsSync(path)) throw new Error('FILE_MISSING')
  return path
}
