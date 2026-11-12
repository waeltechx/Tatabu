import { app, ipcMain, nativeTheme } from 'electron'
import type { IpcArgs, IpcChannel, IpcResult, UiPrefs } from '@shared/ipc'
import { readPrefs, writePrefs } from './prefs'

type Handler<C extends IpcChannel> = (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>

function handle<C extends IpcChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as IpcArgs<C>)))
}

function applyTheme(prefs: UiPrefs): void {
  nativeTheme.themeSource = prefs.theme
}

export function registerIpc(): void {
  applyTheme(readPrefs())

  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))

  handle('prefs:get', () => readPrefs())

  handle('prefs:set', (patch) => {
    const next = writePrefs(patch)
    applyTheme(next)
    return next
  })
}
