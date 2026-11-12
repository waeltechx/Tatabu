import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrate, type Migration } from './migrate'
import { MIGRATIONS } from './schema'

export type Db = DatabaseSync

/**
 * Opens (and migrates) a database. `path` may be ':memory:' for tests.
 * Before upgrading an existing database, a copy goes to `backupDir`.
 */
export function openDatabase(path: string, backupDir?: string, migrations: readonly Migration[] = MIGRATIONS): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')

  migrate(db, migrations, (from) => {
    if (!backupDir || path === ':memory:') return
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(backupDir, `tatabu-v${from}-${stamp}.db`).replace(/'/g, "''")
    db.exec(`VACUUM INTO '${target}'`)
  })
  return db
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
