/**
 * Folder names for applications: "Company – Job title".
 * Pure functions, shared by the main process (creates folders) and the renderer
 * (shows the preview in Settings).
 */

// Characters Windows or macOS refuse in file names, plus control characters.
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g
// Invisible direction marks would make two names look identical.
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export const MAX_FOLDER_NAME = 80
export const FALLBACK_FOLDER_NAME = 'Untitled'

function clean(part: string): string {
  return part.replace(BIDI_MARKS, '').replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text) // count code points, never split a surrogate pair
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

/** "Company – Job title", safe on Windows and macOS. Never empty. */
export function applicationFolderName(company: string, jobTitle: string, max = MAX_FOLDER_NAME): string {
  let name = [clean(company), clean(jobTitle)].filter(Boolean).join(' – ')
  name = truncate(name, max)
  // No leading dots (hidden on macOS) and no trailing dots/spaces (dropped by Windows).
  name = name.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (!name) return FALLBACK_FOLDER_NAME
  const stem = name.split('.')[0] ?? name
  if (WINDOWS_RESERVED.test(stem.trim())) name = `${name}_`
  return name
}

/**
 * Adds " (2)", " (3)" … until `isTaken` says the name is free.
 * `isTaken` should compare case-insensitively (Windows and macOS do).
 */
export function withCollisionSuffix(base: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`
    if (!isTaken(candidate)) return candidate
  }
}
