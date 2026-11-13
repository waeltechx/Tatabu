import { describe, expect, it } from 'vitest'
import { cleanCv, cvFacts } from '@shared/cv'
import { atsCvDoc } from '@shared/docs/cv'
import { applyChoices, checkableItems, cvLabels, describeSource, diffCv, localEnd, resolveCv } from '@shared/tailor'
import { verifyItems } from '@shared/verify'
import { buildTailored, tailorSystem, tailorUser, type TailorOutput } from '../src/main/ai/tasks/tailor'
import { EMPTY_JOB } from '@shared/applications'

// All names below are invented.
const MASTER = cleanCv({
  name: 'Omar Haddad',
  headline: 'Data Analyst',
  contact: { email: 'omar.haddad@example.com', phone: '+49 30 5550 0184', location: 'Berlin', links: [] },
  summary: 'Data analyst working with retail data.',
  experience: [
    {
      title: 'Senior Data Analyst',
      organization: 'Brightwave Retail GmbH',
      location: 'Hamburg',
      start: '03/2021',
      end: 'Present',
      bullets: [
        'Built 14 Tableau dashboards used by 300 store managers.',
        'Cut weekly reporting time by 40% with Python and SQL.',
        'Organised the summer team event.'
      ]
    },
    {
      title: 'Junior Analyst',
      organization: 'Kestrel Logistics',
      location: 'Bremen',
      start: '2018',
      end: '2021',
      bullets: ['Cleaned shipment data in Excel.']
    }
  ],
  education: [{ degree: 'M.Sc. Statistics', institution: 'University of Leipzig', start: '2016', end: '2018' }],
  skills: ['Excel', 'SQL', 'Python', 'Tableau', 'Photoshop'],
  languages: [{ name: 'English', level: 'C1' }],
  certificates: [{ name: 'Tableau Desktop Specialist', date: '2022' }],
  language: 'en'
})

const I = (text: string, sources: string[] = [], translations: Array<{ source: string; target: string }> = []) => ({
  text,
  sources,
  translations
})
const LABELS = {
  summary: '',
  experience: '',
  education: '',
  skills: '',
  languages: '',
  certificates: '',
  projects: '',
  present: ''
}

const OUT: TailorOutput = {
  headline: I('Senior Data Analyst', ['e1.title']),
  summary: I('Data analyst with Tableau dashboards used by 300 store managers.', ['summary', 'e1.b0']),
  experience: [
    {
      id: 'e1',
      title: I('Senior Data Analyst', ['e1.title']),
      bullets: [
        I('Cut weekly reporting time by 40% using Python and SQL.', ['e1.b1']),
        I('Built 14 Tableau dashboards for 300 store managers.', ['e1.b0']),
        I('Migrated the warehouse to Snowflake, saving 25%.', ['e1.b1'])
      ]
    },
    { id: 'e9', title: I('Head of Data', []), bullets: [I('Invented role.', [])] }
  ],
  education: [{ id: 'ed1', degree: I('M.Sc. Statistics', ['ed1.degree']), details: [] }],
  skills: [
    I('SQL', ['skills.1']),
    I('Tableau', ['skills.3']),
    I('Python', ['skills.2']),
    I('Excel', ['skills.0']),
    I('Snowflake', [])
  ],
  languages: [I('English – C1', ['languages.0'])],
  certificates: [],
  projects: [],
  other: [],
  missing: ['Snowflake', 'dbt'],
  labels: LABELS
}

