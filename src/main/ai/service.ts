/**
 * The AI layer as the rest of the app sees it: which provider, key and model
 * each role uses, plus the Settings test. Keys are read here and go no further
 * than the provider's HTTPS endpoint.
 */
import type { ModelInfo, ProviderId } from '@shared/ai'
import { textProvider } from '@shared/ai'
import { getAiSettings, getChecks, setCheck } from '../repo/settings'
import { getDb, getSecrets, settingsView } from '../services'
import { AiError, type FetchFn } from './http'
import { chatJson, chatText, type ChatTarget } from './chat'
import { findVisionModel, listModels, testProvider } from './check'
import { PROVIDERS, pickDefaultModel } from './providers'
import { transcribe } from './voice'

let fetchFn: FetchFn = (input, init) => fetch(input, init)

/** For tests: replace the network. */
export function setFetch(fn: FetchFn): void {
  fetchFn = fn
}

function keyFor(provider: ProviderId): string {
  const key = getSecrets().get(provider)
  if (!key) throw new AiError('AI_NO_KEY', provider)
  return key
}

/** The text model for a provider: the user's pick, else the one the last test chose, else the default. */
export function modelFor(provider: ProviderId): string {
  const db = getDb()
  const ai = getAiSettings(db)
  if (provider !== 'groq' && ai.altProvider === provider && ai.altModel) return ai.altModel
  return getChecks(db)[provider]?.model ?? PROVIDERS[provider].defaultModel
}

/** Where a text task goes. `override` is the explicit "Try with <other provider>". */
export function textTarget(override?: ProviderId): ChatTarget {
  const provider = override ?? textProvider(settingsView())
  return { provider, key: keyFor(provider), model: modelFor(provider) }
}

/** A model of the active text provider that reads images (found once, then remembered). */
export async function visionTarget(override?: ProviderId): Promise<ChatTarget> {
  const text = textTarget(override)
  const known = getChecks(getDb())[text.provider]
  if (known?.visionModel) return { ...text, model: known.visionModel }
  const models = await listModels(fetchFn, text.provider, text.key)
  const visionModel = await findVisionModel(fetchFn, text.provider, text.key, text.model, models)
  if (!visionModel) throw new AiError('AI_NO_VISION', text.provider)
  setCheck(getDb(), text.provider, {
    model: text.model,
    testedAt: new Date().toISOString(),
    visionModel
  })
  return { ...text, model: visionModel }
}

const modelCache = new Map<ProviderId, { at: number; models: ModelInfo[] }>()
const MODEL_CACHE_MS = 10 * 60_000

export async function modelsFor(provider: ProviderId): Promise<ModelInfo[]> {
  const cached = modelCache.get(provider)
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.models
  const models = await listModels(fetchFn, provider, keyFor(provider))
  modelCache.set(provider, { at: Date.now(), models })
  return models
}

/** Forgets what we learned about a provider (its key or model changed). */
export function forgetProvider(provider: ProviderId): void {
  modelCache.delete(provider)
  setCheck(getDb(), provider, null)
}

/** The Settings "Test" button. Remembers the result so the chips survive a restart. */
export async function testAndRemember(provider: ProviderId): Promise<void> {
  const ai = getAiSettings(getDb())
  const userModel = provider !== 'groq' && ai.altProvider === provider ? ai.altModel : ''
  const outcome = await testProvider(
    fetchFn,
    provider,
    keyFor(provider),
    (models) => userModel || pickDefaultModel(provider, models)
  )
  modelCache.set(provider, { at: Date.now(), models: outcome.models })
  setCheck(getDb(), provider, {
    model: outcome.model,
    testedAt: new Date().toISOString(),
    visionModel: outcome.visionModel
  })
}

export function transcribeAudio(audio: Uint8Array, mimeType: string, language?: string): Promise<string> {
  return transcribe(fetchFn, keyFor('groq'), audio, mimeType, language)
}

/** A text task on the active provider (or the one the user picked after a failure). */
export function runText(
  system: string,
  user: string,
  opts?: Parameters<typeof chatText>[4],
  override?: ProviderId
): Promise<string> {
  return chatText(fetchFn, textTarget(override), system, user, opts)
}

/** A structured task on the active provider. */
export function runJson<T>(req: Parameters<typeof chatJson<T>>[2], override?: ProviderId) {
  return chatJson(fetchFn, textTarget(override), req)
}

/** A structured task that looks at images, on a model of the active provider that can read them. */
export async function runVisionJson<T>(req: Parameters<typeof chatJson<T>>[2], override?: ProviderId) {
  return chatJson(fetchFn, await visionTarget(override), req)
}
