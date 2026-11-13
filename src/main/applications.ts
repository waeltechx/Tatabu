/**
 * Applications as the IPC layer sees them: database rows plus their folder on
 * disk. Files the user picks are remembered by token so the renderer never
 * hands the main process a raw path.
 */
import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  FILE_TYPES,
  fileKind,
  type AppFile,
  type Application,
  type ApplicationInput,
  type ApplicationPatch,
  type CombineResult,
  type DuplicateMatch,
  type DuplicateQuery,
  type ExtractResult,
  type FileType,
  type PendingAttachment,
  type PickedFile
} from '@shared/applications'
import { PROVIDER_NAMES, type ProviderId } from '@shared/ai'
import { dataFolder, getDb } from './services'
import {
  deleteApplication,
  deleteFileRow,
  duplicateRows,
  getApplication,
  getFileRow,
  insertApplication,
  insertFileRow,
  listFileRows,
  moveFilePaths,
  setFileType,
  updateApplication,
  type FileRow
} from './repo/applications'
import { getLibraryRow } from './repo/library'
import {
  copyIntoFolder,
  createApplicationFolder,
  renameApplicationFolder,
  resolveInside,
  writeIntoFolder
} from './storage/dataFolder'
import { findDuplicates } from './duplicates'
import { combineFiles } from './pdf/combine'
import { runJson, textTarget } from './ai/service'
import { JOB_SYSTEM, JobExtraction, jobUserPrompt, toJobFields } from './ai/tasks/job'

// --- picked files ------------------------------------------------------------

const picked = new Map<string, string>()

/** Remembers files chosen in the system dialog and describes them for the renderer. */
export function rememberPicked(paths: string[]): PickedFile[] {
  return paths.map((path) => {
    const token = randomUUID()
    picked.set(token, path)
    return { token, filename: basename(path), size: safeSize(path), kind: fileKind(path) }
  })
}

function safeSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function fileType(type: unknown): FileType {
  return FILE_TYPES.includes(type as FileType) ? (type as FileType) : 'other'
}

// --- applications ------------------------------------------------------------

export async function extractJob(text: string, link: string, override?: ProviderId): Promise<ExtractResult> {
  if (!text.trim()) throw new Error('TEXT_EMPTY')
  const target = textTarget(override)
  const started = Date.now()
  const result = await runJson(
    { system: JOB_SYSTEM, user: jobUserPrompt(text, link), schema: JobExtraction, schemaName: 'job_extraction' },
    override
  )
  return {
    fields: toJobFields(result.data),
    provider: PROVIDER_NAMES[target.provider],
    model: target.model,
    seconds: Math.round((Date.now() - started) / 100) / 10
  }
}

export function checkDuplicates(query: DuplicateQuery): DuplicateMatch[] {
  const q: DuplicateQuery = {}
  for (const k of ['link', 'text', 'company', 'jobTitle', 'location', 'deadline', 'excludeId'] as const) {
    if (typeof query[k] === 'string') q[k] = (query[k] as string).slice(0, 60_000)
  }
  return findDuplicates(q, duplicateRows(getDb()))
}

export function createApplication(input: ApplicationInput, attachments: PendingAttachment[]): Application {
  const root = dataFolder()
  const folder = createApplicationFolder(root, input.company, input.jobTitle)
  const app = insertApplication(getDb(), input, folder)
  for (const a of attachments ?? []) {
    const path = picked.get(a.token)
    if (!path || !existsSync(path)) continue
    const relPath = copyIntoFolder(root, folder, path)
    insertFileRow(getDb(), { applicationId: app.id, type: fileType(a.type), relPath, filename: basename(relPath) })
    picked.delete(a.token)
  }
  return app
}

/** Saves an edit; when company or title change, the folder (and file paths) follow. */
export function editApplication(id: string, patch: ApplicationPatch): Application {
  const db = getDb()
  const before = getApplication(db, id)
  let folder: string | undefined
  if (patch.company !== undefined || patch.jobTitle !== undefined) {
    const company = patch.company ?? before.company
    const jobTitle = patch.jobTitle ?? before.jobTitle
    folder = renameApplicationFolder(dataFolder(), before.folder, company.trim(), jobTitle.trim())
    moveFilePaths(db, id, before.folder, folder)
  }
  return updateApplication(db, id, patch, folder)
}

