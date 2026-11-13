/** Applications and their file records in SQLite. Folders on disk are handled by the caller. */
import {
  STATUSES,
  WORK_MODES,
  type Application,
  type ApplicationInput,
  type ApplicationPatch,
  type FileType,
  type JobFields,
  type Status,
  type WorkMode
} from '@shared/applications'
import { newId, nowIso, type Db } from '../db/open'
import {
  computeContentHash,
  computeSignals,
  extractJobId,
  extractReferenceNumbers,
  normalizeUrl,
  type DuplicateRow
} from '../duplicates'

interface Row {
  id: string
  number: number
  company: string
  job_title: string
  location: string
  work_mode: string
  application_link: string
  source: string
  deadline: string
  salary: string
  job_description: string
  requirements: string
  language: string
  status: string
  date_added: string
  updated_at: string
  notes: string
  contact_person: string
  company_address: string
  folder: string
}

const SELECT = `
  SELECT a.*, (SELECT COUNT(*) FROM applications b
               WHERE b.date_added < a.date_added OR (b.date_added = a.date_added AND b.rowid <= a.rowid)) AS number
  FROM applications a`

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function toApplication(r: Row): Application {
  return {
    id: r.id,
    number: Number(r.number),
    company: r.company,
    jobTitle: r.job_title,
    location: r.location,
    workMode: WORK_MODES.includes(r.work_mode as WorkMode) ? (r.work_mode as WorkMode) : 'unknown',
    applicationLink: r.application_link,
    source: r.source,
    deadline: r.deadline,
    salary: r.salary,
    jobDescription: r.job_description,
    requirements: parseList(r.requirements),
    language: r.language,
    status: STATUSES.includes(r.status as Status) ? (r.status as Status) : 'saved',
    dateAdded: r.date_added,
    updatedAt: r.updated_at,
    notes: r.notes,
    contactPerson: r.contact_person,
    companyAddress: r.company_address,
    folder: r.folder
  }
}

const str = (v: unknown, max = 20_000): string => (typeof v === 'string' ? v.slice(0, max) : '')

/** Keeps only valid, trimmed values; never trusts the renderer's shapes. */
export function cleanJobFields(input: Partial<JobFields>): Partial<JobFields> {
  const out: Partial<JobFields> = {}
  const text = ['company', 'jobTitle', 'location', 'source', 'salary', 'contactPerson', 'companyAddress'] as const
  for (const k of text) if (input[k] !== undefined) out[k] = str(input[k], 500).trim()
  if (input.jobDescription !== undefined) out.jobDescription = str(input.jobDescription, 50_000)
  if (input.notes !== undefined) out.notes = str(input.notes, 50_000)
  if (input.workMode !== undefined) out.workMode = WORK_MODES.includes(input.workMode) ? input.workMode : 'unknown'
  if (input.deadline !== undefined) out.deadline = /^\d{4}-\d{2}-\d{2}$/.test(str(input.deadline)) ? str(input.deadline) : ''
  if (input.language !== undefined) out.language = str(input.language, 40).trim() || 'en'
  if (input.requirements !== undefined) {
    const list = (Array.isArray(input.requirements) ? input.requirements : []).map((r) => str(r, 200).trim()).filter(Boolean)
    out.requirements = [...new Set(list)].slice(0, 60)
  }
  return out
}

export function listApplications(db: Db): Application[] {
  return (db.prepare(`${SELECT} ORDER BY a.date_added DESC, a.rowid DESC`).all() as unknown as Row[]).map(toApplication)
}

export function getApplication(db: Db, id: string): Application {
  const row = db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as unknown as Row | undefined
  if (!row) throw new Error('NOT_FOUND')
  return toApplication(row)
}

