import { describe, expect, it } from 'vitest'
import { extractFacts, nameTokens, normalizeText, verifyItems, type FactItem } from '@shared/verify'
import { cleanCv, cvFacts, cvFactsPrompt } from '@shared/cv'

// An invented CV.
const CV = cleanCv({
  name: 'Omar Haddad',
  summary: 'Data analyst with 6 years of experience in retail analytics.',
  experience: [
    {
      title: 'Senior Data Analyst',
      organization: 'Brightwave Retail GmbH',
      location: 'Hamburg',
      start: 'March 2021',
      end: 'Present',
      bullets: [
        'Built 14 Tableau dashboards used by 300 store managers.',
        'Cut weekly reporting time by 40% with Python and SQL.'
      ]
    },
    {
      title: 'Data Analyst',
      organization: 'Kestrel Logistics',
      start: '05/2018',
      end: '02/2021',
      bullets: ['Modelled delivery data in BigQuery.']
    }
  ],
  education: [{ degree: 'MSc Business Analytics', institution: 'University of Leeds', start: '2016', end: '2017' }],
  skills: ['SQL', 'Python', 'Tableau', 'Stakeholder management'],
  languages: [
    { name: 'Arabic', level: 'Native' },
    { name: 'English', level: 'C1' }
  ],
  language: 'en'
})
const FACTS = cvFacts(CV)
const item = (id: string, text: string, sources: string[], extra: Partial<FactItem> = {}): FactItem => ({
  id,
  text,
  sources,
  ...extra
})

describe('normalising', () => {
  it('turns Arabic-Indic digits and marks into plain text', () => {
    expect(normalizeText('٢٠٢١ و ۱۴')).toBe('2021 و 14')
    expect(normalizeText('مُحَلِّل ـبيانات')).toBe('محلل بيانات')
    expect(normalizeText('٣٫٥')).toBe('3.5')
  })

  it('reads dates in any common form', () => {
    for (const text of [
      'March 2021',
      'Mar 2021',
      '03/2021',
      '2021-03',
      '03.2021',
      'مارس ٢٠٢١',
      'آذار 2021',
      'März 2021',
      'mars 2021'
    ]) {
      const f = extractFacts(text)
      expect(f.months, text).toEqual(new Set([3]))
      expect(f.numbers, text).toEqual(new Set(['2021']))
    }
  })

  it('reads numbers with separators and number words', () => {
    expect(extractFacts('1,200 users and 3.50 €').numbers).toEqual(new Set(['1200', '3.5']))
    expect(extractFacts('1.200 Nutzer').numbers).toEqual(new Set(['1200']))
    expect(extractFacts('six years').numbers).toEqual(new Set(['6']))
    expect(extractFacts('خمس سنوات').numbers).toEqual(new Set(['5']))
    expect(extractFacts('2019-2021').numbers).toEqual(new Set(['2019', '2021']))
    expect(extractFacts('I may join').months.size).toBe(0)
  })

  it('finds names, tools and acronyms', () => {
    expect(nameTokens('I built dashboards in Tableau for Brightwave.', 'en')).toEqual(['Tableau', 'Brightwave'])
    expect(nameTokens('Python is my main tool, with SQL and C++.', 'en')).toEqual(['SQL', 'C++'])
    // German capitalises nouns: only acronyms count.
    expect(nameTokens('Ich habe Erfahrung mit Datenanalyse und SQL.', 'de')).toEqual(['SQL'])
    // Latin words inside Arabic text are names.
    expect(nameTokens('بنيت لوحات في Tableau باستخدام SQL', 'ar')).toEqual(['Tableau', 'SQL'])
  })
})

