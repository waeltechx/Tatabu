/**
 * The documents folder: one sub-folder per application ("Company – Job title")
 * plus `_Library/` for reusable files. Plain fs, no Electron, so it can be tested.
 * Paths stored in the database are relative to this folder.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { applicationFolderName, withCollisionSuffix } from '@shared/folderName'

export const LIBRARY_DIR = '_Library'

export function ensureDataFolder(root: string): void {
  mkdirSync(join(root, LIBRARY_DIR), { recursive: true })
}

function existsIgnoringCase(dir: string): (name: string) => boolean {
  const taken = new Set(existsSync(dir) ? readdirSync(dir).map((n) => n.toLocaleLowerCase()) : [])
  return (name) => taken.has(name.toLocaleLowerCase())
}

/** Creates "<root>/Company – Job title[ (n)]" and returns the folder name (relative path). */
export function createApplicationFolder(root: string, company: string, jobTitle: string): string {
  ensureDataFolder(root)
  const name = withCollisionSuffix(applicationFolderName(company, jobTitle), existsIgnoringCase(root))
  mkdirSync(join(root, name))
  return name
}

/**
 * Renames an application's folder after its company or title changed.
 * Returns the new relative name (unchanged if the name still fits).
 * Creates the folder if it went missing.
 */
export function renameApplicationFolder(root: string, current: string, company: string, jobTitle: string): string {
  const wanted = applicationFolderName(company, jobTitle)
  const currentPath = join(root, current)
  if (!current || !existsSync(currentPath)) return createApplicationFolder(root, company, jobTitle)

  // Keep the current name if it is already the wanted one (optionally with a suffix).
  const suffixed = new RegExp(`^${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(\\d+\\))?$`, 'i')
  if (suffixed.test(current)) return current

  const isTaken = existsIgnoringCase(root)
  const name = withCollisionSuffix(wanted, (n) => isTaken(n) && n.toLocaleLowerCase() !== current.toLocaleLowerCase())
  renameSync(currentPath, join(root, name))
  return name
}

/** Copies a file into `_Library/`, keeping its name unless taken. Returns the relative path. */
export function copyIntoLibrary(root: string, sourcePath: string): string {
  ensureDataFolder(root)
  const dir = join(root, LIBRARY_DIR)
  const ext = extname(sourcePath)
  const stem = basename(sourcePath, ext)
  const isTaken = existsIgnoringCase(dir)
  const name = withCollisionSuffix(stem, (n) => isTaken(`${n}${ext}`))
  copyFileSync(sourcePath, join(dir, `${name}${ext}`))
  return `${LIBRARY_DIR}/${name}${ext}`
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isEmptyDir(path: string): boolean {
  return statSync(path).isDirectory() && readdirSync(path).length === 0
}

/**
 * Where files would go if the user picks `chosen`: the folder itself when it is
 * empty or new, otherwise a "Tatabu" folder inside it.
 */
export function resolveTargetFolder(chosen: string): string {
  if (!existsSync(chosen) || isEmptyDir(chosen)) return resolve(chosen)
  return resolve(chosen, 'Tatabu')
}

/**
 * Moves everything from `from` to `to`. `to` must be new or empty and must not
 * be inside `from` (or the other way round).
 */
export function moveDataFolder(from: string, to: string): void {
  const src = resolve(from)
  const dst = resolve(to)
  if (src.toLocaleLowerCase() === dst.toLocaleLowerCase()) return
  if (isInside(dst, src) || isInside(src, dst)) throw new Error('FOLDER_INSIDE_CURRENT')
  if (existsSync(dst) && !isEmptyDir(dst)) throw new Error('FOLDER_NOT_EMPTY')

  if (!existsSync(src)) {
    ensureDataFolder(dst)
    return
  }
  if (existsSync(dst)) rmSync(dst, { recursive: true }) // empty folder; rename needs it gone
  try {
    renameSync(src, dst) // same drive: instant
  } catch {
    // Different drive: copy, then delete the original only after the copy succeeded.
    cpSync(src, dst, { recursive: true, errorOnExist: true, force: false })
    rmSync(src, { recursive: true, force: true })
  }
  ensureDataFolder(dst)
}
