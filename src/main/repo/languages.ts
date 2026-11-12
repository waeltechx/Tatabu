import type { Db } from '../db/open'
import type { DocLanguage } from '@shared/settings'

interface Row {
  id: string
  name: string
  dir: 'ltr' | 'rtl'
  builtin: number
}

const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/
const RTL_NAMES = /^(persian|farsi|urdu|hebrew|pashto|sindhi|uyghur|dhivehi|yiddish|kurdish \(sorani\)|sorani)$/i

/** A language written right-to-left, judged from the name the user typed. */
export function guessDirection(name: string): 'ltr' | 'rtl' {
  return RTL_SCRIPT.test(name) || RTL_NAMES.test(name.trim()) ? 'rtl' : 'ltr'
}

function toLanguage(r: Row): DocLanguage {
  return { id: r.id, name: r.name, dir: r.dir, builtin: r.builtin === 1 }
}

export function listLanguages(db: Db): DocLanguage[] {
  return (db.prepare('SELECT id, name, dir, builtin FROM languages ORDER BY sort, rowid').all() as unknown as Row[]).map(
    toLanguage
  )
}

export function addLanguage(db: Db, rawName: string): DocLanguage {
  const name = rawName.replace(/\s+/g, ' ').trim()
  if (!name) throw new Error('LANGUAGE_NAME_EMPTY')
  const id = name.toLocaleLowerCase()
  const clash = listLanguages(db).some((l) => l.id === id || l.name.toLocaleLowerCase() === id)
  if (clash) throw new Error('LANGUAGE_EXISTS')
  const { next } = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM languages').get() as { next: number }
  const dir = guessDirection(name)
  db.prepare('INSERT INTO languages (id, name, dir, builtin, sort) VALUES (?, ?, ?, 0, ?)').run(id, name, dir, next)
  return { id, name, dir, builtin: false }
}

export function removeLanguage(db: Db, id: string): void {
  const row = db.prepare('SELECT builtin FROM languages WHERE id = ?').get(id) as { builtin: number } | undefined
  if (!row) throw new Error('NOT_FOUND')
  if (row.builtin === 1) throw new Error('LANGUAGE_BUILTIN')
  db.prepare('DELETE FROM languages WHERE id = ?').run(id)
}
