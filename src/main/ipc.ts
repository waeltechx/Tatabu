import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, systemPreferences } from 'electron'
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
import { forgetProvider, modelsFor, testAndRemember, transcribeAudio } from './ai/service'
import { getAiSettings } from './repo/settings'
import { listApplications, getApplication } from './repo/applications'
import { getProfile, saveProfile } from './repo/profile'
import { addToLibrary, libraryItems, libraryPath, removeLibrary, renameLibrary } from './library'
import { printReference, referenceState, saveReferenceState } from './documents'
import {
  dismissLetterWarnings,
  enclosureOptions,
  fixLetterItem,
  generateLetter,
  letterPrompt,
  letterState,
  prepareLetter,
  printLetter,
  saveLetter
} from './letters'
import { cvState, fixCvItem, keepCvItem, printCv, saveCvState, tailorCv } from './tailor'
import { dismissCvWarning, fixItem, masterSourceText, masterState, readCv, saveMasterCv, uploadCv } from './cv'
import {
  addPickedFiles,
  attachLibrary,
  changeFileType,
  checkDuplicates,
  combine,
  createApplication,
  editApplication,
  extractJob,
  filePath,
  folderPath,
  listFiles,
  rememberPicked,
  removeApplication,
  removeFile
} from './applications'

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

  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform
  }))

  handle('prefs:get', () => readPrefs())
  handle('prefs:set', (patch) => {
    const next = writePrefs(patch)
    applyTheme(next)
    return next
  })

  // --- settings & keys -------------------------------------------------------
  handle('settings:get', () => settingsView())
  handle('settings:setAi', (patch) => {
    const before = getAiSettings(getDb())
    const after = updateAiSettings(getDb(), sanitizeAiPatch(patch))
    // A different model may answer differently: the old test result no longer applies.
    if (before.altProvider === after.altProvider && before.altModel !== after.altModel) {
      forgetProvider(after.altProvider)
    }
    return settingsView()
  })
  handle('settings:completeOnboarding', () => {
    setSetting(getDb(), 'onboarded', true)
    return settingsView()
  })
  handle('secrets:set', (name, value) => {
    getSecrets().set(secretName(name), typeof value === 'string' ? value : null)
    forgetProvider(secretName(name))
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
    const { response } = win ? await dialog.showMessageBox(win, confirmOptions) : await dialog.showMessageBox(confirmOptions)
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
    return addLibraryFile(getDb(), {
      label: 'CV',
      kind: 'cv_source',
      filename: basename(relPath),
      relPath
    })
  })
  handle('library:latestCv', () => latestCvSource(getDb()))

  // --- AI and voice ----------------------------------------------------------
  handle('ai:test', async (provider) => {
    await testAndRemember(secretName(provider))
    return settingsView()
  })
  handle('ai:models', (provider) => modelsFor(secretName(provider)))

  handle('voice:access', async () => {
    if (process.platform !== 'darwin') return true
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  handle('voice:transcribe', (audio, mimeType) => {
    if (!(audio instanceof Uint8Array)) throw new Error('AUDIO_EMPTY')
    return transcribeAudio(audio, String(mimeType))
  })

  // --- applications ----------------------------------------------------------
  handle('apps:list', () => listApplications(getDb()))
  handle('apps:get', (id) => getApplication(getDb(), String(id)))
  handle('apps:extract', (text, link, provider) =>
    extractJob(String(text), String(link ?? ''), provider && isSecretName(provider) ? provider : undefined)
  )
  handle('apps:checkDuplicate', (query) => checkDuplicates(query ?? {}))
  handle('apps:create', (input, attachments) => createApplication(input, Array.isArray(attachments) ? attachments : []))
  handle('apps:update', (id, patch) => editApplication(String(id), patch ?? {}))
  handle('apps:delete', async (id, trashFolder) => {
    const folder = removeApplication(String(id))
    if (trashFolder && folder) await shell.trashItem(folder)
  })
  handle('apps:openFolder', async (id) => {
    const error = await shell.openPath(folderPath(String(id)))
    if (error) throw new Error(error)
  })
  handle('apps:setup', () => {
    const db = getDb()
    const referees = db.prepare('SELECT COUNT(*) AS n FROM referees').get() as { n: number }
    return {
      groq: getSecrets().status('groq').set,
      cv: latestCvSource(db) !== null,
      profile: !!getProfile(db).fullName.trim(),
      referees: Number(referees.n) > 0
    }
  })

  // --- files -----------------------------------------------------------------
  handle('files:pick', async () => {
    const t = mainText()
    const win = parentWindow()
    const options = {
      title: t.chooseFilesTitle,
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [
        { name: t.documentsFilter, extensions: ['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'odt'] },
        { name: t.allFilesFilter, extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : rememberPicked(result.filePaths)
  })
  handle('files:list', (applicationId) => listFiles(String(applicationId)))
  handle('files:add', (applicationId, tokens, type) =>
    addPickedFiles(String(applicationId), Array.isArray(tokens) ? tokens.map(String) : [], type)
  )
  handle('files:attachLibrary', (applicationId, ids) =>
    attachLibrary(String(applicationId), Array.isArray(ids) ? ids.map(String) : [])
  )
  handle('files:setType', (fileId, type) => changeFileType(String(fileId), type))
  handle('files:delete', async (fileId) => {
    const { files, path } = removeFile(String(fileId))
    if (path) await shell.trashItem(path)
    return files
  })
  handle('files:open', async (fileId) => {
    const error = await shell.openPath(filePath(String(fileId)))
    if (error) throw new Error(error)
  })
  handle('files:combine', (applicationId, fileIds, filename) =>
    combine(String(applicationId), Array.isArray(fileIds) ? fileIds.map(String) : [], String(filename ?? ''))
  )
  handle('library:list', () => libraryItems())
  handle('library:add', async (label) => {
    const t = mainText()
    const win = parentWindow()
    const options = {
      title: t.chooseFilesTitle,
      properties: ['openFile'] as Array<'openFile'>,
      filters: [
        { name: t.documentsFilter, extensions: ['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'odt'] },
        { name: t.allFilesFilter, extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const source = result.filePaths[0]
    if (result.canceled || !source) return libraryItems()
    return addToLibrary(source, String(label ?? ''))
  })
  handle('library:rename', (id, label) => renameLibrary(String(id), String(label ?? '')))
  handle('library:remove', async (id) => {
    const { items, path } = removeLibrary(String(id))
    if (path) await shell.trashItem(path)
    return items
  })
  handle('library:open', async (id) => {
    const error = await shell.openPath(libraryPath(String(id)))
    if (error) throw new Error(error)
  })

  // --- profile & documents ---------------------------------------------------
  handle('profile:get', () => getProfile(getDb()))
  handle('profile:save', (input) => saveProfile(getDb(), input ?? {}))
  handle('settings:setPaper', (paper) => {
    setSetting(getDb(), 'paper', paper === 'Letter' ? 'Letter' : 'A4')
    return settingsView()
  })
  handle('refs:get', (applicationId) => referenceState(String(applicationId)))
  handle('refs:save', (applicationId, state) => saveReferenceState(String(applicationId), state ?? {}))
  handle('refs:print', (applicationId, state) => printReference(String(applicationId), state ?? {}))

  // --- master CV ---------------------------------------------------------------
  handle('cv:get', () => masterState())
  handle('cv:upload', async () => {
    const t = mainText()
    const win = parentWindow()
    const options = {
      title: t.chooseCvTitle,
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: t.cvFilter, extensions: ['pdf', 'docx', 'txt', 'md'] }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const source = picked.filePaths[0]
    if (picked.canceled || !source) return null
    return uploadCv(source)
  })
  handle('cv:read', (provider) => readCv(provider && isSecretName(provider) ? provider : undefined))
  handle('cv:save', (cv) => saveMasterCv(cv ?? {}))
  handle('cv:dismiss', (id) => dismissCvWarning(String(id)))
  handle('cv:fix', (text, problems, provider) =>
    fixItem(
      {
        text: String(text ?? ''),
        problems: Array.isArray(problems) ? problems : [],
        sources: [masterSourceText()],
        language: masterState().cv?.language ?? 'en'
      },
      provider && isSecretName(provider) ? provider : undefined
    )
  )
  handle('ai:fix', (req, provider) => fixItem(req, provider && isSecretName(provider) ? provider : undefined))

  // --- cover letters -------------------------------------------------------------
  const pick = (p: unknown) => (p && isSecretName(p) ? p : undefined)
  handle('letter:get', (id, languageId) => letterState(String(id), String(languageId)))
  handle('letter:save', (id, state) => saveLetter(String(id), state ?? {}))
  handle('letter:options', (id) => enclosureOptions(String(id)))
  handle('letter:prepare', (id, state, provider) => prepareLetter(String(id), state ?? {}, pick(provider)))
  handle('letter:generate', (id, state, provider) => generateLetter(String(id), state ?? {}, pick(provider)))
  handle('letter:fix', (id, state, itemId, provider) => fixLetterItem(String(id), state ?? {}, String(itemId), pick(provider)))
  handle('letter:keep', (id, state, itemId) => dismissLetterWarnings(String(id), state ?? {}, String(itemId)))
  handle('letter:prompt', (id, state) => letterPrompt(String(id), state ?? {}))
  handle('letter:print', (id, state) => printLetter(String(id), state ?? {}))

  handle('cvs:get', (id, languageId) => cvState(String(id), String(languageId)))
  handle('cvs:save', (id, state) => saveCvState(String(id), state ?? {}))
  handle('cvs:tailor', (id, state, provider) => tailorCv(String(id), state ?? {}, pick(provider)))
  handle('cvs:fix', (id, state, itemId, provider) => fixCvItem(String(id), state ?? {}, String(itemId), pick(provider)))
  handle('cvs:keep', (id, state, itemId) => keepCvItem(String(id), state ?? {}, String(itemId)))
  handle('cvs:print', (id, state) => printCv(String(id), state ?? {}))
}
