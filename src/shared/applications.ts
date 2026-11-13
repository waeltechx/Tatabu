/** Applications, their files and duplicate matches: shared by main and renderer. */

export const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'] as const
export type Status = (typeof STATUSES)[number]

export const WORK_MODES = ['remote', 'hybrid', 'onsite', 'unknown'] as const
export type WorkMode = (typeof WORK_MODES)[number]

export const FILE_TYPES = ['cv', 'cover_letter', 'reference', 'other', 'combined'] as const
export type FileType = (typeof FILE_TYPES)[number]

/** What the AI reads out of a job posting (and what the user can edit). */
export interface JobFields {
  company: string
  jobTitle: string
  location: string
  workMode: WorkMode
  source: string
  /** ISO date YYYY-MM-DD, or ''. */
  deadline: string
  salary: string
  jobDescription: string
  requirements: string[]
  /** Language code of the posting (en, de, ar, …). */
  language: string
  contactPerson: string
  companyAddress: string
  notes: string
}

export const EMPTY_JOB: JobFields = {
  company: '',
  jobTitle: '',
  location: '',
  workMode: 'unknown',
  source: '',
  deadline: '',
  salary: '',
  jobDescription: '',
  requirements: [],
  language: 'en',
  contactPerson: '',
  companyAddress: '',
  notes: ''
}

export interface Application extends JobFields {
  id: string
  /** Running number in the order applications were added (shown as "001"). */
  number: number
  applicationLink: string
  status: Status
  /** ISO timestamp. */
  dateAdded: string
  updatedAt: string
  /** Folder name inside the documents folder. */
  folder: string
}

export interface ApplicationInput extends JobFields {
  applicationLink: string
  status: Status
  /** The pasted page, kept for duplicate checks. */
  rawText: string
}

export type ApplicationPatch = Partial<JobFields & { applicationLink: string; status: Status }>

export interface ExtractResult {
  fields: JobFields
  provider: string
  model: string
  seconds: number
}

/** Why two postings look like the same job. `value` fills the translated sentence. */
export type DuplicateReasonCode =
  | 'jobId'
  | 'link'
  | 'linkInText'
  | 'identical'
  | 'rawIdentical'
  | 'contained'
  | 'containedWeak'
  | 'refNumber'
  | 'identity'
  | 'identityCity'
  | 'identityDeadline'
  | 'companyTitle'
  | 'companyCity'
  | 'companySimilarRole'
  | 'titleOtherCompany'

export interface DuplicateReason {
  code: DuplicateReasonCode
  value?: string
}

export interface DuplicateMatch {
  id: string
  company: string
  jobTitle: string
  status: Status
  dateAdded: string
  confidence: 'same_job' | 'possible_duplicate'
  reasons: DuplicateReason[]
  similarity: number
}

export interface DuplicateQuery {
  link?: string
  text?: string
  company?: string
  jobTitle?: string
  location?: string
  deadline?: string
  excludeId?: string
}

export type FileKind = 'pdf' | 'image' | 'docx' | 'other'

export interface AppFile {
  id: string
  applicationId: string
  type: FileType
  filename: string
  kind: FileKind
  /** Bytes; 0 when the file is missing on disk. */
  size: number
  missing: boolean
  dateAdded: string
}

/** A file the user picked in the system dialog, not yet copied anywhere. */
export interface PickedFile {
  token: string
  filename: string
  size: number
  kind: FileKind
}

export interface PendingAttachment {
  token: string
  type: FileType
}

export interface LibraryItem {
  id: string
  label: string
  filename: string
  kind: FileKind
  size?: number
  missing?: boolean
}

export interface CombineResult {
  files: AppFile[]
  /** Files that couldn't go into the PDF (Word documents, for example). */
  skipped: string[]
}

export interface SetupStatus {
  groq: boolean
  cv: boolean
  profile: boolean
  referees: boolean
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])

export function fileKind(name: string): FileKind {
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  return 'other'
}
