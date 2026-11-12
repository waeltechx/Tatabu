import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate, schemaVersion, type Migration } from '../src/main/db/migrate'
import { MIGRATIONS } from '../src/main/db/schema'
import { openDatabase } from '../src/main/db/open'

const temps: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tatabu-db-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true })
})

describe('migrate', () => {
  it('creates the latest schema on a new database', () => {
    const db = openDatabase(':memory:')
    expect(schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name
    )
    for (const t of [
      'applications',
      'files',
      'library_files',
      'profile',
      'settings',
      'secrets',
      'referees',
      'application_referees',
      'cv_master',
      'cv_templates',
      'documents',
      'letter_prefs',
      'languages'
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('seeds English and Arabic as built-in languages', () => {
    const db = openDatabase(':memory:')
    const rows = db.prepare('SELECT id, dir, builtin FROM languages ORDER BY sort').all()
    expect(rows).toEqual([
      { id: 'en', dir: 'ltr', builtin: 1 },
      { id: 'ar', dir: 'rtl', builtin: 1 }
    ])
  })

  it('runs only pending migrations and is idempotent', () => {
    const db = new DatabaseSync(':memory:')
    const steps: Migration[] = [
      { version: 1, up: 'CREATE TABLE a (x)' },
      { version: 2, up: 'CREATE TABLE b (y)' }
    ]
    expect(migrate(db, steps.slice(0, 1))).toEqual({ from: 0, to: 1 })
    expect(migrate(db, steps)).toEqual({ from: 1, to: 2 })
    expect(migrate(db, steps)).toEqual({ from: 2, to: 2 })
  })

  it('rolls back a failing migration and keeps the old version', () => {
    const db = new DatabaseSync(':memory:')
    migrate(db, [{ version: 1, up: 'CREATE TABLE a (x)' }])
    expect(() =>
      migrate(db, [
        { version: 1, up: 'CREATE TABLE a (x)' },
        { version: 2, up: 'CREATE TABLE b (y); INSERT INTO nope VALUES (1);' }
      ])
    ).toThrow()
    expect(schemaVersion(db)).toBe(1)
    const b = db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()
    expect(b).toBeUndefined()
  })

  it('refuses a database from a newer app version', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA user_version = 99')
    expect(() => migrate(db, MIGRATIONS)).toThrow(/DATABASE_TOO_NEW/)
  })

  it('calls the backup hook only for an existing database with pending work', () => {
    const db = new DatabaseSync(':memory:')
    const calls: number[] = []
    const steps: Migration[] = [{ version: 1, up: 'CREATE TABLE a (x)' }]
    migrate(db, steps, (from) => calls.push(from))
    expect(calls).toEqual([]) // brand new database: nothing to back up
    migrate(db, [...steps, { version: 2, up: 'CREATE TABLE b (y)' }], (from) => calls.push(from))
    expect(calls).toEqual([1])
    migrate(db, [...steps, { version: 2, up: 'CREATE TABLE b (y)' }], (from) => calls.push(from))
    expect(calls).toEqual([1])
  })

})

describe('backup on upgrade', () => {
  it('makes no backup for a brand-new database file', () => {
    const dir = tempDir()
    openDatabase(join(dir, 'tatabu.db'), join(dir, 'backups')).close()
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })

  it('copies the database aside before an upgrade, with the old data in it', () => {
    const dir = tempDir()
    const file = join(dir, 'tatabu.db')
    const backups = join(dir, 'backups')
    const first = openDatabase(file, backups)
    first.prepare("INSERT INTO settings (key, value) VALUES ('probe', '1')").run()
    first.close()

    // Next launch ships one more migration.
    const next = openDatabase(file, backups, [...MIGRATIONS, { version: 999, up: 'CREATE TABLE future (x)' }])
    expect(schemaVersion(next)).toBe(999)
    next.close()

    const copies = readdirSync(backups)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatch(new RegExp(`^tatabu-v${MIGRATIONS.at(-1)!.version}-.*\\.db$`))
    const copy = new DatabaseSync(join(backups, copies[0]!))
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'probe'").get()).toEqual({ value: '1' })
    expect(schemaVersion(copy)).toBe(MIGRATIONS.at(-1)!.version)
    copy.close()
  })
})
