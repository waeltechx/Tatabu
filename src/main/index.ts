import { app, BrowserWindow, dialog, nativeTheme, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { closeServices, initServices } from './services'
import { mainText } from './i18n'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    title: 'Tatabu',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15161a' : '#f7f5ef',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) return
    event.preventDefault()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** The only permission the app ever grants: the microphone, for dictation. */
function allowMicrophoneOnly(): void {
  const isAudio = (types: readonly string[] | undefined): boolean => !!types?.length && types.every((t) => t === 'audio')
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(permission === 'media' && isAudio((details as { mediaTypes?: string[] }).mediaTypes))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    return permission === 'media' && (details as { mediaType?: string }).mediaType !== 'video'
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.waeltechx.tatabu')
    try {
      initServices()
    } catch (err) {
      const t = mainText()
      const message = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox(
        t.startupErrorTitle,
        message.startsWith('DATABASE_TOO_NEW') ? t.databaseTooNew : `${t.databaseError}\n\n${message}`
      )
      app.quit()
      return
    }
    allowMicrophoneOnly()
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => closeServices())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
