/** The AI providers Tatabu can talk to. All speak the OpenAI-compatible API. */
import type { ModelInfo, ProviderId } from '@shared/ai'

export interface ProviderSpec {
  baseUrl: string
  /** Used when the user hasn't picked a model and the model list can't be read. */
  defaultModel: string
  /** Preferred text models, best first; the first one the provider lists is preselected. */
  preferred: RegExp[]
  headers?: Record<string, string>
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    preferred: [/^openai\/gpt-oss-120b$/, /^llama-3\.3-70b-versatile$/]
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    preferred: [/^gemini-\d+(\.\d+)?-flash$/, /^gemini-flash-latest$/, /^gemini-\d+(\.\d+)?-pro$/]
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    preferred: [/^gpt-\d+(\.\d+)?-mini$/, /^gpt-4o-mini$/]
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-oss-120b',
    preferred: [/^openai\/gpt-oss-120b$/, /^google\/gemini-\d+(\.\d+)?-flash$/],
    headers: {
      'HTTP-Referer': 'https://github.com/waeltechx/Tatabu',
      'X-Title': 'Tatabu'
    }
  }
}

/** Groq's speech-to-text model (the "voice" role). */
export const VOICE_MODEL = 'whisper-large-v3-turbo'

// Models that can't chat: speech, images, embeddings, safety filters…
const NOT_CHAT =
  /whisper|tts|transcribe|audio|realtime|embed|moderation|guard|dall-e|imagen|image-generation|gpt-image|veo|lyria|aqa|davinci|babbage|search-preview|computer-use|-live|orpheus|prompt-guard|safeguard/i

export function isChatModel(id: string): boolean {
  return !NOT_CHAT.test(id)
}

/** Name-based guess for providers whose model list doesn't say what a model reads. */
export function looksLikeVision(provider: ProviderId, id: string): boolean | null {
  if (provider === 'gemini') return /^gemini/i.test(id) ? true : null
  if (/vision|-vl\b|vl-|llama-4|scout|maverick|pixtral|gpt-4o|gpt-4\.1|gpt-5|gemma-3|qwen.*vl|omni/i.test(id)) return true
  if (/gpt-oss|gpt-3\.5|deepseek-r1|kimi|compound|allam|qwen3-32b/i.test(id)) return false
  return null
}

/** Reads a provider's `/models` reply into a sorted list of chat models. */
export function parseModelList(provider: ProviderId, body: unknown): ModelInfo[] {
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: ModelInfo[] = []
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as {
      id?: unknown
      active?: unknown
      architecture?: { input_modalities?: unknown }
    }
    if (typeof entry.id !== 'string' || entry.active === false) continue
    const id = entry.id.replace(/^models\//, '') // Gemini prefixes ids with "models/"
    if (!id || seen.has(id) || !isChatModel(id)) continue
    seen.add(id)
    const modalities = entry.architecture?.input_modalities // OpenRouter says it outright
    const vision = Array.isArray(modalities) ? modalities.includes('image') : looksLikeVision(provider, id)
    out.push({ id, vision })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** The model to preselect: the first preferred one the provider offers (newest version wins). */
export function pickDefaultModel(provider: ProviderId, models: ModelInfo[]): string {
  const spec = PROVIDERS[provider]
  for (const pattern of spec.preferred) {
    const matches = models.filter((m) => pattern.test(m.id)).map((m) => m.id)
    if (matches.length) return matches.sort(byVersionDesc)[0] as string
  }
  return models.some((m) => m.id === spec.defaultModel) || models.length === 0 ? spec.defaultModel : (models[0] as ModelInfo).id
}

/** Models worth probing for image input, most likely first. */
export function visionCandidates(provider: ProviderId, models: ModelInfo[], textModel: string): string[] {
  const known = models.filter((m) => m.vision === true)
  // Unknown models are worth a try only when none is known to read images.
  const pool = (known.length ? known : models.filter((m) => m.vision === null)).map((m) => m.id).sort(byVersionDesc)
  // The chosen text model goes first when it might read images itself.
  const textVision = models.find((m) => m.id === textModel)?.vision ?? looksLikeVision(provider, textModel)
  return textVision === false ? pool : [textModel, ...pool.filter((id) => id !== textModel)]
}

/** Sorts "gemini-3-flash" before "gemini-2.5-flash". */
function byVersionDesc(a: string, b: string): number {
  const version = (id: string): number[] => (id.match(/\d+(\.\d+)?/)?.[0] ?? '0').split('.').map(Number)
  const [a1 = 0, a2 = 0] = version(a)
  const [b1 = 0, b2 = 0] = version(b)
  return b1 - a1 || b2 - a2
}
