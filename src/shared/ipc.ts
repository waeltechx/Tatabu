/**
 * The single IPC contract between the renderer and the main process.
 *
 * Every channel is declared here once: its argument tuple and its result.
 * The preload exposes exactly these as `window.tatabu.invoke(channel, ...args)`
 * and the main process registers a handler for each (see src/main/ipc.ts).
 */

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
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

export const IPC_CHANNELS = ['app:info', 'prefs:get', 'prefs:set'] as const satisfies readonly IpcChannel[]

export interface TatabuApi {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>
}
