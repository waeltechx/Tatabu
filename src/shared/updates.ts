/** In-app updates: what the renderer needs to show the banner and the Settings line. */

export const RELEASES_URL = 'https://github.com/waeltechx/Tatabu/releases'

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  status: UpdateStatus
  current: string
  /** The newer version, once one is found. */
  version: string
  /** Release page ("What's new"). */
  notesUrl: string
  /** macOS (unsigned): the .dmg to download by hand. Empty on Windows, which installs on restart. */
  downloadUrl: string
  percent: number
  checkedAt: string
}

function parts(v: string): { nums: number[]; pre: boolean } {
  const clean = String(v ?? '')
    .trim()
    .replace(/^v/i, '')
  const [core = '', pre] = clean.split('-', 2)
  const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
  while (nums.length < 3) nums.push(0)
  return { nums, pre: !!pre }
}

/** True when `candidate` is a newer version than `current` ("1.2.0" > "1.1.9"; "1.0.0" > "1.0.0-beta.1"). */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate)
  const b = parts(current)
  for (let i = 0; i < 3; i++) {
    if ((a.nums[i] ?? 0) !== (b.nums[i] ?? 0)) return (a.nums[i] ?? 0) > (b.nums[i] ?? 0)
  }
  return !a.pre && b.pre
}
