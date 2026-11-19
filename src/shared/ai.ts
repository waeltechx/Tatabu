/** AI types and rules shared by the main process and the renderer. */
import type { AiSettings, KeyStatus, SecretName } from './settings'

/** Every AI provider has exactly one key, so the key names double as provider ids. */
export type ProviderId = SecretName

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  groq: 'Groq',
  gemini: 'Gemini',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  xai: 'Grok',
  custom: 'Custom'
}

/** A provider's display name; the custom one shows the name the user gave it. */
export function providerName(provider: ProviderId, ai?: Pick<AiSettings, 'customName'>): string {
  if (provider === 'custom' && ai?.customName.trim()) return ai.customName.trim()
  return PROVIDER_NAMES[provider]
}

/** Whether a provider is ready to take text work: a saved key, or for the custom one a base URL (keys are optional there). */
export function providerReady(view: KeyView, provider: ProviderId): boolean {
  if (provider === 'custom') return Boolean(view.ai.customBaseUrl)
  return view.keys[provider].set
}

export interface ModelInfo {
  id: string
  /** True/false when the provider says whether the model reads images; null when unknown. */
  vision: boolean | null
}

/** The last successful "Test" of a provider. Cleared when its key or model changes. */
export interface ProviderCheck {
  /** The text model that answered. */
  model: string
  testedAt: string
  /** A model of this provider that read the test image, or null if none did. */
  visionModel: string | null
}

type KeyView = { ai: AiSettings; keys: Record<SecretName, KeyStatus> }

/**
 * Where text work goes: the alternative provider when the user turned it on,
 * otherwise Groq. Never switches on its own when a key is missing — the
 * user chose where their text is sent.
 */
export function textProvider(view: KeyView): ProviderId {
  return view.ai.useAltText ? view.ai.altProvider : 'groq'
}

/** The provider offered as "Try with …" after a failure, if it has a key. */
export function otherTextProvider(view: KeyView): ProviderId | null {
  const other: ProviderId = view.ai.useAltText ? 'groq' : view.ai.altProvider
  return providerReady(view, other) ? other : null
}
