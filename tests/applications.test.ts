import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { EMPTY_JOB, type ApplicationInput } from '@shared/applications'
import { openDatabase } from '../src/main/db/open'
import {
  deleteApplication,
  duplicateRows,
  getApplication,
  insertApplication,
  insertFileRow,
  listApplications,
  listFileRows,
  moveFilePaths,
  updateApplication
} from '../src/main/repo/applications'
import { findDuplicates } from '../src/main/duplicates'
import { combineFiles } from '../src/main/pdf/combine'
import { jobUserPrompt, MAX_JOB_TEXT_CHARS, toJobFields, type JobExtraction } from '../src/main/ai/tasks/job'

// All names below are invented.
const POSTING =
  'Senior Data Analyst\nNordlicht Analytics GmbH · Hamburg\nReference: NA-2026-0412\n' +
  'We are looking for a Senior Data Analyst to join our analytics team in Hamburg. You will build dashboards, ' +
  'model data in SQL and work with product teams. Requirements: 5 years SQL, Python, Tableau.'

function input(over: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    ...EMPTY_JOB,
    company: 'Nordlicht Analytics GmbH',
    jobTitle: 'Senior Data Analyst',
    location: 'Hamburg',
    applicationLink: 'https://jobs.example.com/view/48213',
    status: 'saved',
    rawText: POSTING,
    jobDescription: POSTING,
    ...over
  }
}

const temps: string[] = []
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true })
})

describe('applications repository', () => {
  it('saves, numbers, edits and deletes applications', () => {
    const db = openDatabase(':memory:')
    const a = insertApplication(db, input(), 'Nordlicht – Senior Data Analyst')
    const b = insertApplication(
      db,
      input({ company: 'Fjordline AS', jobTitle: 'BI Developer', rawText: '' }),
      'Fjordline – BI Developer'
    )
    expect(a.number).toBe(1)
    expect(b.number).toBe(2)
    expect(listApplications(db).map((x) => x.id)).toEqual([b.id, a.id])

    const edited = updateApplication(db, a.id, {
      status: 'interview',
      notes: 'Call on Monday',
      requirements: ['SQL', 'SQL', ' Python ']
    })
    expect(edited.status).toBe('interview')
    expect(edited.notes).toBe('Call on Monday')
    expect(edited.requirements).toEqual(['SQL', 'Python'])

    deleteApplication(db, b.id)
    expect(listApplications(db)).toHaveLength(1)
    expect(() => getApplication(db, b.id)).toThrow('NOT_FOUND')
  })

  it('ignores an unknown status or work mode', () => {
    const db = openDatabase(':memory:')
    const a = insertApplication(db, input({ status: 'nonsense' as never, workMode: 'moon' as never }), 'x')
    expect(a.status).toBe('saved')
    expect(a.workMode).toBe('unknown')
  })

  it('finds a re-pasted posting as the same job', () => {
    const db = openDatabase(':memory:')
    const a = insertApplication(db, input(), 'f')
    const [match] = findDuplicates({ text: POSTING }, duplicateRows(db))
    expect(match?.id).toBe(a.id)
    expect(match?.confidence).toBe('same_job')
    // The same link alone is enough too.
    expect(findDuplicates({ link: 'https://jobs.example.com/view/48213?utm_source=x' }, duplicateRows(db))[0]?.id).toBe(a.id)
    // And an application is never its own duplicate while being edited.
    expect(findDuplicates({ text: POSTING, excludeId: a.id }, duplicateRows(db))).toEqual([])
  })

  it('moves file paths when the folder is renamed', () => {
    const db = openDatabase(':memory:')
    const a = insertApplication(db, input(), 'Old Name')
    insertFileRow(db, { applicationId: a.id, type: 'cv', relPath: 'Old Name/cv.pdf', filename: 'cv.pdf' })
    insertFileRow(db, { applicationId: a.id, type: 'other', relPath: '_Library/x.pdf', filename: 'x.pdf' })
    moveFilePaths(db, a.id, 'Old Name', 'New Name')
    expect(listFileRows(db, a.id).map((f) => f.relPath)).toEqual(['New Name/cv.pdf', '_Library/x.pdf'])
  })
})

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
)

describe('combine into one PDF', () => {
  it('appends PDF pages and puts each image on its own page, skipping the rest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tatabu-pdf-'))
    temps.push(dir)
    const two = await PDFDocument.create()
    two.addPage()
    two.addPage()
    writeFileSync(join(dir, 'letter.pdf'), await two.save())
    writeFileSync(join(dir, 'photo.png'), PNG)
    writeFileSync(join(dir, 'notes.docx'), 'not really a docx')

    const { pdf, skipped } = await combineFiles([
      { path: join(dir, 'letter.pdf'), filename: 'letter.pdf' },
      { path: join(dir, 'photo.png'), filename: 'photo.png' },
      { path: join(dir, 'notes.docx'), filename: 'notes.docx' }
    ])
    const out = await PDFDocument.load(pdf)
    expect(out.getPageCount()).toBe(3)
    expect(out.getPage(2).getSize().width).toBeCloseTo(595.28, 1) // A4
    expect(skipped).toEqual(['notes.docx'])
  })

  it('refuses when nothing can be combined', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tatabu-pdf-'))
    temps.push(dir)
    writeFileSync(join(dir, 'a.docx'), 'x')
    await expect(combineFiles([{ path: join(dir, 'a.docx'), filename: 'a.docx' }])).rejects.toThrow('NOTHING_TO_COMBINE')
  })
})

describe('job extraction clean-up', () => {
  const base: JobExtraction = {
    company: ' Nordlicht Analytics GmbH ',
    job_title: 'Datenanalyst (m/w/d)',
    location: 'Hamburg',
    work_mode: 'hybrid',
    source: '',
    deadline: '30.11.2026',
    salary: '',
    job_description: 'Text',
    requirements: ['SQL', ' SQL', '', 'Python'],
    language: 'de-DE',
    contact_person: '',
    company_address: '',
    notes: ''
  }

  it('trims, dedupes requirements and keeps only ISO deadlines', () => {
    const f = toJobFields(base)
    expect(f.company).toBe('Nordlicht Analytics GmbH')
    expect(f.requirements).toEqual(['SQL', 'Python'])
    expect(f.deadline).toBe('')
    expect(toJobFields({ ...base, deadline: '2026-11-30' }).deadline).toBe('2026-11-30')
  })

  it('reduces the language to a plain code, any language allowed', () => {
    expect(toJobFields(base).language).toBe('de')
    expect(toJobFields({ ...base, language: 'AR' }).language).toBe('ar')
    expect(toJobFields({ ...base, language: 'nl_BE' }).language).toBe('nl')
    expect(toJobFields({ ...base, language: 'German' }).language).toBe('en')
  })

  it('cuts very long pages before sending them', () => {
    const prompt = jobUserPrompt('x'.repeat(MAX_JOB_TEXT_CHARS + 500), '')
    expect(prompt).toContain('(none provided)')
    expect(prompt.length).toBeLessThan(MAX_JOB_TEXT_CHARS + 200)
  })
})
