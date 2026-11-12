/** Types shared by the main process and the renderer for settings and storage. */

/** Providers that can take over text work while Groq keeps voice. */
export const ALT_PROVIDERS = ['gemini', 'openai', 'openrouter'] as const
export type AltProvider = (typeof ALT_PROVIDERS)[number]

/** Every API key the app can hold. Stored encrypted, never sent to the renderer in full unless revealed. */
export const SECRET_NAMES = ['groq', ...ALT_PROVIDERS] as const
export type SecretName = (typeof SECRET_NAMES)[number]

export interface AiSettings {
  /** When true, analysis and writing use `altProvider`; Groq stays on voice. */
  useAltText: boolean
  altProvider: AltProvider
  /** Chosen model id for the alternative provider. Empty = provider default (picked in Phase 2). */
  altModel: string
}

export const DEFAULT_AI_SETTINGS: AiSettings = { useAltText: false, altProvider: 'gemini', altModel: '' }

export interface KeyStatus {
  set: boolean
  /** Masked form for display, e.g. "gsk_••••••••••••••••7Qx2". Empty when not set. */
  masked: string
}

export interface SettingsView {
  ai: AiSettings
  keys: Record<SecretName, KeyStatus>
  /** Absolute path of the documents folder (per-application folders live here). */
  dataFolder: string
  onboarded: boolean
  /** False when the OS offers no secure storage; keys can't be saved then. */
  secureStorage: boolean
}

export interface Referee {
  id: string
  name: string
  affiliation: string
  relationship: string
  /** Print the relationship line on the References page. Off by default. */
  includeRelationship: boolean
  email: string
  phone: string
  address: string
}

export type RefereeInput = Omit<Referee, 'id'> & { id?: string }

export const EMPTY_REFEREE: RefereeInput = {
  name: '',
  affiliation: '',
  relationship: '',
  includeRelationship: false,
  email: '',
  phone: '',
  address: ''
}

export interface DocLanguage {
  id: string
  name: string
  dir: 'ltr' | 'rtl'
  /** English and Arabic ship with the app and can't be removed. */
  builtin: boolean
}

export interface ImportedFile {
  id: string
  filename: string
}

/** Error codes thrown by the main process; the renderer translates them. */
export const ERROR_CODES = [
  'SECURE_STORAGE_UNAVAILABLE',
  'FOLDER_NOT_EMPTY',
  'FOLDER_INSIDE_CURRENT',
  'LANGUAGE_EXISTS',
  'LANGUAGE_NAME_EMPTY',
  'LANGUAGE_BUILTIN',
  'REFEREE_NAME_EMPTY',
  'NOT_FOUND'
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
