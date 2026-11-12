/** App-wide singletons: the database, the key store and the documents folder. */
import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { openDatabase, type Db } from './db/open'
import { createSecretStore, type Cipher, type SecretStore } from './repo/secrets'
import { getAiSettings, getSetting, setSetting } from './repo/settings'
import { ensureDataFolder } from './storage/dataFolder'
import type { SettingsView } from '@shared/settings'

let db: Db | null = null
let secrets: SecretStore | null = null

const safeStorageCipher: Cipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(Buffer.from(data))
}

/** Opens the database in userData. Throws if it can't (e.g. written by a newer version). */
export function initServices(): void {
  const userData = app.getPath('userData')
  db = openDatabase(join(userData, 'tatabu.db'), join(userData, 'backups'))
  secrets = createSecretStore(db, safeStorageCipher)
  ensureDataFolder(dataFolder())
}

export function closeServices(): void {
  db?.close()
  db = null
  secrets = null
}

export function getDb(): Db {
  if (!db) throw new Error('Database not open')
  return db
}

export function getSecrets(): SecretStore {
  if (!secrets) throw new Error('Database not open')
  return secrets
}

export function defaultDataFolder(): string {
  return join(app.getPath('documents'), 'Tatabu')
}

export function dataFolder(): string {
  return getSetting(getDb(), 'dataFolder', '') || defaultDataFolder()
}

export function setDataFolder(path: string): void {
  setSetting(getDb(), 'dataFolder', path)
}

export function settingsView(): SettingsView {
  const d = getDb()
  return {
    ai: getAiSettings(d),
    keys: getSecrets().allStatus(),
    dataFolder: dataFolder(),
    onboarded: getSetting(d, 'onboarded', false),
    secureStorage: getSecrets().available()
  }
}
