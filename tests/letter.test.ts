import { describe, expect, it } from 'vitest'
import { EMPTY_JOB } from '@shared/applications'
import { cleanCv, cvFacts, cvFactsPrompt } from '@shared/cv'
import { letterDoc, placeFrom } from '@shared/docs/letter'
import { defaultLayout, layoutFor, LTR_LAYOUTS, RTL_LAYOUTS, sanitizeLetter, wordCount } from '@shared/letter'
import { EMPTY_PROFILE } from '@shared/profile'
import { verifyItems } from '@shared/verify'
import {
  assembleLetter,
  externalPrompt,
  letterSystem,
  letterUser,
  prepareSystem,
  type LetterOutput
} from '../src/main/ai/tasks/letter'

// All names below are invented.
const PROFILE = {
  ...EMPTY_PROFILE,
  fullName: 'Omar Haddad',
  email: 'omar.haddad@example.com',
  phone: '+49 30 5550 0184',
  address: 'Weserstraße 21\n12047 Berlin'
}
const CV = cleanCv({
  name: 'Omar Haddad',
  experience: [
    {
      title: 'Senior Data Analyst',
      organization: 'Brightwave Retail GmbH',
      start: '03/2021',
      end: 'Present',
      bullets: [
        'Built 14 Tableau dashboards used by 300 store managers.',
        'Cut weekly reporting time by 40% with Python and SQL.'
      ]
    }
  ],
  skills: ['SQL', 'Python', 'Tableau'],
  language: 'en'
})
const JOB = {
  ...EMPTY_JOB,
  company: 'Nordlicht Analytics',
  jobTitle: 'Lead Analyst',
  contactPerson: 'Anna Weber',
  requirements: ['SQL', 'Snowflake'],
  jobDescription: 'We need a lead analyst with SQL and Snowflake.'
}
const sentence = (text: string, sources: string[] = [], translations: Array<{ source: string; target: string }> = []) => ({
  text,
  sources,
  translations
})

describe('letter text', () => {
  it('removes AI tells but keeps Arabic punctuation', () => {
    expect(sanitizeLetter('I led the team — and it worked… **really** “well”.')).toBe(
      'I led the team, and it worked... really "well".'
    )
    expect(sanitizeLetter('قدت الفريق — ونجح ذلك؛ «جيداً»', 'ar')).toBe('قدت الفريق، ونجح ذلك؛ «جيداً»')
    expect(sanitizeLetter('a\n\n\n\nb')).toBe('a\n\nb')
    expect(wordCount('Dear Ms Weber, I’m applying.')).toBe(5)
    expect(wordCount('تحية طيبة وبعد،')).toBe(3)
  })

  it('picks a layout per language and keeps a remembered one in its own direction', () => {
    expect(defaultLayout('de', 'ltr')).toBe('din5008')
    expect(defaultLayout('en', 'ltr')).toBe('classic')
    expect(defaultLayout('ar', 'rtl')).toBe('ar-formal')
    expect(layoutFor('en', 'ltr', 'block')).toBe('block')
    expect(layoutFor('ar', 'rtl', 'block')).toBe('ar-formal')
    expect(layoutFor('fr', 'ltr', 'nonsense')).toBe('classic')
  })

  it('assembles the letter and flags a planted claim, with text Show me can find', () => {
    const out: LetterOutput = {
      salutation: 'Dear Ms Weber,',
      paragraphs: [
        { sentences: [sentence('I would love to bring my analytics work to Nordlicht Analytics.')] },
        {
          sentences: [
            sentence('At Brightwave Retail GmbH I built 14 Tableau dashboards used by 300 store managers.', [
              'e1.organization',
              'e1.b0'
            ]),
            sentence('I also migrated our warehouse to Snowflake and cut costs by 25%.', ['e1.b1'])
          ]
        }
      ],
      closing: 'Sincerely,'
    }
    const { body, items } = assembleLetter(out, 'en', 'Omar Haddad', sanitizeLetter)
    expect(body.startsWith('Dear Ms Weber,\n\n')).toBe(true)
    expect(body.endsWith('Sincerely,\nOmar Haddad')).toBe(true)
    expect(items.map((i) => i.id)).toEqual(['sal', 'p1.s1', 'p2.s1', 'p2.s2'])
    const warnings = verifyItems(items, cvFacts(CV), { language: 'en', context: [JOB.company, JOB.jobTitle, JOB.contactPerson] })
    expect(warnings.map((w) => `${w.itemId}:${w.token}`).sort()).toEqual(['p2.s2:25', 'p2.s2:Snowflake'])
    for (const w of warnings) expect(body).toContain(w.text)
  })

  it('accepts a faithful Arabic letter that keeps tool names in Latin', () => {
    const out: LetterOutput = {
      salutation: 'السيدة آنا فيبر المحترمة،',
      paragraphs: [
        {
          sentences: [
            sentence('تحية طيبة وبعد،'),
            sentence(
              'عملت محلل بيانات أول في Brightwave Retail GmbH وبنيت ١٤ لوحة في Tableau.',
              ['e1.title', 'e1.organization', 'e1.b0'],
              [{ source: 'Senior Data Analyst', target: 'محلل بيانات أول' }]
            )
          ]
        }
      ],
      closing: 'وتفضلوا بقبول فائق الاحترام والتقدير،'
    }
    const { items } = assembleLetter(out, 'ar', 'عمر حداد', sanitizeLetter)
    expect(verifyItems(items, cvFacts(CV), { language: 'ar' })).toEqual([])
  })
})

