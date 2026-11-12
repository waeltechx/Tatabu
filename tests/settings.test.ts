import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/open'
import { getAiSettings, updateAiSettings, getSetting, setSetting } from '../src/main/repo/settings'
import { createSecretStore, maskKey, type Cipher } from '../src/main/repo/secrets'
import { addLanguage, guessDirection, listLanguages, removeLanguage } from '../src/main/repo/languages'
import { listReferees, moveReferee, removeReferee, saveReferee } from '../src/main/repo/referees'
import { EMPTY_REFEREE } from '@shared/settings'

/** Stand-in for safeStorage: reversible, but the stored bytes never contain the key. */
function fakeCipher(available = true): Cipher {
  return {
    available: () => available,
    encrypt: (s) => new TextEncoder().encode(Buffer.from(s).toString('base64').split('').reverse().join('')),
    decrypt: (b) => Buffer.from(new TextDecoder().decode(b).split('').reverse().join(''), 'base64').toString()
  }
}

describe('settings', () => {
  it('round-trips JSON values', () => {
    const db = openDatabase(':memory:')
    expect(getSetting(db, 'missing', 42)).toBe(42)
    setSetting(db, 'onboarded', true)
    setSetting(db, 'onboarded', false)
    expect(getSetting(db, 'onboarded', true)).toBe(false)
  })

  it('has safe AI defaults and merges updates', () => {
    const db = openDatabase(':memory:')
    expect(getAiSettings(db)).toEqual({ useAltText: false, altProvider: 'gemini', altModel: '' })
    updateAiSettings(db, { useAltText: true, altModel: 'gemini-x' })
    expect(getAiSettings(db)).toEqual({ useAltText: true, altProvider: 'gemini', altModel: 'gemini-x' })
  })

  it('clears the model when the provider changes', () => {
    const db = openDatabase(':memory:')
    updateAiSettings(db, { altModel: 'gemini-x' })
    expect(updateAiSettings(db, { altProvider: 'openai' }).altModel).toBe('')
  })

  it('ignores an unknown provider', () => {
    const db = openDatabase(':memory:')
    expect(updateAiSettings(db, { altProvider: 'nope' as never }).altProvider).toBe('gemini')
  })
})

describe('secrets', () => {
  it('stores keys encrypted and returns them masked', () => {
    const db = openDatabase(':memory:')
    const store = createSecretStore(db, fakeCipher())
    store.set('groq', '  gsk_abcdefghijklmnop7Qx2 ')
    expect(store.get('groq')).toBe('gsk_abcdefghijklmnop7Qx2')
    expect(store.status('groq')).toEqual({ set: true, masked: 'gsk_••••••••••••••••7Qx2' })
    const raw = db.prepare("SELECT value FROM secrets WHERE name = 'groq'").get() as { value: Uint8Array }
    expect(Buffer.from(raw.value).toString()).not.toContain('abcdefghijklmnop')
  })

  it('deletes a key when set to empty', () => {
    const db = openDatabase(':memory:')
    const store = createSecretStore(db, fakeCipher())
    store.set('gemini', 'AIzaSyExampleKey1234')
    store.set('gemini', '')
    expect(store.status('gemini')).toEqual({ set: false, masked: '' })
  })

  it('refuses to save without secure storage', () => {
    const db = openDatabase(':memory:')
    const store = createSecretStore(db, fakeCipher(false))
    expect(() => store.set('groq', 'gsk_x')).toThrow('SECURE_STORAGE_UNAVAILABLE')
  })

  it('reports every key', () => {
    const db = openDatabase(':memory:')
    const all = createSecretStore(db, fakeCipher()).allStatus()
    expect(Object.keys(all).sort()).toEqual(['gemini', 'groq', 'openai', 'openrouter'])
  })

  it('masks short keys completely', () => {
    expect(maskKey('short')).toBe('••••••••••••')
  })
})

describe('document languages', () => {
  it('adds a language by name and guesses its direction', () => {
    const db = openDatabase(':memory:')
    expect(addLanguage(db, '  Deutsch ')).toEqual({ id: 'deutsch', name: 'Deutsch', dir: 'ltr', builtin: false })
    expect(addLanguage(db, 'فارسی').dir).toBe('rtl')
    expect(listLanguages(db).map((l) => l.name)).toEqual(['English', 'العربية', 'Deutsch', 'فارسی'])
  })

  it('rejects duplicates and empty names', () => {
    const db = openDatabase(':memory:')
    expect(() => addLanguage(db, 'english')).toThrow('LANGUAGE_EXISTS')
    expect(() => addLanguage(db, 'العربية')).toThrow('LANGUAGE_EXISTS')
    expect(() => addLanguage(db, '   ')).toThrow('LANGUAGE_NAME_EMPTY')
  })

  it('removes added languages but never the built-in ones', () => {
    const db = openDatabase(':memory:')
    addLanguage(db, 'Français')
    removeLanguage(db, 'français')
    expect(() => removeLanguage(db, 'en')).toThrow('LANGUAGE_BUILTIN')
    expect(listLanguages(db)).toHaveLength(2)
  })

  it('knows common right-to-left languages by their English name', () => {
    expect(guessDirection('Urdu')).toBe('rtl')
    expect(guessDirection('Hebrew')).toBe('rtl')
    expect(guessDirection('Türkçe')).toBe('ltr')
  })
})

describe('default referees', () => {
  it('adds, edits, reorders and removes', () => {
    const db = openDatabase(':memory:')
    const a = saveReferee(db, { ...EMPTY_REFEREE, name: 'Dr. A', email: ' a@x.org ' })
    const b = saveReferee(db, { ...EMPTY_REFEREE, name: 'Prof. B', includeRelationship: true })
    expect(listReferees(db).map((r) => r.name)).toEqual(['Dr. A', 'Prof. B'])
    expect(listReferees(db)[0]!.email).toBe('a@x.org')

    saveReferee(db, { ...a, affiliation: 'TU' })
    expect(listReferees(db)[0]!.affiliation).toBe('TU')

    expect(moveReferee(db, b.id, -1).map((r) => r.name)).toEqual(['Prof. B', 'Dr. A'])
    expect(listReferees(db)[0]!.includeRelationship).toBe(true)

    removeReferee(db, b.id)
    expect(listReferees(db).map((r) => r.id)).toEqual([a.id])
  })

  it('requires a name', () => {
    const db = openDatabase(':memory:')
    expect(() => saveReferee(db, { ...EMPTY_REFEREE, name: '  ' })).toThrow('REFEREE_NAME_EMPTY')
  })
})
