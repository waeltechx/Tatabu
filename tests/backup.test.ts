import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { Zip, ZipDeflate, strToU8 } from 'fflate'
import { openDatabase } from '../src/main/db/open'
import { createBackup, entryTarget, extractBackup } from '../src/main/storage/backup'
import { isNewer } from '@shared/updates'

const dirs: string[] = []
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'tatabu-backup-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('backups', () => {
  it('round-trips the database and every document, without the keys', async () => {
    const base = temp()
    const db = openDatabase(join(base, 'tatabu.db'))
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('paper', '"Letter"')
    db.prepare('INSERT INTO secrets (name, value) VALUES (?, ?)').run('groq', new Uint8Array([1, 2, 3]))
    const docs = join(base, 'docs')
    mkdirSync(join(docs, 'Nordlicht – Analyst'), { recursive: true })
    mkdirSync(join(docs, '_Library'), { recursive: true })
    mkdirSync(join(docs, 'Empty Co – Engineer'), { recursive: true })
    const big = randomBytes(3 * 1024 * 1024)
    writeFileSync(join(docs, 'Nordlicht – Analyst', 'السيرة الذاتية – Omar.pdf'), big)
    writeFileSync(join(docs, '_Library', 'notes.txt'), 'hello')

    // Saving the backup inside the documents folder must not zip it into itself.
    const out = join(docs, 'Tatabu-backup.zip')
    const manifest = await createBackup({ db, dataFolder: docs, outFile: out, tempDir: join(base, 'tmp'), appVersion: '1.2.3' })
    db.close()
    expect(manifest).toMatchObject({ app: 'Tatabu', format: 1, appVersion: '1.2.3', files: 2 })
    expect(manifest.schemaVersion).toBeGreaterThan(0)

    const dest = join(temp(), 'restoring')
    const read = await extractBackup(out, dest)
    expect(read.files).toBe(2)
    expect(readFileSync(join(dest, 'documents', 'Nordlicht – Analyst', 'السيرة الذاتية – Omar.pdf')).equals(big)).toBe(true)
    expect(readFileSync(join(dest, 'documents', '_Library', 'notes.txt'), 'utf8')).toBe('hello')
    expect(existsSync(join(dest, 'documents', 'Tatabu-backup.zip'))).toBe(false)
    expect(existsSync(join(dest, 'documents', 'Empty Co – Engineer'))).toBe(true)

    const restored = new DatabaseSync(join(dest, 'tatabu.db'))
    expect((restored.prepare('SELECT value FROM settings WHERE key = ?').get('paper') as { value: string }).value).toBe(
      '"Letter"'
    )
    expect((restored.prepare('SELECT COUNT(*) AS n FROM secrets').get() as { n: number }).n).toBe(0)
    restored.close()
  })

  it('refuses files that are not Tatabu backups', async () => {
    const base = temp()
    const zipPath = join(base, 'other.zip')
    const chunks: Uint8Array[] = []
    const zip = new Zip((_e, c) => chunks.push(c))
    const f = new ZipDeflate('readme.txt')
    zip.add(f)
    f.push(strToU8('not a backup'), true)
    zip.end()
    writeFileSync(zipPath, Buffer.concat(chunks))
    await expect(extractBackup(zipPath, join(base, 'x'))).rejects.toThrow('BACKUP_INVALID')
    writeFileSync(join(base, 'junk.zip'), 'definitely not a zip')
    await expect(extractBackup(join(base, 'junk.zip'), join(base, 'y'))).rejects.toThrow('BACKUP_INVALID')
    expect(existsSync(join(base, 'x'))).toBe(false)
  })

  it('never writes outside the target folder', () => {
    const dest = join(tmpdir(), 'dest')
    expect(entryTarget(dest, 'documents/a/b.pdf')).toBe(join(dest, 'documents', 'a', 'b.pdf'))
    expect(entryTarget(dest, 'tatabu.db')).toBe(join(dest, 'tatabu.db'))
    expect(entryTarget(dest, 'documents/../../evil.exe')).toBeNull()
    expect(entryTarget(dest, '../evil.exe')).toBeNull()
    expect(entryTarget(dest, '/etc/passwd')).toBeNull()
    expect(entryTarget(dest, 'C:/Windows/evil.dll')).toBeNull()
    expect(entryTarget(dest, 'documents\\..\\..\\evil')).toBeNull()
    expect(entryTarget(dest, 'other/file.txt')).toBeNull()
  })
})

describe('update versions', () => {
  it('compares versions', () => {
    expect(isNewer('1.1.0', '1.0.9')).toBe(true)
    expect(isNewer('v1.0.10', '1.0.9')).toBe(true)
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
    expect(isNewer('0.9.9', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0', '1.0.0-beta.2')).toBe(true)
    expect(isNewer('1.0.0-beta.2', '1.0.0')).toBe(false)
  })
})
