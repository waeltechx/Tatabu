/**
 * The single IPC contract between the renderer and the main process.
 *
 * Every channel is declared here once: its argument tuple and its result.
 * The preload exposes exactly these as `window.tatabu.invoke(channel, ...args)`
 * and the main process registers a handler for each (see src/main/ipc.ts).
 */
import type { FixRequest, MasterCv, MasterState } from './cv'
import type { EnclosureOption, LetterState } from './letter'
import type { CvTailorState } from './tailor'
import type { AiSettings, DocLanguage, ImportedFile, Referee, RefereeInput, SecretName, SettingsView } from './settings'
import type { ModelInfo, ProviderId } from './ai'
import type { PaperSize, Profile } from './profile'
import type { ReferenceState, SavedPdf } from './documents'
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
  /** Asks for a file and keeps a copy in _Library under the given name. */
  'library:add': { args: [label: string]; result: LibraryItem[] }
  'library:rename': { args: [id: string, label: string]; result: LibraryItem[] }
  /** Moves the file to the trash. */
  'library:remove': { args: [id: string]; result: LibraryItem[] }
  'library:open': { args: [id: string]; result: void }

  'profile:get': { args: []; result: Profile }
  'profile:save': { args: [Partial<Profile>]; result: Profile }
  'settings:setPaper': { args: [PaperSize]; result: SettingsView }

  /** The References page of an application (its own referees or the defaults). */
  'refs:get': { args: [applicationId: string]; result: ReferenceState }
  'refs:save': { args: [applicationId: string, state: ReferenceState]; result: ReferenceState }
  /** Prints the References PDF into the application folder. */
  'refs:print': { args: [applicationId: string, state: ReferenceState]; result: SavedPdf }

  // Master CV
  'cv:get': { args: []; result: MasterState }
  /** Picks a CV file and keeps it in the library, ready to read. Null when cancelled. */
  'cv:upload': { args: []; result: MasterState | null }
  /** Reads the newest uploaded CV with AI and replaces the master CV. */
  'cv:read': { args: [provider?: ProviderId]; result: MasterState }
  'cv:save': { args: [MasterCv]; result: MasterState }
  'cv:dismiss': { args: [warningId: string]; result: MasterState }
  /** "Fix it" on the master CV: the item is rewritten from the CV file's own text. */
  'cv:fix': { args: [text: string, problems: string[], provider?: ProviderId]; result: string }
  /** "Fix it" anywhere else: rewrite from the given sources. */
  'ai:fix': { args: [FixRequest, provider?: ProviderId]; result: string }

  // Cover letters (one per application and document language)
  'letter:get': { args: [applicationId: string, languageId: string]; result: LetterState }
  'letter:save': { args: [applicationId: string, state: LetterState]; result: LetterState }
  'letter:options': { args: [applicationId: string]; result: EnclosureOption[] }
  'letter:prepare': { args: [applicationId: string, state: LetterState, provider?: ProviderId]; result: LetterState }
  'letter:generate': { args: [applicationId: string, state: LetterState, provider?: ProviderId]; result: LetterState }
  'letter:fix': { args: [applicationId: string, state: LetterState, itemId: string, provider?: ProviderId]; result: LetterState }
  'letter:keep': { args: [applicationId: string, state: LetterState, itemId: string]; result: LetterState }
  'letter:prompt': { args: [applicationId: string, state: LetterState]; result: string }
  'letter:print': { args: [applicationId: string, state: LetterState]; result: SavedPdf }

  // CV Studio (one tailored CV per application and document language)
  'cvs:get': { args: [applicationId: string, languageId: string]; result: CvTailorState }
  /** Saves the user's choices (accepted changes, edits, kept warnings); returns fresh warnings. */
  'cvs:save': { args: [applicationId: string, state: CvTailorState]; result: CvTailorState }
  'cvs:tailor': { args: [applicationId: string, state: CvTailorState, provider?: ProviderId]; result: CvTailorState }
  'cvs:fix': { args: [applicationId: string, state: CvTailorState, itemId: string, provider?: ProviderId]; result: CvTailorState }
  'cvs:keep': { args: [applicationId: string, state: CvTailorState, itemId: string]; result: CvTailorState }
  'cvs:print': { args: [applicationId: string, state: CvTailorState]; result: SavedPdf }
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
  'library:list',
  'library:add',
  'library:rename',
  'library:remove',
  'library:open',
  'profile:get',
  'profile:save',
  'settings:setPaper',
  'refs:get',
  'refs:save',
  'refs:print',
  'cv:get',
  'cv:upload',
  'cv:read',
  'cv:save',
  'cv:dismiss',
  'cv:fix',
  'ai:fix',
  'letter:get',
  'letter:save',
  'letter:options',
  'letter:prepare',
  'letter:generate',
  'letter:fix',
  'letter:keep',
  'letter:prompt',
  'letter:print',
  'cvs:get',
  'cvs:save',
  'cvs:tailor',
  'cvs:fix',
  'cvs:keep',
  'cvs:print'
] as const satisfies readonly IpcChannel[]

// Compile-time check: every channel in the contract is in the allowlist above.
type MissingChannels = Exclude<IpcChannel, (typeof IPC_CHANNELS)[number]>
export const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true

export interface TatabuApi {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>
}
