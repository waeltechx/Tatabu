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
import type { ModelInfo, ProviderCheck, ProviderId } from '@shared/ai'
import { createAppMocks } from './browserMockApps'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const MOCK_MODELS: Record<ProviderId, ModelInfo[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', vision: null },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', vision: true },
    { id: 'openai/gpt-oss-120b', vision: false }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', vision: true },
    { id: 'gemini-2.5-pro', vision: true },
    { id: 'gemini-3-flash', vision: true }
  ],
  openai: [
    { id: 'gpt-4.1-mini', vision: true },
    { id: 'gpt-5-mini', vision: true }
  ],
  openrouter: [
    { id: 'deepseek/deepseek-r1', vision: false },
    { id: 'google/gemini-2.5-flash', vision: true },
    { id: 'openai/gpt-oss-120b', vision: false }
  ]
}
const MOCK_DEFAULT: Record<ProviderId, string> = {
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-3-flash',
  openai: 'gpt-5-mini',
  openrouter: 'openai/gpt-oss-120b'
}

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
  const checks: Partial<Record<SecretName, ProviderCheck>> = {}
  const appMocks = createAppMocks({
    hasGroq: () => secrets.has('groq'),
    cv: () => cv,
    hasReferees: () => referees.length > 0
  })

  const mask = (k: string): string => `${k.slice(0, 4)}${'•'.repeat(16)}${k.slice(-4)}`
  const view = () => ({
    ai,
    keys: Object.fromEntries(
      SECRET_NAMES.map((n) => [n, secrets.has(n) ? { set: true, masked: mask(secrets.get(n)!) } : { set: false, masked: '' }])
    ) as Record<SecretName, KeyStatus>,
    dataFolder,
    onboarded,
    secureStorage: true,
    checks: { ...checks }
  })

  const handlers: {
    [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
  } = {
    'app:info': () => ({ version: '0.0.0-browser', platform: 'browser' }),
    'prefs:get': () => prefs,
    'prefs:set': (patch) => (prefs = { ...prefs, ...patch }),
    'settings:get': view,
    'settings:setAi': (patch) => {
      if (patch.altProvider && patch.altProvider !== ai.altProvider) ai = { ...ai, altModel: '' }
      if (patch.altModel !== undefined && patch.altModel !== ai.altModel) delete checks[ai.altProvider]
      ai = { ...ai, ...patch }
      return view()
    },
    'settings:completeOnboarding': () => ((onboarded = true), view()),
    'secrets:set': (name, value) => {
      if (value?.trim()) secrets.set(name, value.trim())
      else secrets.delete(name)
      delete checks[name]
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
    'library:latestCv': () => cv,
    // Keys starting with "bad" fail, so error states can be seen.
    'ai:test': async (provider) => {
      await wait(900)
      const key = secrets.get(provider)
      if (!key) throw new Error('AI_NO_KEY')
      if (key.startsWith('bad')) throw new Error('AI_AUTH: Invalid API Key')
      const model = (provider !== 'groq' && ai.altModel) || MOCK_DEFAULT[provider]
      const visionModel = MOCK_MODELS[provider].find((m) => m.vision)?.id ?? null
      checks[provider] = {
        model,
        testedAt: new Date().toISOString(),
        visionModel
      }
      return view()
    },
    'ai:models': async (provider) => {
      await wait(400)
      if (!secrets.has(provider)) throw new Error('AI_NO_KEY')
      return MOCK_MODELS[provider]
    },
    ...appMocks,
    'voice:access': () => true,
    'voice:transcribe': async (audio) => {
      await wait(800)
      if (!secrets.has('groq')) throw new Error('AI_NO_KEY')
      return audio.byteLength ? 'This sentence came from the browser mock.' : ''
    }
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
