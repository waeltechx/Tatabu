/**
 * Dev-only stand-in for the preload bridge, so the renderer can be opened in a
 * plain browser tab (http://localhost:5173) while designing screens.
 * Never included in production builds (guarded by import.meta.env.DEV).
 */
import type { IpcArgs, IpcChannel, IpcResult, TatabuApi, UiPrefs } from '@shared/ipc'

export function installBrowserMock(): void {
  let prefs: UiPrefs = { language: 'en', theme: 'system' }
  const handlers: { [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResult<C> } = {
    'app:info': () => ({ version: '0.0.0-browser', platform: 'browser' }),
    'prefs:get': () => prefs,
    'prefs:set': (patch) => (prefs = { ...prefs, ...patch })
  }
  const api: TatabuApi = {
    invoke: (channel, ...args) =>
      Promise.resolve((handlers[channel] as (...a: unknown[]) => never)(...args))
  }
  ;(window as unknown as { tatabu: TatabuApi }).tatabu = api
}
