/**
 * UI preferences (language, theme) kept in a small JSON file in userData.
 * Phase 1 moves app settings into SQLite; these two stay here because they are
 * needed before the database is opened (first paint, window background).
 */
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { UiPrefs } from '@shared/ipc'

const DEFAULTS: UiPrefs = { language: 'en', theme: 'system' }

function file(): string {
  return join(app.getPath('userData'), 'ui-prefs.json')
}

export function readPrefs(): UiPrefs {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<UiPrefs>
    return {
      language: raw.language === 'ar' ? 'ar' : 'en',
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system'
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writePrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next = { ...readPrefs(), ...patch }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
