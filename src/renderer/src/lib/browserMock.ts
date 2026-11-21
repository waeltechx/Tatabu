/**
 * Dev-only stand-in for the preload bridge, so the renderer can be opened in a
 * plain browser tab (http://localhost:5173) while designing screens.
 * Never included in production builds (guarded by import.meta.env.DEV).
 * Everything lives in memory; add `?onboarded` to the URL to skip the welcome screen.
 */
import type { IpcArgs, IpcChannel, IpcResult, TatabuApi, UiPrefs } from '@shared/ipc'
import {
  DEFAULT_AI_SETTINGS,
  normalizeBaseUrl,
  SECRET_NAMES,
  type AiSettings,
  type DocLanguage,
  type ImportedFile,
  type KeyStatus,
  type Referee,
  type SecretName
} from '@shared/settings'
import type { ModelInfo, ProviderCheck, ProviderId } from '@shared/ai'
import pkg from '../../../../package.json'
import { createAppMocks } from './browserMockApps'
import { createDocMocks } from './browserMockDocs'
import { createDesignMocks } from './browserMockDesign'

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
  ],
  custom: [
    { id: 'claude-sonnet-4-5', vision: null },
    { id: 'claude-haiku-4-5', vision: null }
  ]
}
const MOCK_DEFAULT: Record<ProviderId, string> = {
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-3-flash',
  openai: 'gpt-5-mini',
  openrouter: 'openai/gpt-oss-120b',
  custom: 'claude-sonnet-4-5'
}