/** Inserts a new application whose folder already exists. */
export function insertApplication(db: Db, input: ApplicationInput, folder: string): Application {
  const f = { ...cleanJobFields(input) } as JobFields
  const link = str(input.applicationLink, 2000).trim()
  const status: Status = STATUSES.includes(input.status) ? input.status : 'saved'
  const signals = computeSignals(link, f.jobDescription, str(input.rawText, 50_000))
  const id = newId('app')
  const now = nowIso()
  db.prepare(
    `INSERT INTO applications (id, company, job_title, location, work_mode, application_link, source, deadline,
       salary, job_description, requirements, language, status, date_added, updated_at, notes, contact_person,
       company_address, folder, normalized_url, job_id, content_hash, raw_text, text_fingerprint, ref_numbers)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    f.company ?? '',
    f.jobTitle ?? '',
    f.location ?? '',
    f.workMode ?? 'unknown',
    link,
    f.source ?? '',
    f.deadline ?? '',
    f.salary ?? '',
    f.jobDescription ?? '',
    JSON.stringify(f.requirements ?? []),
    f.language ?? 'en',
    status,
    now,
    now,
    f.notes ?? '',
    f.contactPerson ?? '',
    f.companyAddress ?? '',
    folder,
    signals.normalizedUrl,
    signals.jobId,
    signals.contentHash,
    signals.rawText,
    signals.textFingerprint,
    JSON.stringify(signals.refNumbers)
  )
  return getApplication(db, id)
}

const COLUMN: Record<keyof JobFields | 'applicationLink' | 'status', string> = {
  company: 'company',
  jobTitle: 'job_title',
  location: 'location',
  workMode: 'work_mode',
  source: 'source',
  deadline: 'deadline',
  salary: 'salary',
  jobDescription: 'job_description',
  requirements: 'requirements',
  language: 'language',
  contactPerson: 'contact_person',
  companyAddress: 'company_address',
  notes: 'notes',
  applicationLink: 'application_link',
  status: 'status'
}

/** Applies an inline edit. Returns the updated application. */
export function updateApplication(db: Db, id: string, patch: ApplicationPatch, folder?: string): Application {
  getApplication(db, id) // 404 first
  const clean: Record<string, string> = {}
  const fields = cleanJobFields(patch)
  for (const [k, v] of Object.entries(fields)) {
    clean[COLUMN[k as keyof JobFields]] = Array.isArray(v) ? JSON.stringify(v) : String(v)
  }
  if (patch.status !== undefined && STATUSES.includes(patch.status)) clean['status'] = patch.status
  if (patch.applicationLink !== undefined) {
    const link = str(patch.applicationLink, 2000).trim()
    clean['application_link'] = link
    clean['normalized_url'] = normalizeUrl(link)
    clean['job_id'] = extractJobId(link)
  }
  if (fields.jobDescription !== undefined) {
    clean['content_hash'] = computeContentHash(fields.jobDescription)
    const refs = extractReferenceNumbers(fields.jobDescription)
    if (refs.length) clean['ref_numbers'] = JSON.stringify(refs)
  }
  if (folder !== undefined) clean['folder'] = folder
  if (!Object.keys(clean).length) return getApplication(db, id)
  clean['updated_at'] = nowIso()

  const keys = Object.keys(clean)
  db.prepare(`UPDATE applications SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => clean[k] as string),
    id
  )
  return getApplication(db, id)
}

export function deleteApplication(db: Db, id: string): void {
  db.prepare('DELETE FROM applications WHERE id = ?').run(id)
}

/** Rows for the duplicate check, newest first. */
export function duplicateRows(db: Db): DuplicateRow[] {
  const rows = db
    .prepare(
      `SELECT id, company, job_title, location, deadline, status, date_added, application_link, job_description,
              normalized_url, job_id, content_hash, raw_text, ref_numbers
       FROM applications ORDER BY date_added DESC, rowid DESC`
    )
    .all() as unknown as Array<Record<string, string>>
  return rows.map((r) => ({
    id: r['id'] ?? '',
    company: r['company'] ?? '',
    jobTitle: r['job_title'] ?? '',
    location: r['location'] ?? '',
    deadline: r['deadline'] ?? '',
    status: (r['status'] ?? 'saved') as Status,
    dateAdded: r['date_added'] ?? '',
    applicationLink: r['application_link'] ?? '',
    jobDescription: r['job_description'] ?? '',
    normalizedUrl: r['normalized_url'] ?? '',
    jobId: r['job_id'] ?? '',
    contentHash: r['content_hash'] ?? '',
    rawText: r['raw_text'] ?? '',
    refNumbers: parseList(r['ref_numbers'] ?? '[]')
  }))
}

// --- files -------------------------------------------------------------------

export interface FileRow {
  id: string
  applicationId: string
  type: FileType
  relPath: string
  filename: string
  dateAdded: string
}

export function listFileRows(db: Db, applicationId: string): FileRow[] {
  return db
    .prepare(
      `SELECT id, application_id AS applicationId, type, rel_path AS relPath, filename, date_added AS dateAdded
       FROM files WHERE application_id = ? ORDER BY date_added, rowid`
    )
    .all(applicationId) as unknown as FileRow[]
}

export function getFileRow(db: Db, id: string): FileRow {
  const row = db
    .prepare(
      `SELECT id, application_id AS applicationId, type, rel_path AS relPath, filename, date_added AS dateAdded
       FROM files WHERE id = ?`
    )
    .get(id) as unknown as FileRow | undefined
  if (!row) throw new Error('NOT_FOUND')
  return row
}

export function insertFileRow(db: Db, f: Omit<FileRow, 'id' | 'dateAdded'>): FileRow {
  const id = newId('file')
  db.prepare('INSERT INTO files (id, application_id, type, rel_path, filename, date_added) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    f.applicationId,
    f.type,
    f.relPath,
    f.filename,
    nowIso()
  )
  return getFileRow(db, id)
}

export function setFileType(db: Db, id: string, type: FileType): void {
  db.prepare('UPDATE files SET type = ? WHERE id = ?').run(type, id)
}

export function deleteFileRow(db: Db, id: string): void {
  db.prepare('DELETE FROM files WHERE id = ?').run(id)
}

/** After the folder was renamed, file paths inside it move too. */
export function moveFilePaths(db: Db, applicationId: string, fromFolder: string, toFolder: string): void {
  if (fromFolder === toFolder) return
  for (const f of listFileRows(db, applicationId)) {
    if (f.relPath.startsWith(`${fromFolder}/`)) {
      db.prepare('UPDATE files SET rel_path = ? WHERE id = ?').run(`${toFolder}/${f.relPath.slice(fromFolder.length + 1)}`, f.id)
    }
  }
}
