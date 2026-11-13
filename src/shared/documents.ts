/** Types for generated documents (references, cover letters, CVs) shared by both processes. */
import type { Referee } from './settings'
import type { AppFile } from './applications'

export type DocKind = 'cv' | 'cover_letter' | 'reference'

/** The References page for one application. */
export interface ReferenceState {
  title: string
  /** Document language id (from the languages list). */
  language: string
  /** True when this application has its own referee list instead of the defaults. */
  custom: boolean
  referees: Referee[]
}

export interface SavedPdf {
  files: AppFile[]
  /** The file that was written. */
  fileId: string
  filename: string
}