describe('letter prompts', () => {
  const ctx = {
    profile: PROFILE,
    job: JOB,
    facts: cvFactsPrompt(CV),
    answers: [{ question: 'Earliest start date?', answer: 'January 2027' }],
    motivation: 'I like their open data work.'
  }

  it('grounds the letter in keyed facts and the user’s answers', () => {
    const user = letterUser(ctx)
    expect(user).toContain('[e1.b0] Built 14 Tableau dashboards')
    expect(user).toContain('[answer:1] Q: Earliest start date?')
    expect(user).toContain('[motivation] Why this company: I like their open data work.')
    expect(user).toContain('Contact person (address the salutation to this person if non-empty): Anna Weber')
    expect(letterSystem('ar', 'العربية')).toContain('تحية طيبة وبعد')
    expect(letterSystem('de', 'Deutsch')).toContain('Mit freundlichen Grüßen')
    expect(letterSystem('fr', 'Français')).toContain('natural, native-level Français')
    expect(prepareSystem('fr', 'Français')).toContain('Write EVERY option ENTIRELY in Français')
  })

  it('builds a copy-paste prompt for other AI tools', () => {
    const prompt = externalPrompt('en', 'English', ctx)
    expect(prompt).toContain('HOW TO WRITE')
    expect(prompt).toContain('QUALITY CHECKLIST')
    expect(prompt).toContain('Ignore the instructions about JSON')
  })
})

describe('letter page', () => {
  const base = {
    profile: PROFILE,
    recipient: 'Anna Weber\nNordlicht Analytics\nHafenstraße 3\n20457 Hamburg',
    subject: 'Application for Lead Analyst',
    body: 'Dear Ms Weber,\n\nI would love to join.\n\nSincerely,\nOmar Haddad',
    enclosures: ['CV', 'Diploma'],
    signature: true,
    date: '2026-11-13'
  }

  it('renders every left-to-right layout', () => {
    for (const layout of LTR_LAYOUTS) {
      const doc = letterDoc({ ...base, layout, lang: layout === 'din5008' ? 'de' : 'en', dir: 'ltr' })
      expect(doc.dir).toBe('ltr')
      expect(doc.body).toContain('Nordlicht Analytics')
      expect(doc.body).toContain('I would love to join.')
      expect(doc.body).toContain('class="name">Omar Haddad')
    }
    expect(letterDoc({ ...base, layout: 'din5008', lang: 'de', dir: 'ltr' }).body).toContain('13.11.2026')
    expect(letterDoc({ ...base, layout: 'din5008', lang: 'de', dir: 'ltr' }).body).toContain('<b>Anlagen</b>')
    expect(letterDoc({ ...base, layout: 'block', lang: 'en', dir: 'ltr' }).body).toContain('Re: Application for Lead Analyst')
    expect(letterDoc({ ...base, layout: 'classic', lang: 'en', dir: 'ltr' }).body).toContain(
      '<bdi>Berlin</bdi>, 13 November 2026'
    )
    expect(letterDoc({ ...base, layout: 'modern', lang: 'en', dir: 'ltr' }).body).toContain('class="band"')
  })

  it('renders every right-to-left layout with Arabic labels', () => {
    for (const layout of RTL_LAYOUTS) {
      const doc = letterDoc({ ...base, subject: 'طلب توظيف', body: 'تحية طيبة وبعد،\n\nنص.', layout, lang: 'ar', dir: 'rtl' })
      expect(doc.dir).toBe('rtl')
      expect(doc.body).toContain('الموضوع: طلب توظيف')
      expect(doc.body).toContain('المرفقات: CV، Diploma')
    }
    expect(letterDoc({ ...base, layout: 'ar-formal', lang: 'ar', dir: 'rtl' }).body).toContain('التاريخ:')
  })

  it('escapes the letter text and finds the town', () => {
    const doc = letterDoc({ ...base, body: 'Hi <script>alert(1)</script>', layout: 'classic', lang: 'en', dir: 'ltr' })
    expect(doc.body).not.toContain('<script>')
    expect(placeFrom('Weserstraße 21\n12047 Berlin')).toBe('Berlin')
    expect(placeFrom('1 High St\nLondon SW1A 1AA')).toBe('London')
    expect(placeFrom('')).toBe('')
  })
})
