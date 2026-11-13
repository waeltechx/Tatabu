/**
 * HTML document → PDF, printed by Chromium in a hidden window (real, selectable text,
 * bundled fonts, right-to-left handled by the browser engine).
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { DocHtml } from '@shared/docs/common'
import type { PaperSize } from '@shared/profile'

let queue: Promise<unknown> = Promise.resolve()

function printPageUrl(): { url?: string; file?: string } {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && dev) return { url: `${dev}/print.html` }
  return { file: join(__dirname, '../renderer/print.html') }
}

async function renderNow(doc: DocHtml, paper: PaperSize): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true }
  })
  // The page may only show what we hand it: no navigation, no new windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  try {
    const target = printPageUrl()
    if (target.url) await win.loadURL(target.url)
    else await win.loadFile(target.file as string)
    for (let i = 0; i < 50; i++) {
      if (await win.webContents.executeJavaScript('window.__ready === true')) break
      await new Promise((r) => setTimeout(r, 40))
    }
    await win.webContents.executeJavaScript(`window.__render(${JSON.stringify(doc)})`)
    return await win.webContents.printToPDF({
      pageSize: paper,
      printBackground: true,
      preferCSSPageSize: true,
      generateDocumentOutline: false
    })
  } finally {
    win.destroy()
  }
}

/** One document at a time, so several quick clicks never fight over windows. */
export function renderPdf(doc: DocHtml, paper: PaperSize = 'A4'): Promise<Buffer> {
  const run = queue.then(() => renderNow(doc, paper))
  queue = run.catch(() => undefined)
  return run
}