describe('tailoring', () => {
  const { cv, missing } = buildTailored(OUT, MASTER)

  it('keeps only roles that exist in the master CV and gives items stable ids', () => {
    expect(cv.experience.map((r) => r.id)).toEqual(['e1'])
    expect(cv.experience[0]!.bullets.map((b) => b.id)).toEqual(['e1.x0', 'e1.x1', 'e1.x2'])
    expect(missing).toEqual(['Snowflake', 'dbt'])
  })

  it('lists what changed: reworded, reordered and left out', () => {
    const changes = diffCv(MASTER, cv, true)
    const ids = changes.map((c) => c.id)
    expect(ids).toContain('headline')
    expect(ids).toContain('summary')
    expect(ids).toContain('order:skills')
    expect(ids).toContain('word:e1.x0')
    expect(ids).toContain('out:e1.b2')
    expect(ids).toContain('out:e2')
    expect(ids).toContain('out:c1')
    expect(changes.find((c) => c.id === 'out:skills')?.old).toBe('Photoshop')
    // Translated CVs don't list rewording (it is just translation) and can't undo the summary.
    const translated = diffCv(MASTER, cv, false)
    expect(translated.some((c) => c.kind === 'reworded')).toBe(false)
    expect(translated.find((c) => c.id === 'summary')?.revertible).toBe(false)
  })

  it('flags the planted claims and nothing true', () => {
    const changes = diffCv(MASTER, cv, true)
    const shown = applyChoices(MASTER, cv, changes, [], {})
    const warnings = verifyItems(checkableItems(shown, {}), cvFacts(MASTER), { language: 'en' })
    const tokens = warnings.map((w) => `${w.itemId}:${w.token}`).sort()
    expect(tokens).toEqual(['e1.x2:25', 'e1.x2:Snowflake', 'sk4:Snowflake'])
  })

  it('undoes rejected changes and keeps the user’s edits out of the check', () => {
    const changes = diffCv(MASTER, cv, true)
    const shown = applyChoices(
      MASTER,
      cv,
      changes,
      ['word:e1.x0', 'out:e1.b2', 'out:e2', 'order:skills', 'out:skills', 'summary'],
      {
        'e1.x2': 'Wrote the team handbook.'
      }
    )
    expect(shown.summary.text).toBe(MASTER.summary)
    expect(shown.experience.map((r) => r.id)).toEqual(['e1', 'e2'])
    const bullets = shown.experience[0]!.bullets.map((b) => b.text)
    expect(bullets[0]).toBe('Cut weekly reporting time by 40% with Python and SQL.')
    expect(bullets).toContain('Organised the summer team event.')
    expect(bullets).toContain('Wrote the team handbook.')
    expect(shown.skills.map((s) => s.text)).toEqual(['Excel', 'SQL', 'Python', 'Tableau', 'Snowflake', 'Photoshop'])
    const checked = checkableItems(shown, { 'e1.x2': 'Wrote the team handbook.' }).map((i) => i.id)
    expect(checked).not.toContain('e1.x2')
    expect(checked.some((id) => id.startsWith('m:'))).toBe(false)
  })

  it('accepts a faithful Arabic CV that keeps tool names in Latin', () => {
    const ar = buildTailored(
      {
        ...OUT,
        headline: I('محلل بيانات أول', ['e1.title'], [{ source: 'Senior Data Analyst', target: 'محلل بيانات أول' }]),
        summary: I('محلل بيانات بنى 14 لوحة في Tableau يستخدمها 300 مدير متجر.', ['e1.b0']),
        experience: [
          {
            id: 'e1',
            title: I('محلل بيانات أول', ['e1.title'], [{ source: 'Senior Data Analyst', target: 'محلل بيانات أول' }]),
            bullets: [I('خفّض وقت التقارير الأسبوعية بنسبة ٤٠٪ باستخدام Python وSQL.', ['e1.b1'])]
          }
        ],
        skills: [I('SQL', ['skills.1']), I('Python', ['skills.2'])],
        languages: [I('الإنجليزية – C1', ['languages.0'], [{ source: 'English', target: 'الإنجليزية' }])]
      },
      MASTER
    ).cv
    const warnings = verifyItems(checkableItems(ar, {}), cvFacts(MASTER), { language: 'ar' })
    expect(warnings).toEqual([])
  })
})

describe('the page', () => {
  const { cv } = buildTailored(OUT, MASTER)

  it('resolves organisations and dates from the master CV, in the CV’s language', () => {
    const labels = cvLabels('ar')
    expect(localEnd('Present', labels)).toBe('حتى الآن')
    const { cv: page, keys } = resolveCv(MASTER, cv, labels, 'ar')
    expect(page.experience[0]!.organization).toBe('Brightwave Retail GmbH')
    expect(page.experience[0]!.end).toBe('حتى الآن')
    expect(keys['e1.x1']).toBe('e1.b1')
    expect(cvLabels('fr', { summary: 'Profil' }).summary).toBe('Profil')
    expect(cvLabels('de', { summary: 'X' }).summary).toBe('Profil')
  })

  it('prints an ATS page with real text in reading order, in both directions', () => {
    const { cv: page } = resolveCv(MASTER, cv, cvLabels('en'), 'en')
    const doc = atsCvDoc({ cv: page, labels: cvLabels('en'), lang: 'en', dir: 'ltr', marks: new Set(['summary']) })
    const text = doc.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const order = ['Omar Haddad', 'Summary', 'Experience', 'Senior Data Analyst', 'Brightwave', 'Education', 'Skills']
    let at = -1
    for (const word of order) {
      const i = text.indexOf(word, at + 1)
      expect(i, word).toBeGreaterThan(at)
      at = i
    }
    expect(doc.body).toContain('class="hl"')
    expect(doc.body).not.toMatch(/<table|<img|grid|float/)
    const rtl = atsCvDoc({ cv: page, labels: cvLabels('ar'), lang: 'ar', dir: 'rtl' })
    expect(rtl.dir).toBe('rtl')
    expect(rtl.body).toContain('الخبرة العملية')
    expect(rtl.body).not.toContain('class="hl"')
  })

  it('escapes text and names sources in words', () => {
    const page = { ...MASTER, summary: '<script>x</script>' }
    expect(atsCvDoc({ cv: page, labels: cvLabels('en'), lang: 'en', dir: 'ltr' }).body).not.toContain('<script>')
    expect(describeSource(MASTER, 'e1.b0')).toBe('Senior Data Analyst · Brightwave Retail GmbH')
    expect(describeSource(MASTER, 'skills.2')).toBe('skills')
  })
})

describe('tailor prompts', () => {
  it('grounds the CV in keyed facts and keeps the highlight as emphasis only', () => {
    const user = tailorUser({
      job: { ...EMPTY_JOB, jobTitle: 'Lead Analyst', company: 'Nordlicht', requirements: ['SQL', 'Snowflake'] },
      facts: '[e1.b0] Built 14 Tableau dashboards',
      cvLanguage: 'en',
      code: 'ar',
      name: 'العربية',
      highlight: 'Lead with dashboards'
    })
    expect(user).toContain('TARGET LANGUAGE: Arabic')
    expect(user).toContain('[e1.b0] Built 14 Tableau dashboards')
    expect(user).toContain('emphasis only, not a fact')
    expect(tailorSystem('fr', 'Français')).toContain('professional Français')
    expect(tailorSystem('en', 'English')).toContain('list it under `missing`')
  })
})
