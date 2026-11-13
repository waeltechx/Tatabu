/** Backup export and restore from Settings (native dialogs + swapping the data in place). */
import { app, BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './db/open'
import { closeServices, dataFolder, getDb, initServices } from './services'
import { mainText } from './i18n'
import { createBackup, extractBackup, BACKUP_DB } from './storage/backup'
import { ensureDataFolder } from './storage/dataFolder'

const stamp = (): string => new Date().toISOString().slice(0, 10)

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export async function exportBackup(): Promise<{ path: string; files: number } | null> {
  const t = mainText()
  const win = parentWindow()
  const options = {
    title: t.saveBackupTitle,
    defaultPath: join(app.getPath('documents'), `Tatabu-backup-${stamp()}.zip`),
    filters: [{ name: t.backupFilter, extensions: ['zip'] }]
  }
  const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (picked.canceled || !picked.filePath) return null
  const path = /\.zip$/i.test(picked.filePath) ? picked.filePath : `${picked.filePath}.zip`
  const manifest = await createBackup({
    db: getDb(),
    dataFolder: dataFolder(),
    outFile: path,
    tempDir: join(app.getPath('temp'), 'tatabu'),
    appVersion: app.getVersion()
  })
  return { path, files: manifest.files }
}

function hasFiles(dir: string): boolean {
  if (!existsSync(dir)) return false
  return readdirSync(dir, { recursive: true, withFileTypes: true }).some((e) => e.isFile())
}

/** "<folder> (before restore 2026-11-13)", or "… (2)" when that is taken. */
function asideName(root: string, label: string): string {
  const base = `${root} (${label} ${stamp()})`
  let name = base
  for (let i = 2; existsSync(name); i++) name = `${base} (${i})`
  return name
}

/** The rows that belong to this computer and must survive a restore. */
function localRows(): { secrets: Array<{ name: string; value: Uint8Array }>; dataFolder: string | null } {
  const db = getDb()
  const secrets = db.prepare('SELECT name, value FROM secrets').all() as Array<{ name: string; value: Uint8Array }>
  const row = db.prepare("SELECT value FROM settings WHERE key = 'dataFolder'").get() as { value: string } | undefined
  return { secrets, dataFolder: row?.value ?? null }
}

export async function restoreBackup(): Promise<boolean> {
  const t = mainText()
  const win = parentWindow()
  const options = {
    title: t.chooseBackupTitle,
    properties: ['openFile'] as Array<'openFile'>,
    filters: [{ name: t.backupFilter, extensions: ['zip'] }]
  }
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const zipFile = picked.filePaths[0]
  if (picked.canceled || !zipFile) return false

  const root = dataFolder()
  const staging = `${root}.restoring-${Date.now()}`
  const manifest = await extractBackup(zipFile, staging)
  const keep = hasFiles(root)
  const keepAside = asideName(root, t.beforeRestore)

  try {
    // Bring an older backup up to date and check it opens before anything is replaced.
    let probe: DatabaseSync
    try {
      probe = openDatabase(join(staging, BACKUP_DB))
    } catch (err) {
      throw new Error(String(err).includes('DATABASE_TOO_NEW') ? 'BACKUP_TOO_NEW' : 'BACKUP_INVALID')
    }
    // Keys and the folder location belong to this computer, not to the backup.
    const local = localRows()
    probe.exec('DELETE FROM secrets')
    const insert = probe.prepare('INSERT INTO secrets (name, value) VALUES (?, ?)')
    for (const s of local.secrets) insert.run(s.name, s.value)
    if (local.dataFolder === null) probe.exec("DELETE FROM settings WHERE key = 'dataFolder'")
    else
      probe
        .prepare(
          "INSERT INTO settings (key, value) VALUES ('dataFolder', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
        )
        .run(local.dataFolder)
    probe.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    probe.close()

    const date = new Date(manifest.createdAt).toLocaleString(app.getLocale())
    const confirm = {
      type: 'warning' as const,
      buttons: [t.restore, t.cancel],
      defaultId: 1,
      cancelId: 1,
      title: t.restoreTitle,
      message: t.restoreMessage.replace('{date}', date),
      detail: keep ? t.restoreDetail.replace('{folder}', keepAside) : t.restoreDetailFresh
    }
    const { response } = win ? await dialog.showMessageBox(win, confirm) : await dialog.showMessageBox(confirm)
    if (response !== 0) {
      rmSync(staging, { recursive: true, force: true })
      return false
    }
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    throw err
  }

  // The swap. A copy of the current database goes to backups/ first.
  const userData = app.getPath('userData')
  const dbPath = join(userData, 'tatabu.db')
  const safety = join(userData, 'backups', `tatabu-before-restore-${Date.now()}.db`)
  try {
    mkdirSync(dirname(safety), { recursive: true })
    getDb().exec(`VACUUM INTO '${safety.replace(/'/g, "''")}'`)
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    throw err
  }
  closeServices()
  let movedAside = false
  let swapped = false
  try {
    if (keep) {
      renameSync(root, keepAside)
      movedAside = true
    } else {
      rmSync(root, { recursive: true, force: true })
    }
    renameSync(join(staging, 'documents'), root)
    swapped = true
    for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
    copyFileSync(join(staging, BACKUP_DB), dbPath)
  } catch (err) {
    // Put things back as they were.
    try {
      if (swapped) renameSync(root, join(staging, 'documents'))
      if (movedAside && !existsSync(root)) renameSync(keepAside, root)
      for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
      copyFileSync(safety, dbPath)
    } finally {
      initServices()
      rmSync(staging, { recursive: true, force: true })
    }
    throw err
  }
  rmSync(staging, { recursive: true, force: true })
  initServices()
  ensureDataFolder(dataFolder())
  for (const w of BrowserWindow.getAllWindows()) w.webContents.reload()
  return true
}
