/**
 * Backups: the database and the documents folder in one .zip.
 *
 *   backup.json      what this is (app, format, versions, date)
 *   tatabu.db        a snapshot of the database WITHOUT the API keys: keys are
 *                    encrypted by this computer's keychain and can't be read elsewhere
 *   documents/…      every file in the documents folder
 *
 * Plain fs + SQLite, no Electron, so it can be tested. Zips are streamed so a
 * large documents folder never has to fit in memory.
 */
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeSync
} from 'node:fs'
import { once } from 'node:events'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Unzip, UnzipInflate, Zip, ZipDeflate, strToU8 } from 'fflate'
import type { Db } from '../db/open'

export const BACKUP_FORMAT = 1
export const BACKUP_DB = 'tatabu.db'
export const BACKUP_MANIFEST = 'backup.json'
export const BACKUP_DOCS = 'documents/'

export interface BackupManifest {
  app: 'Tatabu'
  format: number
  appVersion: string
  schemaVersion: number
  createdAt: string
  files: number
}

/** Every file, plus every folder (so empty application folders come back too). */
function listTree(root: string, skip: (abs: string) => boolean): { files: string[]; dirs: string[] } {
  const files: string[] = []
  const dirs: string[] = []
  if (!existsSync(root)) return { files, dirs }
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (skip(abs)) continue
      if (entry.isDirectory()) {
        dirs.push(abs)
        walk(abs)
      } else if (entry.isFile()) files.push(abs)
    }
  }
  walk(root)
  return { files, dirs }
}

/** A consistent copy of the database with the encrypted keys removed. */
function snapshotWithoutKeys(db: Db, target: string): void {
  rmSync(target, { force: true })
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  const copy = new DatabaseSync(target)
  try {
    copy.exec('DELETE FROM secrets')
    copy.exec('VACUUM')
  } finally {
    copy.close()
  }
}

/** Writes the backup to `outFile`. `tempDir` holds the database snapshot while zipping. */
export async function createBackup(opts: {
  db: Db
  dataFolder: string
  outFile: string
  tempDir: string
  appVersion: string
}): Promise<BackupManifest> {
  mkdirSync(opts.tempDir, { recursive: true })
  const snapshot = join(opts.tempDir, `backup-${process.pid}-${Date.now()}.db`)
  snapshotWithoutKeys(opts.db, snapshot)

  const outAbs = resolve(opts.outFile)
  const root = resolve(opts.dataFolder)
  // Never zip the backup into itself, nor a half-finished restore.
  const { files, dirs } = listTree(root, (abs) => resolve(abs) === outAbs || /\.restoring-\d+$/.test(abs))
  const manifest: BackupManifest = {
    app: 'Tatabu',
    format: BACKUP_FORMAT,
    appVersion: opts.appVersion,
    schemaVersion: Number((opts.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version),
    createdAt: new Date().toISOString(),
    files: files.length
  }

  mkdirSync(dirname(outAbs), { recursive: true })
  const out = createWriteStream(outAbs)
  let failed: Error | null = null
  out.on('error', (err) => (failed = err))
  const done = new Promise<void>((resolveDone, reject) => {
    out.on('finish', () => resolveDone())
    out.on('error', reject)
  })
  const zip = new Zip((err, chunk, final) => {
    if (err) failed = err
    else out.write(chunk)
    if (final) out.end()
  })

  const addBytes = (name: string, data: Uint8Array): void => {
    const f = new ZipDeflate(name, { level: 6 })
    zip.add(f)
    f.push(data, true)
  }
  const addFile = async (name: string, abs: string, level: 0 | 1 | 6): Promise<void> => {
    const f = new ZipDeflate(name, { level })
    f.mtime = statSync(abs).mtime
    zip.add(f)
    for await (const chunk of createReadStream(abs, { highWaterMark: 1 << 20 })) {
      f.push(chunk as Uint8Array)
      if (out.writableNeedDrain) await once(out, 'drain')
      if (failed) throw failed
    }
    f.push(new Uint8Array(0), true)
  }

  try {
    addBytes(BACKUP_MANIFEST, strToU8(JSON.stringify(manifest, null, 2)))
    await addFile(BACKUP_DB, snapshot, 6)
    for (const abs of dirs) addBytes(`${BACKUP_DOCS}${relative(root, abs).split(sep).join('/')}/`, new Uint8Array(0))
    for (const abs of files) {
      const rel = relative(root, abs).split(sep).join('/')
      // PDFs and images are already compressed: store them quickly.
      await addFile(BACKUP_DOCS + rel, abs, /\.(pdf|png|jpe?g|webp|gif|zip|docx)$/i.test(abs) ? 1 : 6)
    }
    zip.end()
    await done
    if (failed) throw failed
  } catch (err) {
    out.destroy()
    rmSync(outAbs, { force: true })
    throw err
  } finally {
    rmSync(snapshot, { force: true })
  }
  return manifest
}

/** Where an entry goes inside `dest`, or null for anything that isn't ours or tries to escape. */
export function entryTarget(dest: string, name: string): string | null {
  // A trailing slash marks a folder.
  const clean = name.replace(/\\/g, '/').replace(/\/+$/, '')
  if (clean !== BACKUP_DB && clean !== BACKUP_MANIFEST && !clean.startsWith(BACKUP_DOCS)) return null
  if (clean.split('/').some((p) => p === '..' || p === '.') || /^[a-z]:/i.test(clean) || clean.startsWith('/')) {
    return null
  }
  const target = resolve(dest, ...clean.split('/'))
  const rel = relative(resolve(dest), target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}

export function isManifest(x: unknown): x is BackupManifest {
  const m = x as BackupManifest
  return !!m && m.app === 'Tatabu' && typeof m.format === 'number' && m.format <= BACKUP_FORMAT && typeof m.createdAt === 'string'
}

/**
 * Unpacks a backup into `dest` (which must not exist yet): `dest/tatabu.db`,
 * `dest/documents/…`. Throws BACKUP_INVALID unless it is a complete Tatabu backup.
 */
export async function extractBackup(zipFile: string, dest: string): Promise<BackupManifest> {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  mkdirSync(join(dest, 'documents'), { recursive: true })
  let failed: unknown = null
  let open = 0
  const unzip = new Unzip((file) => {
    const target = entryTarget(dest, file.name)
    if (!target) return // ignored entry
    if (/[\/]$/.test(file.name)) {
      mkdirSync(target, { recursive: true })
      return
    }
    mkdirSync(dirname(target), { recursive: true })
    const fd = openSync(target, 'w')
    open++
    file.ondata = (err, data, final) => {
      if (err) failed = err
      else if (data.length) writeSync(fd, data)
      if (final || err) {
        closeSync(fd)
        open--
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  try {
    for await (const chunk of createReadStream(zipFile, { highWaterMark: 1 << 20 })) {
      unzip.push(chunk as Uint8Array)
      if (failed) break
    }
    if (!failed) unzip.push(new Uint8Array(0), true)
  } catch (err) {
    failed = err
  }

  let manifest: unknown = null
  try {
    manifest = JSON.parse(readFileSync(join(dest, BACKUP_MANIFEST), 'utf8'))
  } catch {
    manifest = null
  }
  if (
    failed ||
    open !== 0 ||
    !isManifest(manifest) ||
    !existsSync(join(dest, BACKUP_DB)) ||
    statSync(join(dest, BACKUP_DB)).size === 0
  ) {
    rmSync(dest, { recursive: true, force: true })
    throw new Error('BACKUP_INVALID')
  }
  return manifest
}
