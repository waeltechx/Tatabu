/**
 * Updates from GitHub Releases.
 *
 * Windows: electron-updater downloads in the background and installs on restart
 * (or when the app quits). macOS builds are unsigned, so they can't replace
 * themselves: the app only asks GitHub for the latest release and the banner
 * opens its .dmg. Checks are quiet; only a manual check reports errors.
 */
import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { isNewer, RELEASES_URL, type UpdateState } from '@shared/updates'

const LATEST_API = 'https://api.github.com/repos/waeltechx/Tatabu/releases/latest'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let state: UpdateState = {
  status: 'idle',
  current: app.getVersion(),
  version: '',
  notesUrl: '',
  downloadUrl: '',
  percent: 0,
  checkedAt: ''
}
let wired = false

const set = (patch: Partial<UpdateState>): UpdateState => (state = { ...state, ...patch })
const notesFor = (version: string): string => `${RELEASES_URL}/tag/v${version.replace(/^v/i, '')}`

/** Windows installs itself; macOS and unpackaged builds only point to the download. */
const selfInstalls = (): boolean => app.isPackaged && process.platform === 'win32'

function wireUpdater(): void {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: new Date().toISOString() }))
  autoUpdater.on('update-available', (info) =>
    set({
      status: 'downloading',
      version: info.version,
      notesUrl: notesFor(info.version),
      percent: 0,
      checkedAt: new Date().toISOString()
    })
  )
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'ready', version: info.version, notesUrl: notesFor(info.version), percent: 100 })
  )
  autoUpdater.on('error', () => {
    // Keep a finished download; otherwise report quietly.
    if (state.status !== 'ready') set({ status: 'error' })
  })
}

interface GithubRelease {
  tag_name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  assets?: Array<{ name?: string; browser_download_url?: string }>
}

async function checkGithub(): Promise<UpdateState> {
  set({ status: 'checking' })
  try {
    const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tatabu' } })
    if (res.status === 404) return set({ status: 'none', checkedAt: new Date().toISOString() }) // nothing published yet
    if (!res.ok) return set({ status: 'error' })
    const release = (await res.json()) as GithubRelease
    const version = String(release.tag_name ?? '').replace(/^v/i, '')
    if (!version || release.draft || release.prerelease || !isNewer(version, state.current)) {
      return set({ status: 'none', checkedAt: new Date().toISOString() })
    }
    const dmg = (release.assets ?? []).find((a) => /\.dmg$/i.test(a.name ?? ''))
    return set({
      status: 'available',
      version,
      notesUrl: release.html_url || notesFor(version),
      downloadUrl: dmg?.browser_download_url || release.html_url || notesFor(version),
      checkedAt: new Date().toISOString()
    })
  } catch {
    return set({ status: 'error' })
  }
}

export function updateState(): UpdateState {
  return state
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return state
  if (!selfInstalls()) return checkGithub()
  wireUpdater()
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    set({ status: 'error' })
  }
  return state
}

export async function installUpdate(): Promise<void> {
  if (selfInstalls()) {
    if (state.status === 'ready') autoUpdater.quitAndInstall()
    return
  }
  const url = state.downloadUrl || state.notesUrl || RELEASES_URL
  if (/^https:\/\/github\.com\//.test(url)) await shell.openExternal(url)
}

/** A quiet check shortly after launch, then every few hours. Skipped when running from source. */
export function startUpdateChecks(): void {
  if (!app.isPackaged) return
  setTimeout(() => void checkForUpdates(), 8_000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS).unref?.()
}