export function folderPath(id: string): string {
  const app = getApplication(getDb(), id)
  const root = dataFolder()
  if (!app.folder || !existsSync(join(root, app.folder))) {
    const folder = createApplicationFolder(root, app.company, app.jobTitle)
    updateApplication(getDb(), id, {}, folder)
    return join(root, folder)
  }
  return resolveInside(root, app.folder)
}

/** Removes the record; returns the folder path so the caller can move it to the trash. */
export function removeApplication(id: string): string | null {
  const app = getApplication(getDb(), id)
  deleteApplication(getDb(), id)
  if (!app.folder) return null
  const path = resolveInside(dataFolder(), app.folder)
  return existsSync(path) && path !== dataFolder() ? path : null
}

// --- files -------------------------------------------------------------------

function describe(row: FileRow): AppFile {
  const path = resolveInside(dataFolder(), row.relPath)
  const missing = !existsSync(path)
  return {
    id: row.id,
    applicationId: row.applicationId,
    type: row.type,
    filename: row.filename,
    kind: fileKind(row.filename),
    size: missing ? 0 : safeSize(path),
    missing,
    dateAdded: row.dateAdded
  }
}

export function listFiles(applicationId: string): AppFile[] {
  return listFileRows(getDb(), applicationId).map(describe)
}

function ensureFolder(applicationId: string): string {
  const abs = folderPath(applicationId)
  return getApplication(getDb(), applicationId).folder || basename(abs)
}

export function addPickedFiles(applicationId: string, tokens: string[], type: FileType = 'other'): AppFile[] {
  const folder = ensureFolder(applicationId)
  for (const token of tokens) {
    const path = picked.get(token)
    if (!path || !existsSync(path)) continue
    const relPath = copyIntoFolder(dataFolder(), folder, path)
    insertFileRow(getDb(), { applicationId, type: fileType(type), relPath, filename: basename(relPath) })
    picked.delete(token)
  }
  return listFiles(applicationId)
}

export function attachLibrary(applicationId: string, libraryIds: string[]): AppFile[] {
  const folder = ensureFolder(applicationId)
  for (const libId of libraryIds) {
    const lib = getLibraryRow(getDb(), libId)
    const source = resolveInside(dataFolder(), lib.relPath)
    if (!existsSync(source)) throw new Error('FILE_MISSING')
    const relPath = copyIntoFolder(dataFolder(), folder, source, lib.filename)
    insertFileRow(getDb(), { applicationId, type: 'other', relPath, filename: basename(relPath) })
  }
  return listFiles(applicationId)
}

export function changeFileType(fileId: string, type: FileType): AppFile[] {
  const row = getFileRow(getDb(), fileId)
  setFileType(getDb(), fileId, fileType(type))
  return listFiles(row.applicationId)
}

/** Forgets the file and returns its path, so the caller can move it to the trash. */
export function removeFile(fileId: string): { files: AppFile[]; path: string | null } {
  const row = getFileRow(getDb(), fileId)
  deleteFileRow(getDb(), fileId)
  const path = resolveInside(dataFolder(), row.relPath)
  return { files: listFiles(row.applicationId), path: existsSync(path) ? path : null }
}

export function filePath(fileId: string): string {
  const path = resolveInside(dataFolder(), getFileRow(getDb(), fileId).relPath)
  if (!existsSync(path)) throw new Error('FILE_MISSING')
  return path
}

export async function combine(applicationId: string, fileIds: string[], filename: string): Promise<CombineResult> {
  const rows = fileIds.map((id) => getFileRow(getDb(), id)).filter((r) => r.applicationId === applicationId)
  const items = rows.map((r) => ({ path: resolveInside(dataFolder(), r.relPath), filename: r.filename }))
  const { pdf, skipped } = await combineFiles(items)
  const clean =
    (filename || 'Application')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .trim()
      .replace(/\.pdf$/i, '') || 'Application'
  const relPath = writeIntoFolder(dataFolder(), ensureFolder(applicationId), `${clean.slice(0, 80)}.pdf`, pdf)
  insertFileRow(getDb(), { applicationId, type: 'combined', relPath, filename: basename(relPath) })
  return { files: listFiles(applicationId), skipped }
}
