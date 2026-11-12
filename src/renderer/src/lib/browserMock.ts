/**
 * Dev-only stand-in for the preload bridge, so the renderer can be opened in a
 * plain browser tab (http://localhost:5173) while designing screens.
 * Never included in production builds (guarded by import.meta.env.DEV).
 * Everything lives in memory; add `?onboarded` to the URL to skip the welcome screen.
 */
import type { IpcArgs, IpcChannel, IpcResult, TatabuApi, UiPrefs } from '@shared/ipc'
import {
  DEFAULT_AI_SETTINGS,
  SECRET_NAMES,
  type AiSettings,
  type DocLanguage,
  type ImportedFile,
  type KeyStatus,
  type Referee,
  type SecretName
} from '@shared/settings'

export function installBrowserMock(): void {
  let prefs: UiPrefs = { language: 'en', theme: 'system' }
  let ai: AiSettings = { ...DEFAULT_AI_SETTINGS }
  let onboarded = new URLSearchParams(location.search).has('onboarded')
  let dataFolder = 'C:\\Users\\you\\Documents\\Tatabu'
  let cv: ImportedFile | null = null
  const secrets = new Map<SecretName, string>()
  let languages: DocLanguage[] = [
    { id: 'en', name: 'English', dir: 'ltr', builtin: true },
    { id: 'ar', name: 'العربية', dir: 'rtl', builtin: true }
  ]
  let referees: Referee[] = []

  const mask = (k: string): string => `${k.slice(0, 4)}${'•'.repeat(16)}${k.slice(-4)}`
  const view = () => ({
    ai,
    keys: Object.fromEntries(
      SECRET_NAMES.map((n) => [n, secrets.has(n) ? { set: true, masked: mask(secrets.get(n)!) } : { set: false, masked: '' }])
    ) as Record<SecretName, KeyStatus>,
    dataFolder,
    onboarded,
    secureStorage: true
  })

  const handlers: { [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResult<C> } = {
    'app:info': () => ({ version: '0.0.0-browser', platform: 'browser' }),
    'prefs:get': () => prefs,
    'prefs:set': (patch) => (prefs = { ...prefs, ...patch }),
    'settings:get': view,
    'settings:setAi': (patch) => {
      if (patch.altProvider && patch.altProvider !== ai.altProvider) ai = { ...ai, altModel: '' }
      ai = { ...ai, ...patch }
      return view()
    },
    'settings:completeOnboarding': () => ((onboarded = true), view()),
    'secrets:set': (name, value) => {
      if (value?.trim()) secrets.set(name, value.trim())
      else secrets.delete(name)
      return view()
    },
    'secrets:reveal': (name) => secrets.get(name) ?? '',
    'languages:list': () => languages,
    'languages:add': (name) => {
      const clean = name.trim()
      if (!clean) throw new Error('LANGUAGE_NAME_EMPTY')
      if (languages.some((l) => l.name.toLowerCase() === clean.toLowerCase())) throw new Error('LANGUAGE_EXISTS')
      const dir = /[\u0590-\u08ff]/.test(clean) ? 'rtl' : 'ltr'
      languages = [...languages, { id: clean.toLowerCase(), name: clean, dir, builtin: false }]
      return languages
    },
    'languages:remove': (id) => (languages = languages.filter((l) => l.builtin || l.id !== id)),
    'referees:list': () => referees,
    'referees:save': (input) => {
      if (!input.name.trim()) throw new Error('REFEREE_NAME_EMPTY')
      referees = input.id
        ? referees.map((r) => (r.id === input.id ? { ...r, ...input, id: r.id } : r))
        : [...referees, { ...input, id: `ref_${Math.random().toString(36).slice(2, 10)}` }]
      return referees
    },
    'referees:remove': (id) => (referees = referees.filter((r) => r.id !== id)),
    'referees:move': (id, delta) => {
      const i = referees.findIndex((r) => r.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= referees.length) return referees
      const next = [...referees]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return (referees = next)
    },
    'storage:open': () => undefined,
    'storage:change': () => ((dataFolder = 'D:\\Jobs\\Tatabu'), view()),
    'library:importCv': () => (cv = { id: 'lib_demo', filename: 'My CV.pdf' }),
    'library:latestCv': () => cv
  }

  const api: TatabuApi = {
    invoke: (channel, ...args) => {
      try {
        return Promise.resolve((handlers[channel] as (...a: unknown[]) => never)(...args))
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
  ;(window as unknown as { tatabu: TatabuApi }).tatabu = api
}
