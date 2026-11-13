/**
 * Reading an uploaded CV: text out of PDF and Word, the AI's structured reply,
 * and the check of that reply against the file. All content is invented.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { chatJson, type ChatTarget } from '../src/main/ai/chat'
import type { FetchFn } from '../src/main/ai/http'
import { CV_SYSTEM, CvExtraction, cvUserPrompt, fixUserPrompt } from '../src/main/ai/tasks/cv'
import { fileText } from '../src/main/pdf/read'
import { checkAgainstFile } from '../src/main/cv'
import { cleanCv, setCvFact } from '@shared/cv'

const dir = mkdtempSync(join(tmpdir(), 'tatabu-cv-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const LINES = [
  'Omar Haddad',
  'Senior Data Analyst',
  'omar.haddad@example.com · +49 30 5550 0184',
  'Experience',
  'Senior Data Analyst, Brightwave Retail GmbH, Hamburg, 03/2021 – Present',
  '- Built 14 Tableau dashboards used by 300 store managers.',
  '- Cut weekly reporting time by 40% with Python and SQL.',
  'Education',
  'MSc Business Analytics, University of Leeds, 2016 – 2017',
  'Skills: SQL, Python, Tableau'
]

async function makePdf(): Promise<string> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  LINES.forEach((line, i) => page.drawText(line.replace('–', '-'), { x: 50, y: 790 - i * 22, size: 11, font }))
  const path = join(dir, 'cv.pdf')
  writeFileSync(path, await pdf.save())
  return path
}

async function makeDocx(): Promise<string> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  const paras = LINES.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`).join('')
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`
  )
  const path = join(dir, 'cv.docx')
  writeFileSync(path, await zip.generateAsync({ type: 'nodebuffer' }))
  return path
}

const groq: ChatTarget = { provider: 'groq', key: 'gsk_test', model: 'openai/gpt-oss-120b' }
const reply = (content: unknown): FetchFn =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] }), {
      status: 200
    })) as unknown as FetchFn

// What a model might return, with one planted invention ("Snowflake", "25").
const EXTRACTED = {
  name: 'Omar Haddad',
  headline: 'Senior Data Analyst',
  contact: { email: 'omar.haddad@example.com', phone: '+49 30 5550 0184', location: '', links: [] },
  summary: '',
  experience: [
    {
      title: 'Senior Data Analyst',
      organization: 'Brightwave Retail GmbH',
      location: 'Hamburg',
      start: '03/2021',
      end: 'Present',
      bullets: [
        'Built 14 Tableau dashboards used by 300 store managers.',
        'Cut weekly reporting time by 40% with Python and Snowflake.'
      ]
    }
  ],
  education: [
    {
      degree: 'MSc Business Analytics',
      institution: 'University of Leeds',
      location: '',
      start: '2016',
      end: '2017',
      details: []
    }
  ],
  skills: ['SQL', 'Python', 'Tableau', 'Kubernetes'],
  languages: [],
  certificates: [{ name: 'Tableau Desktop Specialist', detail: '', date: '2025' }],
  projects: [],
  other: [],
  language: 'en'
}

describe('reading a CV file', () => {
  it('gets the text out of a PDF and a Word file', async () => {
    const pdf = await fileText(await makePdf())
    expect(pdf).toContain('Brightwave Retail GmbH')
    expect(pdf).toContain('Built 14 Tableau dashboards')
    const docx = await fileText(await makeDocx())
    expect(docx).toContain('University of Leeds')
    expect(docx.split('\n').filter(Boolean)).toHaveLength(LINES.length)
    await expect(fileText(join(dir, 'cv.odt'))).rejects.toThrow()
  })

  it('turns the AI reply into a master CV and flags what the file does not say', async () => {
    const text = await fileText(await makePdf())
    const result = await chatJson(reply(EXTRACTED), groq, {
      system: CV_SYSTEM,
      user: cvUserPrompt(text),
      schema: CvExtraction,
      schemaName: 'cv_extraction'
    })
    const cv = cleanCv(result.data)
    expect(cv.experience[0]!.id).toBe('e1')
    const got = checkAgainstFile(cv, text).map((w) => `${w.itemId}:${w.token}`)
    expect(got).toContain('e1.b1:Snowflake')
    expect(got).toContain('skills.3:Kubernetes')
    expect(got).toContain('c1.name:Tableau Desktop Specialist')
    expect(got).not.toContain('e1.b0:14')
    expect(got.some((g) => g.startsWith('e1.title') || g.startsWith('ed1.'))).toBe(false)
  })

  it('lets "Fix it" replace exactly one fact', () => {
    const cv = cleanCv(EXTRACTED)
    const fixed = setCvFact(cv, 'e1.b1', 'Cut weekly reporting time by 40% with Python and SQL.')!
    expect(fixed.experience[0]!.bullets[1]).toBe('Cut weekly reporting time by 40% with Python and SQL.')
    expect(cv.experience[0]!.bullets[1]).toContain('Snowflake')
    expect(setCvFact(cv, 'skills.3', 'SQL')!.skills[3]).toBe('SQL')
    expect(setCvFact(cv, 'e1.dates', 'x')).toBeNull()
    expect(setCvFact(cv, 'e9.title', 'x')).toBeNull()
    expect(fixUserPrompt({ text: 'a', sources: ['b'], problems: ['Snowflake (name)'], language: 'en' })).toContain(
      '- Snowflake (name)'
    )
  })
})