export function installBrowserMock(): void {
  // `?lang=ar` and `?theme=dark` start in that language and theme (for screenshots).
  const startParams = new URLSearchParams(location.search)
  let prefs: UiPrefs = {
    language: startParams.get('lang') === 'ar' ? 'ar' : 'en',
    theme: (['light', 'dark'] as const).find((t) => t === startParams.get('theme')) ?? 'system'
  }
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
  let paper: 'A4' | 'Letter' = 'A4'
  const checks: Partial<Record<SecretName, ProviderCheck>> = {}
  // `?demo` starts with a tested Groq key and an imported CV, like a set-up app.
  if (startParams.has('demo')) {
    secrets.set('groq', 'gsk_demo00000000000000000000x7Qk')
    checks.groq = { model: MOCK_DEFAULT.groq, testedAt: new Date().toISOString(), visionModel: MOCK_MODELS.groq[1]!.id }
    cv = { id: 'lib_cv', filename: 'Omar_Haddad_CV.pdf' }
    referees = [
      {
        id: 'ref_1',
        name: 'Dr. Lina Saleh',
        affiliation: 'Head of Engineering, Kiezware GmbH',
        relationship: 'Former manager',
        includeRelationship: false,
        email: 'lina.saleh@example.com',
        phone: '+49 30 5550 0199',
        address: ''
      },
      {
        id: 'ref_2',
        name: 'Karim Mansour',
        affiliation: 'CTO, Souq Digital',
        relationship: 'Former team lead',
        includeRelationship: false,
        email: 'karim.mansour@example.com',
        phone: '+962 6 555 0142',
        address: ''
      }
    ]
  }
  const appMocks = createAppMocks({
    hasGroq: () => secrets.has('groq'),
    cv: () => cv,
    hasReferees: () => referees.length > 0
  })

  const docMocks = createDocMocks({ referees: () => referees, apps: appMocks })

  const mask = (k: string): string => `${k.slice(0, 4)}${'•'.repeat(16)}${k.slice(-4)}`
  const view = () => ({
    ai,
    keys: Object.fromEntries(
      SECRET_NAMES.map((n) => [n, secrets.has(n) ? { set: true, masked: mask(secrets.get(n)!) } : { set: false, masked: '' }])
    ) as Record<SecretName, KeyStatus>,
    dataFolder,
    onboarded,
    secureStorage: true,
    checks: { ...checks },
    paper
  })

  // Channels without a mock reject, so a missing one shows up as an error toast.
  const handlers: {
    [C in IpcChannel]?: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
  } = {
    'app:info': () => ({ version: startParams.has('demo') ? pkg.version : '0.0.0-browser', platform: 'browser' }),
    'prefs:get': () => prefs,
    'prefs:set': (patch) => (prefs = { ...prefs, ...patch }),
    'settings:get': view,
    'settings:setAi': (patch) => {
      if (patch.altProvider && patch.altProvider !== ai.altProvider) ai = { ...ai, altModel: '' }
      if (patch.altModel !== undefined && patch.altModel !== ai.altModel) delete checks[ai.altProvider]
      if (patch.customBaseUrl !== undefined) {
        const url = normalizeBaseUrl(patch.customBaseUrl)
        if (patch.customBaseUrl.trim() && !url) throw new Error('AI_NO_ENDPOINT')
        patch = { ...patch, customBaseUrl: url }
      }
      if (
        (patch.customBaseUrl !== undefined && patch.customBaseUrl !== ai.customBaseUrl) ||
        (patch.customModel !== undefined && patch.customModel !== ai.customModel)
      ) {
        delete checks.custom
      }
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
    'settings:setPaper': (p) => ((paper = p), view()),
    ...docMocks,
    ...createDesignMocks(),
    'storage:open': () => undefined,
    'storage:change': () => ((dataFolder = 'D:\\Jobs\\Tatabu'), view()),
    'library:importCv': () => (cv = { id: 'lib_demo', filename: 'My CV.pdf' }),
    'library:latestCv': () => cv,
    // Keys starting with "bad" fail, so error states can be seen.
    'ai:test': async (provider) => {
      await wait(900)
      const key = secrets.get(provider)
      if (provider === 'custom' && !ai.customBaseUrl) throw new Error('AI_NO_ENDPOINT')
      if (!key && provider !== 'custom') throw new Error('AI_NO_KEY')
      if (key?.startsWith('bad')) throw new Error('AI_AUTH: Invalid API Key')
      const model =
        provider === 'custom' ? ai.customModel || MOCK_DEFAULT.custom : (provider !== 'groq' && ai.altModel) || MOCK_DEFAULT[provider]
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
      if (provider === 'custom') return ai.customBaseUrl ? MOCK_MODELS.custom : []
      if (!secrets.has(provider)) throw new Error('AI_NO_KEY')
      return MOCK_MODELS[provider]
    },
    ...appMocks,
    // Matches by company name in the pasted email; "interview" and "unfortunately" set the status.
    'email:analyze': async (text) => {
      await wait(900)
      if (!text.trim()) throw new Error('TEXT_EMPTY')
      const list = await appMocks['apps:list']()
      const hit = list.find((a) => a.company && text.toLowerCase().includes(a.company.toLowerCase())) ?? null
      const status = /unfortunately|leider|نعتذر|للأسف/i.test(text) ? 'rejected' : /interview|مقابلة/i.test(text) ? 'interview' : 'applied'
      return {
        applicationId: hit?.id ?? null,
        status,
        confidence: hit ? 0.92 : 0.3,
        reasoning: hit
          ? /[؀-ۿ]/.test(text)
            ? `الإيميل من ${hit.company} ويدعوك لمقابلة لوظيفة ${hit.jobTitle}.`
            : `The email is from ${hit.company} and invites you to an interview for the ${hit.jobTitle} role.`
          : 'No application matches this email.',
        provider: 'Groq',
        model: 'openai/gpt-oss-120b'
      }
    },
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
        const fn = handlers[channel] as ((...a: unknown[]) => never) | undefined
        if (!fn) return Promise.reject(new Error(`NOT_FOUND: no browser mock for ${channel}`))
        return Promise.resolve(fn(...args))
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
  ;(window as unknown as { tatabu: TatabuApi }).tatabu = api
}
