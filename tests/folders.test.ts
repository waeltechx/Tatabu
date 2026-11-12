import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applicationFolderName, withCollisionSuffix } from '@shared/folderName'
import {
  copyIntoLibrary,
  createApplicationFolder,
  moveDataFolder,
  renameApplicationFolder,
  resolveTargetFolder
} from '../src/main/storage/dataFolder'

const temps: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tatabu-fs-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true })
})

describe('applicationFolderName', () => {
  it('joins company and title with an en dash', () => {
    expect(applicationFolderName('Personio', 'Frontend Engineer')).toBe('Personio – Frontend Engineer')
  })

  it('keeps Arabic and German letters', () => {
    expect(applicationFolderName('شركة المستقبل', 'مهندس برمجيات')).toBe('شركة المستقبل – مهندس برمجيات')
    expect(applicationFolderName('Müller & Söhne', 'Entwickler (m/w/d)')).toBe('Müller & Söhne – Entwickler (m w d)')
  })

  it('removes characters Windows and macOS refuse', () => {
    expect(applicationFolderName('A<B>C:D"E', 'F/G\\H|I?J*K')).toBe('A B C D E – F G H I J K')
  })

  it('drops invisible direction marks and control characters', () => {
    expect(applicationFolderName('‏Acme\u0007', 'Dev‮')).toBe('Acme – Dev')
  })

  it('uses whichever part exists, or a fallback', () => {
    expect(applicationFolderName('', 'Designer')).toBe('Designer')
    expect(applicationFolderName('Acme', '   ')).toBe('Acme')
    expect(applicationFolderName('', '')).toBe('Untitled')
    expect(applicationFolderName('???', '***')).toBe('Untitled')
  })

  it('strips leading dots and trailing dots or spaces', () => {
    expect(applicationFolderName('.hidden', 'Role...')).toBe('hidden – Role')
  })

  it('escapes Windows reserved names', () => {
    expect(applicationFolderName('CON', '')).toBe('CON_')
    expect(applicationFolderName('lpt1', '')).toBe('lpt1_')
    expect(applicationFolderName('Console', '')).toBe('Console')
  })

  it('caps the length without splitting characters', () => {
    const name = applicationFolderName('A'.repeat(60), '😀'.repeat(60))
    expect(Array.from(name).length).toBeLessThanOrEqual(80)
    expect(name.endsWith('\ud83d')).toBe(false)
  })
})

describe('withCollisionSuffix', () => {
  it('adds (2), (3) … until free, case-insensitively', () => {
    const taken = new Set(['acme – dev', 'acme – dev (2)'])
    const isTaken = (n: string): boolean => taken.has(n.toLowerCase())
    expect(withCollisionSuffix('Acme – Dev', isTaken)).toBe('Acme – Dev (3)')
    expect(withCollisionSuffix('Other', isTaken)).toBe('Other')
  })
})

describe('application folders on disk', () => {
  it('creates the folder and suffixes a second one with the same name', () => {
    const root = tempDir()
    expect(createApplicationFolder(root, 'Acme', 'Dev')).toBe('Acme – Dev')
    expect(createApplicationFolder(root, 'ACME', 'dev')).toBe('ACME – dev (2)')
    expect(readdirSync(root).sort()).toEqual(['ACME – dev (2)', 'Acme – Dev', '_Library'])
  })

  it('renames after an edit and keeps the files', () => {
    const root = tempDir()
    const name = createApplicationFolder(root, 'Acme', 'Dev')
    writeFileSync(join(root, name, 'cv.pdf'), 'x')
    const renamed = renameApplicationFolder(root, name, 'Acme', 'Senior Dev')
    expect(renamed).toBe('Acme – Senior Dev')
    expect(readFileSync(join(root, renamed, 'cv.pdf'), 'utf8')).toBe('x')
    expect(existsSync(join(root, name))).toBe(false)
  })

  it('keeps a suffixed name when the title did not change', () => {
    const root = tempDir()
    createApplicationFolder(root, 'Acme', 'Dev')
    const second = createApplicationFolder(root, 'Acme', 'Dev')
    expect(renameApplicationFolder(root, second, 'Acme', 'Dev')).toBe('Acme – Dev (2)')
  })

  it('handles a case-only rename', () => {
    const root = tempDir()
    const name = createApplicationFolder(root, 'acme', 'dev')
    expect(renameApplicationFolder(root, name, 'Acme', 'Dev')).toBe('acme – dev') // same name, ignoring case
  })

  it('recreates a folder that went missing', () => {
    const root = tempDir()
    expect(renameApplicationFolder(root, 'Gone – Away', 'Acme', 'Dev')).toBe('Acme – Dev')
    expect(existsSync(join(root, 'Acme – Dev'))).toBe(true)
  })

  it('copies a file into _Library without overwriting', () => {
    const root = tempDir()
    const src = join(tempDir(), 'My CV.pdf')
    writeFileSync(src, 'pdf')
    expect(copyIntoLibrary(root, src)).toBe('_Library/My CV.pdf')
    expect(copyIntoLibrary(root, src)).toBe('_Library/My CV (2).pdf')
  })
})

describe('moving the documents folder', () => {
  it('moves everything to a new folder', () => {
    const from = join(tempDir(), 'Tatabu')
    createApplicationFolder(from, 'Acme', 'Dev')
    writeFileSync(join(from, 'Acme – Dev', 'letter.pdf'), 'L')
    const to = join(tempDir(), 'Moved')
    moveDataFolder(from, to)
    expect(existsSync(from)).toBe(false)
    expect(readFileSync(join(to, 'Acme – Dev', 'letter.pdf'), 'utf8')).toBe('L')
    expect(existsSync(join(to, '_Library'))).toBe(true)
  })

  it('accepts an existing empty folder', () => {
    const from = join(tempDir(), 'Tatabu')
    createApplicationFolder(from, 'Acme', 'Dev')
    const to = tempDir()
    moveDataFolder(from, to)
    expect(readdirSync(to)).toContain('Acme – Dev')
  })

  it('refuses a folder that already has files', () => {
    const from = join(tempDir(), 'Tatabu')
    createApplicationFolder(from, 'Acme', 'Dev')
    const to = tempDir()
    writeFileSync(join(to, 'other.txt'), 'x')
    expect(() => moveDataFolder(from, to)).toThrow('FOLDER_NOT_EMPTY')
    expect(existsSync(join(from, 'Acme – Dev'))).toBe(true)
  })

  it('refuses moving into itself', () => {
    const from = join(tempDir(), 'Tatabu')
    createApplicationFolder(from, 'Acme', 'Dev')
    expect(() => moveDataFolder(from, join(from, 'inner'))).toThrow('FOLDER_INSIDE_CURRENT')
  })

  it('picks a Tatabu subfolder when the chosen folder is not empty', () => {
    const chosen = tempDir()
    expect(resolveTargetFolder(chosen)).toBe(chosen)
    mkdirSync(join(chosen, 'stuff'))
    expect(resolveTargetFolder(chosen)).toBe(join(chosen, 'Tatabu'))
  })
})