describe('fact checker', () => {
  it('passes items that only use their cited facts', () => {
    const items = [
      item('s1', 'Senior Data Analyst at Brightwave Retail GmbH since March 2021.', ['e1.title', 'e1.organization', 'e1.dates']),
      item('s2', 'I built 14 Tableau dashboards for 300 store managers.', ['e1.b0']),
      item('s3', 'Tableau', ['skills.2'], { exact: true }),
      item('s4', 'I am excited to apply.', [])
    ]
    expect(verifyItems(items, FACTS, { language: 'en' })).toEqual([])
  })

  it('flags planted numbers, dates, names and skills', () => {
    const items = [
      item('a', 'I built 20 Tableau dashboards.', ['e1.b0']),
      item('b', 'Senior Data Analyst since June 2021.', ['e1.title', 'e1.dates']),
      item('c', 'I cut reporting time by 40% with Python and Snowflake.', ['e1.b1']),
      item('d', 'Kubernetes', ['skills.0'], { exact: true }),
      item('e', 'I led a team of 12 at Google.', []),
      item('f', 'Built dashboards.', ['e9.b0'])
    ]
    const w = verifyItems(items, FACTS, { language: 'en' })
    const got = w.map((x) => `${x.itemId}:${x.reason}:${x.token}`)
    expect(got).toContain('a:number:20')
    expect(got).toContain('b:date:6')
    expect(got).toContain('c:name:Snowflake')
    expect(got).toContain('d:exact:Kubernetes')
    expect(got).toContain('e:no_source:12')
    expect(got).toContain('e:no_source:Google')
    expect(got).toContain('f:unknown_source:e9.b0')
    expect(got).not.toContain('c:name:Python')
  })

  it('checks a fact against its own source, not the whole CV', () => {
    // 300 is in the CV, but not in the bullet this sentence cites.
    const w = verifyItems([item('x', 'Modelled data for 300 managers in BigQuery.', ['e2.b0'])], FACTS, { language: 'en' })
    expect(w.map((x) => x.token)).toEqual(['300'])
  })

  it('lets the letter name the company and role from the posting', () => {
    const w = verifyItems([item('x', 'I would love to join Nordlicht Analytics as Lead Analyst.', [])], FACTS, {
      language: 'en',
      context: ['Nordlicht Analytics', 'Lead Analyst']
    })
    expect(w).toEqual([])
  })

  it('accepts a faithful English → Arabic translation', () => {
    const items = [
      item('ar1', 'محلل بيانات أول في Brightwave Retail GmbH منذ مارس ٢٠٢١.', ['e1.title', 'e1.organization', 'e1.dates'], {
        translations: [{ source: 'Senior Data Analyst', target: 'محلل بيانات أول' }]
      }),
      item('ar2', 'بنيت ١٤ لوحة في Tableau يستخدمها ٣٠٠ مدير متجر.', ['e1.b0']),
      item('ar3', 'جامعة ليدز', ['ed1.institution'], {
        exact: true,
        translations: [{ source: 'University of Leeds', target: 'جامعة ليدز' }]
      }),
      item('ar4', 'خبرة ست سنوات في تحليل بيانات التجزئة.', ['summary'])
    ]
    expect(verifyItems(items, FACTS, { language: 'ar' })).toEqual([])
  })

  it('flags fake facts hidden in an Arabic translation', () => {
    const items = [
      item('ar1', 'بنيت ٢٥ لوحة في Tableau.', ['e1.b0']),
      item('ar2', 'محلل بيانات منذ يونيو ٢٠٢١.', ['e1.title', 'e1.dates']),
      item('ar3', 'خبرة في Power BI و SQL.', ['e1.b1']),
      item('ar4', 'جامعة أكسفورد', ['ed1.institution'], {
        exact: true,
        translations: [{ source: 'University of Oxford', target: 'جامعة أكسفورد' }]
      }),
      item('ar5', 'خبرة عشر سنوات.', ['summary'])
    ]
    const got = verifyItems(items, FACTS, { language: 'ar' }).map((x) => `${x.itemId}:${x.reason}:${x.token}`)
    expect(got).toContain('ar1:number:25')
    expect(got).toContain('ar2:date:6')
    expect(got).toContain('ar3:name:Power')
    expect(got).not.toContain('ar3:name:SQL')
    expect(got).toContain('ar4:translation:University of Oxford')
    expect(got).toContain('ar5:number:10')
  })

  it('never warns twice for the same thing', () => {
    const w = verifyItems([item('x', 'Snowflake, Snowflake and Snowflake.', ['e1.b0'])], FACTS, { language: 'en' })
    expect(w).toHaveLength(1)
  })
})

describe('master CV', () => {
  it('gives every fact a stable key and cleans bad input', () => {
    expect(FACTS['e1.b1']).toBe('Cut weekly reporting time by 40% with Python and SQL.')
    expect(FACTS['e2.dates']).toBe('05/2018 – 02/2021')
    expect(FACTS['skills.3']).toBe('Stakeholder management')
    expect(cvFactsPrompt(CV)).toContain('[e1.b0] Built 14 Tableau dashboards')
    const messy = cleanCv({
      experience: [{}, { title: 'X', bullets: ['', 'a', 5] }],
      skills: ['SQL', 'SQL', ''],
      language: 'EN-gb'
    })
    expect(messy.experience).toHaveLength(1)
    expect(messy.experience[0]!.id).toBe('e1')
    expect(messy.experience[0]!.bullets).toEqual(['a'])
    expect(messy.skills).toEqual(['SQL'])
    expect(messy.language).toBe('en')
  })
})
