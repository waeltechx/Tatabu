import { describe, expect, it } from 'vitest'
import { EMPTY_JOB } from '@shared/applications'
import { EMPTY_PROFILE } from '@shared/profile'
import { EMPTY_REFEREE, type Referee } from '@shared/settings'
import { docLabels, esc, formatDocDate, languageCode, lines, pageCss, safeImage } from '@shared/docs/common'
import { referenceDoc, referenceDocFor } from '@shared/docs/reference'
import { openDatabase } from '../src/main/db/open'
import { getProfile, saveProfile } from '../src/main/repo/profile'
import { getDocument, getLetterLayout, saveDocument, setLetterLayout, deleteDocuments } from '../src/main/repo/documents'
import { insertApplication } from '../src/main/repo/applications'

// All names below are invented.
const PROFILE = {
  ...EMPTY_PROFILE,
  fullName: 'Omar Haddad',
  email: 'omar.haddad@example.com',
  phone: '+49 30 5550 0184',
  address: 'Weserstraße 21\n12047 Berlin'
}
const referee = (over: Partial<Referee> = {}): Referee => ({
  ...EMPTY_REFEREE,
  id: 'r1',
  name: 'Dr Lina Mansour',
  affiliation: 'Studio North',
  relationship: 'Team lead',
  email: 'lina.mansour@example.com',
  ...over
})
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('document building blocks', () => {
  it('escapes HTML and keeps only real image data URLs', () => {
    expect(esc('<b>"Tom" & \'Jo\'</b>')).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;')
    expect(esc(null)).toBe('')
    expect(safeImage(PNG)).toBe(PNG)
    expect(safeImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe('')
    expect(safeImage('javascript:alert(1)')).toBe('')
    expect(lines(' a \r\n\n b ')).toEqual(['a', 'b'])
  })

  it('maps language names to codes', () => {
    expect(languageCode({ id: 'en', name: 'English' })).toBe('en')
    expect(languageCode({ id: 'lang_x1', name: 'Deutsch' })).toBe('de')
    expect(languageCode({ id: 'lang_x2', name: 'العربية' })).toBe('ar')
    expect(languageCode({ id: 'lang_x3', name: 'Klingon' })).toBe('en')
  })

  it('gives labels in the document language with safe overrides', () => {
    expect(docLabels('ar').references).toBe('المراجع')
    expect(docLabels('xx').references).toBe('References')
    expect(docLabels('fr', { references: ' Références ' }).references).toBe('Références')
    expect(docLabels('en').forRole('Analyst', 'Nordlicht')).toBe('For the Analyst position at Nordlicht')
    expect(docLabels('en').forRole('', '')).toBe('')
  })

  it('formats dates with Latin digits', () => {
    const d = new Date(2026, 10, 3)
    expect(formatDocDate(d, 'de')).toBe('03.11.2026')
    expect(formatDocDate(d, 'en')).toBe('3 November 2026')
    expect(formatDocDate(d, 'ar')).toMatch(/^3 .+ 2026$/)
    expect(formatDocDate(d, 'ar')).not.toMatch(/[٠-٩]/)
  })

  it('sets the paper size on the page', () => {
    expect(pageCss('Letter')).toContain('size: Letter')
    expect(pageCss()).toContain('size: A4')
  })
})

describe('references document', () => {
  it('puts the job title in the subject line and escapes user text', () => {
    const doc = referenceDocFor({
      job: { jobTitle: 'Data <Analyst>', company: 'Nordlicht' },
      title: '',
      referees: [referee()],
      profile: PROFILE,
      language: { id: 'en', name: 'English', dir: 'ltr' }
    })
    expect(doc.title).toBe('References')
    expect(doc.body).toContain('For the Data &lt;Analyst&gt; position at Nordlicht')
    expect(doc.body).not.toContain('<Analyst>')
    expect(doc.body).toContain('Weserstraße 21 · 12047 Berlin')
    expect(doc.lang).toBe('en')
  })

  it('builds an Arabic, right-to-left page', () => {
    const doc = referenceDocFor({
      job: { jobTitle: 'محلل بيانات', company: 'نوردليشت' },
      title: 'المراجع المهنية',
      referees: [referee()],
      profile: PROFILE,
      language: { id: 'ar', name: 'العربية', dir: 'rtl' },
      paper: 'Letter'
    })
    expect(doc.dir).toBe('rtl')
    expect(doc.lang).toBe('ar')
    expect(doc.body).toContain('لوظيفة محلل بيانات لدى نوردليشت')
    expect(doc.css).toContain('size: Letter')
  })

  it('prints the relationship only when asked and skips empty referees', () => {
    const base = { profile: PROFILE, title: 'References', subject: '', lang: 'en', dir: 'ltr' as const }
    const hidden = referenceDoc({ ...base, referees: [referee(), { ...EMPTY_REFEREE, id: 'empty' }] })
    expect(hidden.body).not.toContain('Team lead')
    expect(hidden.body.match(/class="ref"/g)).toHaveLength(1)
    const shown = referenceDoc({ ...base, referees: [referee({ includeRelationship: true })] })
    expect(shown.body).toContain('Relationship: Team lead')
  })
})

describe('profile and documents repositories', () => {
  it('saves the profile and refuses unsafe signatures', () => {
    const db = openDatabase(':memory:')
    expect(getProfile(db).fullName).toBe('')
    saveProfile(db, { fullName: '  Omar Haddad ', links: ['https://example.com/omar', '', 'x'.repeat(400)], signature: PNG })
    const p = getProfile(db)
    expect(p.fullName).toBe('Omar Haddad')
    expect(p.links).toHaveLength(2)
    expect(p.links[1]).toHaveLength(300)
    expect(p.signature).toBe(PNG)
    saveProfile(db, { signature: 'data:text/html;base64,PGI+' })
    expect(getProfile(db).signature).toBe('')
    expect(getProfile(db).fullName).toBe('Omar Haddad')
  })

  it('keeps one document per application, kind and language', () => {
    const db = openDatabase(':memory:')
    const app = insertApplication(
      db,
      { ...EMPTY_JOB, company: 'Nordlicht', jobTitle: 'Analyst', status: 'saved', applicationLink: '', rawText: '' },
      'Nordlicht – Analyst'
    )
    saveDocument(db, { applicationId: app.id, kind: 'reference', language: 'en', data: { v: 1 } })
    saveDocument(db, { applicationId: app.id, kind: 'reference', language: 'en', data: { v: 2 } })
    saveDocument(db, { applicationId: app.id, kind: 'reference', language: 'ar', data: { v: 3 } })
    expect(getDocument<{ v: number }>(db, app.id, 'reference', 'en')?.data.v).toBe(2)
    expect(getDocument<{ v: number }>(db, app.id, 'reference', 'ar')?.data.v).toBe(3)
    deleteDocuments(db, app.id, 'reference')
    expect(getDocument(db, app.id, 'reference')).toBeNull()

    expect(getLetterLayout(db, 'ar')).toBeNull()
    setLetterLayout(db, 'ar', 'rtl-formal')
    setLetterLayout(db, 'ar', 'rtl-modern')
    expect(getLetterLayout(db, 'ar')).toBe('rtl-modern')
  })
})
