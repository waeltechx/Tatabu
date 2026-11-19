/** "Test" in Settings: list models, make a tiny call, and find a model that reads images. */
import type { ModelInfo, ProviderId } from '@shared/ai'
import { AiError, aiRequest, isAiError, type FetchFn } from './http'
import { chatText, type ChatTarget } from './chat'
import { PROVIDERS, parseModelList, visionCandidates } from './providers'

/** A 16×16 red square: the smallest image every vision model accepts. */
export const PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IydHEmIY1TCqYfhqAACaMxgQdGu1YAAAAABJRU5ErkJggg=='

const MAX_VISION_PROBES = 3

export async function listModels(
  fetchFn: FetchFn,
  provider: ProviderId,
  key: string,
  baseUrl?: string
): Promise<ModelInfo[]> {
  const spec = PROVIDERS[provider]
  const body = await aiRequest(fetchFn, { baseUrl: baseUrl || spec.baseUrl, key, headers: spec.headers }, 'models', {
    timeoutMs: 20_000
  })
  return parseModelList(provider, body)
}

/**
 * Model list for the custom provider, which may not offer `/models` at all:
 * a missing or odd endpoint gives an empty list instead of an error. A refused
 * key, a dead server or a timeout still throw, since chat would fail too.
 */
export async function listModelsLenient(fetchFn: FetchFn, provider: ProviderId, key: string, baseUrl?: string) {
  try {
    return await listModels(fetchFn, provider, key, baseUrl)
  } catch (err) {
    if (provider === 'custom' && (isAiError(err, 'AI_MODEL_MISSING') || isAiError(err, 'AI_BAD_REQUEST'))) return []
    throw err
  }
}

/** True if the model accepted the probe image. Other failures (auth, rate limit…) are thrown. */
export async function readsImages(fetchFn: FetchFn, target: ChatTarget): Promise<boolean> {
  try {
    await chatText(fetchFn, target, 'You describe images in one word.', 'What colour is this square?', {
      images: [PROBE_IMAGE],
      maxTokens: 300,
      timeoutMs: 30_000
    })
    return true
  } catch (err) {
    // An empty answer still means the image was accepted (reasoning models can run out of tokens).
    if (isAiError(err, 'AI_INVALID_OUTPUT')) return true
    // A text-only model refuses the image part with 400 (or 404/422 on some routers).
    if (isAiError(err, 'AI_BAD_REQUEST') || isAiError(err, 'AI_MODEL_MISSING')) return false
    throw err
  }
}

/** The first candidate model that reads the probe image, or null. */
export async function findVisionModel(
  fetchFn: FetchFn,
  provider: ProviderId,
  key: string,
  textModel: string,
  models: ModelInfo[],
  baseUrl?: string
): Promise<string | null> {
  for (const model of visionCandidates(provider, models, textModel).slice(0, MAX_VISION_PROBES)) {
    if (await readsImages(fetchFn, { provider, key, model, baseUrl })) return model
  }
  return null
}

export interface TestOutcome {
  model: string
  visionModel: string | null
  models: ModelInfo[]
}

/**
 * Tests a key: reads the model list (proves the key works), asks the text model
 * for one word, then looks for a model that reads images. `chooseModel` picks
 * the text model once the list is known (the user's choice, or a default).
 */
export async function testProvider(
  fetchFn: FetchFn,
  provider: ProviderId,
  key: string,
  chooseModel: (models: ModelInfo[]) => string,
  baseUrl?: string
): Promise<TestOutcome> {
  const models = await listModelsLenient(fetchFn, provider, key, baseUrl)
  const model = chooseModel(models)
  // A custom endpoint that lists no models needs the user to name one.
  if (!model) throw new AiError('AI_MODEL_MISSING', 'no model chosen')
  try {
    await chatText(fetchFn, { provider, key, model, baseUrl }, 'You are a connection test.', 'Reply with the single word OK.', {
      maxTokens: 300,
      timeoutMs: 30_000
    })
  } catch (err) {
    // The model answered, just with nothing visible: the connection works.
    if (!isAiError(err, 'AI_INVALID_OUTPUT')) throw err
  }
  const visionModel = await findVisionModel(fetchFn, provider, key, model, models, baseUrl)
  return { model, visionModel, models }
}
