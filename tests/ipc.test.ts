import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import en from '../src/renderer/src/i18n/en.json'
import ar from '../src/renderer/src/i18n/ar.json'

describe('IPC contract', () => {
  it('lists every channel exactly once', () => {
    expect(new Set(IPC_CHANNELS).size).toBe(IPC_CHANNELS.length)
  })
})

function keys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
}

describe('translations', () => {
  it('Arabic has exactly the same keys as English', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort())
  })
})
