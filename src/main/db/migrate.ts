import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  up: string | ((db: DatabaseSync) => void)
}

export interface MigrateResult {
  from: number
  to: number
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  return row?.user_version ?? 0
}

/**
 * Applies every migration newer than the database's `user_version`, each in its
 * own transaction. `beforeMigrating(from)` runs once, only for an existing
 * database (from > 0) that has pending migrations — that's where the backup goes.
 * Refuses to open a database written by a newer app version.
 */
export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[],
  beforeMigrating?: (from: number) => void
): MigrateResult {
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const latest = sorted.at(-1)?.version ?? 0
  const from = schemaVersion(db)

  if (from > latest) {
    throw new Error(`DATABASE_TOO_NEW: database is version ${from}, this app knows up to ${latest}`)
  }

  const pending = sorted.filter((m) => m.version > from)
  if (pending.length === 0) return { from, to: from }
  if (from > 0) beforeMigrating?.(from)

  for (const m of pending) {
    db.exec('BEGIN')
    try {
      if (typeof m.up === 'string') db.exec(m.up)
      else m.up(db)
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
  return { from, to: latest }
}
