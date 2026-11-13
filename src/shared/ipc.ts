/**
 * The single IPC contract between the renderer and the main process.
 *
 * Every channel is declared here once: its argument tuple and its result.
 * The preload exposes exactly these as `window.tatabu.invoke(channel, ...args)`
 * and the main process registers a handler for each (see src/main/ipc.ts).
 */
import type { AiSettings, DocLanguage, ImportedFile, Referee, RefereeInput, SecretName, SettingsView } from './settings'
import type { ModelInfo, ProviderId } from './ai'
import type {
  AppFile,
  Application,
  ApplicationInput,
  ApplicationPatch,
  CombineResult,
  DuplicateMatch,
  DuplicateQuery,
  ExtractResult,
  FileType,
  LibraryItem,
  PendingAttachment,
  PickedFile,
  SetupStatus
} from './applications'

export type ThemePref = 'light' | 'dark' | 'system'
export type UiLanguage = 'en' | 'ar'

export interface AppInfo {
  version: string
  platform: 'win32' | 'darwin' | 'linux' | (string & {})
}

export interface UiPrefs {
  language: UiLanguage
  theme: ThemePref
}

export interface IpcContract {
  'app:info': { args: []; result: AppInfo }
  'prefs:get': { args: []; result: UiPrefs }
  'prefs:set': { args: [Partial<UiPrefs>]; result: UiPrefs }

  'settings:get': { args: []; result: SettingsView }
  'settings:setAi': { args: [Partial<AiSettings>]; result: SettingsView }
  'settings:completeOnboarding': { args: []; result: SettingsView }

  /** Saves (or with null/'' removes) an API key. */
  'secrets:set': { args: [SecretName, string | null]; result: SettingsView }
  /** Returns the full key so the user can see it ("Show"). */
  'secrets:reveal': { args: [SecretName]; result: string }

  'languages:list': { args: []; result: DocLanguage[] }
  'languages:add': { args: [string]; result: DocLanguage[] }
  'languages:remove': { args: [string]; result: DocLanguage[] }

  'referees:list': { args: []; result: Referee[] }
  'referees:save': { args: [RefereeInput]; result: Referee[] }
  'referees:remove': { args: [string]; result: Referee[] }
  'referees:move': { args: [string, -1 | 1]; result: Referee[] }

  'storage:open': { args: []; result: void }
  /** Asks for a new documents folder and moves everything there. Null if cancelled. */
  'storage:change': { args: []; result: SettingsView | null }

  /** Asks for a CV file (PDF/Word) and keeps a copy in _Library. Null if cancelled. */
  'library:importCv': { args: []; result: ImportedFile | null }
  'library:latestCv': { args: []; result: ImportedFile | null }

  /** Tests a provider's key and remembers the result (Settings chips). */
  'ai:test': { args: [ProviderId]; result: SettingsView }
  /** Chat models the provider offers, for the model dropdown. */
  'ai:models': { args: [ProviderId]; result: ModelInfo[] }

  /** Asks the OS for microphone access where it needs asking (macOS). */
  'voice:access': { args: []; result: boolean }
  /** Recorded audio → text, with Groq Whisper. */
  'voice:transcribe': { args: [Uint8Array, string]; result: string }

  'apps:list': { args: []; result: Application[] }
  'apps:get': { args: [string]; result: Application }
  /** Pasted page → fields, with the active provider (or the one picked after a failure). */
  'apps:extract': { args: [text: string, link: string, provider?: ProviderId]; result: ExtractResult }
  'apps:checkDuplicate': { args: [DuplicateQuery]; result: DuplicateMatch[] }
  'apps:create': { args: [ApplicationInput, PendingAttachment[]]; result: Application }
  'apps:update': { args: [string, ApplicationPatch]; result: Application }
  /** Deletes an application; with `true` its folder goes to the system trash too. */
  'apps:delete': { args: [string, boolean]; result: void }
  'apps:openFolder': { args: [string]; result: void }
  'apps:setup': { args: []; result: SetupStatus }

  /** Opens the system file dialog. The picked files are referred to by token afterwards. */
  'files:pick': { args: []; result: PickedFile[] }
  'files:list': { args: [string]; result: AppFile[] }
  'files:add': { args: [applicationId: string, tokens: string[], type?: FileType]; result: AppFile[] }
  'files:attachLibrary': { args: [applicationId: string, libraryIds: string[]]; result: AppFile[] }
  'files:setType': { args: [fileId: string, type: FileType]; result: AppFile[] }
  /** Moves the file to the system trash and forgets it. */
  'files:delete': { args: [string]; result: AppFile[] }
  'files:open': { args: [string]; result: void }
  'files:combine': { args: [applicationId: string, fileIds: string[], filename: string]; result: CombineResult }
  'library:list': { args: []; result: LibraryItem[] }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

export const IPC_CHANNELS = [
  'app:info',
  'prefs:get',
  'prefs:set',
  'settings:get',
  'settings:setAi',
  'settings:completeOnboarding',
  'secrets:set',
  'secrets:reveal',
  'languages:list',
  'languages:add',
  'languages:remove',
  'referees:list',
  'referees:save',
  'referees:remove',
  'referees:move',
  'storage:open',
  'storage:change',
  'library:importCv',
  'library:latestCv',
  'ai:test',
  'ai:models',
  'voice:access',
  'voice:transcribe',
  'apps:list',
  'apps:get',
  'apps:extract',
  'apps:checkDuplicate',
  'apps:create',
  'apps:update',
  'apps:delete',
  'apps:openFolder',
  'apps:setup',
  'files:pick',
  'files:list',
  'files:add',
  'files:attachLibrary',
  'files:setType',
  'files:delete',
  'files:open',
  'files:combine',
  'library:list'
] as const satisfies readonly IpcChannel[]

// Compile-time check: every channel in the contract is in the allowlist above.
type MissingChannels = Exclude<IpcChannel, (typeof IPC_CHANNELS)[number]>
export const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true

export interface TatabuApi {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>
}
