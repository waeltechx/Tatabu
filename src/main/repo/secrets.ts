import type { Db } from '../db/open'
import { SECRET_NAMES, type KeyStatus, type SecretName } from '@shared/settings'

/** Encryption backend. In the app this is Electron's safeStorage (OS keychain / DPAPI). */
export interface Cipher {
  available(): boolean
  encrypt(plain: string): Uint8Array
  decrypt(data: Uint8Array): string
}

export function maskKey(key: string): string {
  if (key.length <= 10) return '•'.repeat(12)
  return `${key.slice(0, 4)}${'•'.repeat(16)}${key.slice(-4)}`
}

export function isSecretName(name: unknown): name is SecretName {
  return typeof name === 'string' && (SECRET_NAMES as readonly string[]).includes(name)
}

export function createSecretStore(db: Db, cipher: Cipher) {
  function get(name: SecretName): string | null {
    const row = db.prepare('SELECT value FROM secrets WHERE name = ?').get(name) as { value: Uint8Array } | undefined
    if (!row || !cipher.available()) return null
    try {
      return cipher.decrypt(row.value)
    } catch {
      return null // encrypted on another machine/user, or keychain reset
    }
  }

  function set(name: SecretName, value: string | null): void {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) {
      db.prepare('DELETE FROM secrets WHERE name = ?').run(name)
      return
    }
    if (!cipher.available()) throw new Error('SECURE_STORAGE_UNAVAILABLE')
    db.prepare(
      'INSERT INTO secrets (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value'
    ).run(name, cipher.encrypt(trimmed))
  }

  function status(name: SecretName): KeyStatus {
    const key = get(name)
    return key ? { set: true, masked: maskKey(key) } : { set: false, masked: '' }
  }

  function allStatus(): Record<SecretName, KeyStatus> {
    return Object.fromEntries(SECRET_NAMES.map((n) => [n, status(n)])) as Record<SecretName, KeyStatus>
  }

  return { get, set, status, allStatus, available: () => cipher.available() }
}

export type SecretStore = ReturnType<typeof createSecretStore>
