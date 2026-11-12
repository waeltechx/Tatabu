import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { basename } from 'node:path'
import type { IpcArgs, IpcChannel, IpcResult, UiPrefs } from '@shared/ipc'
import { ALT_PROVIDERS, type AiSettings } from '@shared/settings'
import { readPrefs, writePrefs } from './prefs'
import { dataFolder, getDb, getSecrets, setDataFolder, settingsView } from './services'
import { setSetting, updateAiSettings } from './repo/settings'
import { isSecretName } from './repo/secrets'
import { addLanguage, listLanguages, removeLanguage } from './repo/languages'
import { listReferees, moveReferee, removeReferee, saveReferee } from './repo/referees'
import { addLibraryFile, latestCvSource } from './repo/library'
import { copyIntoLibrary, ensureDataFolder, moveDataFolder, resolveTargetFolder } from './storage/dataFolder'
import { mainText } from './i18n'

type Handler<C extends IpcChannel> = (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>

function handle<C extends IpcChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as IpcArgs<C>)))
}

function applyTheme(prefs: UiPrefs): void {
  nativeTheme.themeSource = prefs.theme
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function sanitizeAiPatch(patch: Partial<AiSettings>): Partial<AiSettings> {
  const out: Partial<AiSettings> = {}
  if (typeof patch.useAltText === 'boolean') out.useAltText = patch.useAltText
  if (ALT_PROVIDERS.includes(patch.altProvider as never)) out.altProvider = patch.altProvider
  if (typeof patch.altModel === 'string') out.altModel = patch.altModel.trim().slice(0, 200)
  return out
}

function secretName(name: unknown) {
  if (!isSecretName(name)) throw new Error('NOT_FOUND')
  return name
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

  // --- settings & keys -------------------------------------------------------
  handle('settings:get', () => settingsView())
  handle('settings:setAi', (patch) => {
    updateAiSettings(getDb(), sanitizeAiPatch(patch))
    return settingsView()
  })
  handle('settings:completeOnboarding', () => {
    setSetting(getDb(), 'onboarded', true)
    return settingsView()
  })
  handle('secrets:set', (name, value) => {
    getSecrets().set(secretName(name), typeof value === 'string' ? value : null)
    return settingsView()
  })
  handle('secrets:reveal', (name) => getSecrets().get(secretName(name)) ?? '')

  // --- document languages ----------------------------------------------------
  handle('languages:list', () => listLanguages(getDb()))
  handle('languages:add', (name) => {
    addLanguage(getDb(), String(name).slice(0, 60))
    return listLanguages(getDb())
  })
  handle('languages:remove', (id) => {
    removeLanguage(getDb(), String(id))
    return listLanguages(getDb())
  })

  // --- default referees ------------------------------------------------------
  handle('referees:list', () => listReferees(getDb()))
  handle('referees:save', (input) => {
    saveReferee(getDb(), input)
    return listReferees(getDb())
  })
  handle('referees:remove', (id) => {
    removeReferee(getDb(), String(id))
    return listReferees(getDb())
  })
  handle('referees:move', (id, delta) => moveReferee(getDb(), String(id), delta === -1 ? -1 : 1))

  // --- documents folder ------------------------------------------------------
  handle('storage:open', async () => {
    const folder = dataFolder()
    ensureDataFolder(folder)
    const error = await shell.openPath(folder)
    if (error) throw new Error(error)
  })

  handle('storage:change', async () => {
    const t = mainText()
    const win = parentWindow()
    const options = {
      title: t.chooseFolderTitle,
      buttonLabel: t.chooseFolderButton,
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const chosen = picked.filePaths[0]
    if (picked.canceled || !chosen) return null

    const from = dataFolder()
    const to = resolveTargetFolder(chosen)
    if (to.toLocaleLowerCase() === from.toLocaleLowerCase()) return settingsView()

    const confirmOptions = {
      type: 'question' as const,
      buttons: [t.move, t.cancel],
      defaultId: 0,
      cancelId: 1,
      title: t.moveTitle,
      message: t.moveMessage,
      detail: `${from}\n→\n${to}`
    }
    const { response } = win
      ? await dialog.showMessageBox(win, confirmOptions)
      : await dialog.showMessageBox(confirmOptions)
    if (response !== 0) return null

    moveDataFolder(from, to)
    setDataFolder(to)
    return settingsView()
  })

  // --- library ---------------------------------------------------------------
  handle('library:importCv', async () => {
    const t = mainText()
    const win = parentWindow()
    const options = {
      title: t.chooseCvTitle,
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: t.cvFilter, extensions: ['pdf', 'docx', 'doc'] }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const source = picked.filePaths[0]
    if (picked.canceled || !source) return null
    const relPath = copyIntoLibrary(dataFolder(), source)
    return addLibraryFile(getDb(), { label: 'CV', kind: 'cv_source', filename: basename(relPath), relPath })
  })
  handle('library:latestCv', () => latestCvSource(getDb()))
}
