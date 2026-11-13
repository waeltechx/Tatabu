import type { Db } from '../db/open'
import { ALT_PROVIDERS, DEFAULT_AI_SETTINGS, SECRET_NAMES, type AiSettings, type SecretName } from '@shared/settings'
import type { ProviderCheck } from '@shared/ai'

/** Key/value settings stored as JSON in the `settings` table. */
export function getSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value)
  )
}

export function getAiSettings(db: Db): AiSettings {
  const raw = getSetting<Partial<AiSettings>>(db, 'ai', {})
  return {
    useAltText: raw.useAltText === true,
    altProvider: ALT_PROVIDERS.includes(raw.altProvider as never) ? raw.altProvider! : DEFAULT_AI_SETTINGS.altProvider,
    altModel: typeof raw.altModel === 'string' ? raw.altModel : ''
  }
}

export function updateAiSettings(db: Db, patch: Partial<AiSettings>): AiSettings {
  const next = { ...getAiSettings(db), ...patch }
  if (!ALT_PROVIDERS.includes(next.altProvider)) next.altProvider = DEFAULT_AI_SETTINGS.altProvider
  // A model belongs to one provider; switching provider clears it.
  if (patch.altProvider && patch.altProvider !== getAiSettings(db).altProvider && patch.altModel === undefined) {
    next.altModel = ''
  }
  setSetting(db, 'ai', next)
  return next
}

// --- provider checks ("Test" results) ----------------------------------------

export function getChecks(db: Db): Partial<Record<SecretName, ProviderCheck>> {
  const raw = getSetting<Record<string, unknown>>(db, 'checks', {})
  const out: Partial<Record<SecretName, ProviderCheck>> = {}
  for (const name of SECRET_NAMES) {
    const c = raw[name] as Partial<ProviderCheck> | undefined
    if (c && typeof c.model === 'string' && typeof c.testedAt === 'string') {
      out[name] = {
        model: c.model,
        testedAt: c.testedAt,
        visionModel: typeof c.visionModel === 'string' ? c.visionModel : null
      }
    }
  }
  return out
}

export function setCheck(db: Db, name: SecretName, check: ProviderCheck | null): void {
  const all = getChecks(db)
  if (check) all[name] = check
  else delete all[name]
  setSetting(db, 'checks', all)
}
