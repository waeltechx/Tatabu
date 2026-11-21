/**
 * Dev-only: a filled-in master CV, tailored CVs and cover letters for `?demo`, so
 * every screen can be seen (and screenshotted for the README) with invented data.
 * The tailored CVs are written by hand here; the app itself gets them from the AI.
 */
import type { MasterCv } from '@shared/cv'
import type { Translation } from '@shared/verify'
import { diffCv, EMPTY_TAILOR, type CvTailorState, type TailoredCv, type TItem } from '@shared/tailor'
import { EMPTY_LETTER, layoutFor, type LetterState } from '@shared/letter'

export const DEMO_MASTER: MasterCv = {
  name: 'Omar Haddad',
  headline: 'Frontend Developer',
  contact: {
    email: 'omar.haddad@example.com',
    phone: '+49 30 5550 0184',
    location: 'Berlin, Germany',
    links: ['github.com/omar-haddad']
  },
  summary:
    'Frontend developer with seven years of experience building web apps in React and TypeScript for e-commerce and fintech teams in Berlin and Amman.',
  experience: [
    {
      id: 'e1',
      title: 'Senior Frontend Developer',
      organization: 'Kiezware GmbH',
      location: 'Berlin',
      start: '03/2022',
      end: 'Present',
      bullets: [
        'Led the move of a checkout used by 400,000 customers a month from jQuery to React and TypeScript.',
        'Built a shared component library with Storybook, used by four product teams.',
        'Raised the Lighthouse accessibility score of the store from 68 to 97.',
        'Mentored three junior developers and ran weekly code reviews.'
      ]
    },
    {
      id: 'e2',
      title: 'Frontend Developer',
      organization: 'Souq Digital',
      location: 'Amman',
      start: '06/2019',
      end: '02/2022',
      bullets: [
        'Built the customer dashboard of a payments app in React, Redux and GraphQL.',
        'Added right-to-left support across the product for Arabic-speaking markets.',
        'Wrote end-to-end tests in Playwright that cut release bugs by a third.'
      ]
    },
    {
      id: 'e3',
      title: 'Junior Web Developer',
      organization: 'Pixelhaus Agency',
      location: 'Amman',
      start: '09/2017',
      end: '05/2019',
      bullets: ['Built marketing websites and landing pages for twenty clients.', 'Turned Figma designs into responsive HTML and CSS.']
    }
  ],
  education: [
    {
      id: 'd1',
      degree: 'B.Sc. Computer Science',
      institution: 'University of Jordan',
      location: 'Amman',
      start: '2013',
      end: '2017',
      details: ['Graduation project: an accessible e-learning platform in React.']
    }
  ],
  skills: [
    'JavaScript',
    'React',
    'TypeScript',
    'Next.js',
    'Redux',
    'GraphQL',
    'Node.js',
    'Accessibility (WCAG 2.2)',
    'Playwright',
    'Jest',
    'Storybook',
    'Design systems',
    'Tailwind CSS',
    'Figma'
  ],
  languages: [
    { name: 'Arabic', level: 'Native' },
    { name: 'English', level: 'Fluent (C1)' },
    { name: 'German', level: 'Good (B2)' }
  ],
  certificates: [{ id: 'c1', name: 'Professional Scrum Master I', detail: 'Scrum.org', date: '2023' }],
  projects: [
    { id: 'p1', name: 'rtl-datepicker', detail: 'Open-source React date picker with right-to-left support, 1,200 stars on GitHub.', date: '' }
  ],
  other: [],
  language: 'en'
}

type Src = [text: string, sources: string[], translations?: Translation[]]

/** The same id scheme the app gives AI output (see buildTailored in the main process). */
function tailored(input: {
  headline: Src
  summary: Src
  experience: Array<{ id: string; title: Src; bullets: Src[] }>
  education: Array<{ id: string; degree: Src; details: Src[] }>
  skills: Src[]
  languages: Src[]
  certificates: Array<{ id: string; name: Src; detail: Src }>
  projects: Array<{ id: string; name: Src; detail: Src }>
}): TailoredCv {
  const it = (id: string, [text, sources, translations = []]: Src): TItem => ({ id, text, sources, translations })
  return {
    headline: it('h', input.headline),
    summary: it('s', input.summary),
    experience: input.experience.map((r) => ({
      id: r.id,
      title: it(`${r.id}.t`, r.title),
      bullets: r.bullets.map((b, i) => it(`${r.id}.x${i}`, b))
    })),
    education: input.education.map((e) => ({
      id: e.id,
      degree: it(`${e.id}.g`, e.degree),
      details: e.details.map((d, i) => it(`${e.id}.y${i}`, d))
    })),
    skills: input.skills.map((s, i) => it(`sk${i}`, s)),
    languages: input.languages.map((l, i) => it(`lg${i}`, l)),
    certificates: input.certificates.map((c) => ({ id: c.id, name: it(`${c.id}.n`, c.name), detail: it(`${c.id}.dt`, c.detail) })),
    projects: input.projects.map((c) => ({ id: c.id, name: it(`${c.id}.n`, c.name), detail: it(`${c.id}.dt`, c.detail) })),
    other: []
  }
}

const m = (key: string): Src => {
  const facts: Record<string, string> = {}
  for (const e of DEMO_MASTER.experience) e.bullets.forEach((b, i) => (facts[`${e.id}.b${i}`] = b))
  return [facts[key] ?? '', [key]]
}

/** Nordlicht GmbH, Frontend Engineer: accessibility and design systems first. */
const FRONTEND = tailored({
  headline: ['Frontend Engineer · React, TypeScript & Accessibility', ['headline', 'skills.1', 'skills.2', 'skills.7']],
  summary: [
    'Frontend engineer with seven years in React and TypeScript. I build accessible, well-tested interfaces and the component libraries that let several teams ship them, most recently for a Berlin checkout used by 400,000 customers a month.',
    ['summary', 'e1.b0', 'e1.b1', 'e1.b2']
  ],
  experience: [
    {
      id: 'e1',
      title: ['Senior Frontend Developer', ['e1.title']],
      bullets: [
        ['Raised the store’s Lighthouse accessibility score from 68 to 97 by fixing focus, labels and contrast.', ['e1.b2']],
        ['Built a Storybook component library now used by four product teams.', ['e1.b1']],
        m('e1.b0'),
        m('e1.b3')
      ]
    },
    {
      id: 'e2',
      title: ['Frontend Developer', ['e2.title']],
      bullets: [m('e2.b2'), m('e2.b0'), m('e2.b1')]
    },
    { id: 'e3', title: ['Junior Web Developer', ['e3.title']], bullets: [m('e3.b1')] }
  ],
  education: [{ id: 'd1', degree: ['B.Sc. Computer Science', ['d1.degree']], details: [] }],
  skills: [
    ['React', ['skills.1']],
    ['TypeScript', ['skills.2']],
    ['Accessibility (WCAG 2.2)', ['skills.7']],
    ['Design systems', ['skills.11']],
    ['Storybook', ['skills.10']],
    ['Playwright', ['skills.8']],
    ['Jest', ['skills.9']],
    ['Next.js', ['skills.3']],
    ['GraphQL', ['skills.5']],
    ['Tailwind CSS', ['skills.12']]
  ],
  languages: [
    ['Arabic – Native', ['languages.0']],
    ['English – Fluent (C1)', ['languages.1']],
    ['German – Good (B2)', ['languages.2']]
  ],
  certificates: [{ id: 'c1', name: ['Professional Scrum Master I', ['c1.name']], detail: ['Scrum.org', ['c1.detail']] }],
  projects: [
    {
      id: 'p1',
      name: ['rtl-datepicker', ['p1.name']],
      detail: ['Open-source React date picker with right-to-left support, 1,200 stars on GitHub.', ['p1.detail']]
    }
  ]
})

/** Lumen Labs, Product Engineer: shipping, ownership and full-stack range first. */
const PRODUCT = tailored({
  headline: ['Product Engineer · React, Node.js & GraphQL', ['headline', 'skills.1', 'skills.6', 'skills.5']],
  summary: [
    'Product-minded engineer with seven years of shipping customer-facing features end to end, from GraphQL APIs to the React interface. Led a checkout rewrite for 400,000 monthly customers and a payments dashboard used across the Middle East.',
    ['summary', 'e1.b0', 'e2.b0', 'e2.b1']
  ],
  experience: [
    {
      id: 'e1',
      title: ['Senior Frontend Developer', ['e1.title']],
      bullets: [
        ['Owned the rewrite of a checkout used by 400,000 customers a month, from jQuery to React and TypeScript.', ['e1.b0']],
        m('e1.b1'),
        m('e1.b3')
      ]
    },
    {
      id: 'e2',
      title: ['Frontend Developer', ['e2.title']],
      bullets: [
        ['Shipped the customer dashboard of a payments app with React, Redux and GraphQL.', ['e2.b0']],
        m('e2.b1'),
        m('e2.b2')
      ]
    }
  ],
  education: [{ id: 'd1', degree: ['B.Sc. Computer Science', ['d1.degree']], details: [] }],
  skills: [
    ['React', ['skills.1']],
    ['TypeScript', ['skills.2']],
    ['Node.js', ['skills.6']],
    ['GraphQL', ['skills.5']],
    ['Next.js', ['skills.3']],
    ['Playwright', ['skills.8']],
    ['Figma', ['skills.13']]
  ],
  languages: [
    ['Arabic – Native', ['languages.0']],
    ['English – Fluent (C1)', ['languages.1']],
    ['German – Good (B2)', ['languages.2']]
  ],
  certificates: [],
  projects: [
    {
      id: 'p1',
      name: ['rtl-datepicker', ['p1.name']],
      detail: ['Open-source React date picker with right-to-left support, 1,200 stars on GitHub.', ['p1.detail']]
    }
  ]
})

/** شركة المدار، مطوّر واجهات: the CV translated to Arabic and tailored. */
const ARABIC = tailored({
  headline: ['مطوّر واجهات أمامية · React و TypeScript', ['headline', 'skills.1', 'skills.2']],
  summary: [
    'مطوّر واجهات بخبرة سبع سنوات في React و TypeScript لفرق التجارة الإلكترونية والتقنية المالية. بنيت دعم الكتابة من اليمين لليسار لتطبيق مدفوعات في أسواق عربية، وقدت إعادة بناء صفحة دفع يستخدمها 400 ألف عميل شهرياً.',
    ['summary', 'e2.b1', 'e1.b0']
  ],
  experience: [
    {
      id: 'e1',
      title: ['مطوّر واجهات أول', ['e1.title']],
      bullets: [
        ['قدت نقل صفحة دفع يستخدمها 400 ألف عميل شهرياً من jQuery إلى React و TypeScript.', ['e1.b0']],
        ['بنيت مكتبة مكوّنات مشتركة بـ Storybook تستخدمها أربعة فرق.', ['e1.b1']],
        ['رفعت نتيجة إمكانية الوصول في Lighthouse من 68 إلى 97.', ['e1.b2']]
      ]
    },
    {
      id: 'e2',
      title: ['مطوّر واجهات', ['e2.title']],
      bullets: [
        ['أضفت دعم الكتابة من اليمين لليسار للمنتج كاملاً للأسواق العربية.', ['e2.b1']],
        ['بنيت لوحة العملاء لتطبيق مدفوعات بـ React و Redux و GraphQL.', ['e2.b0']],
        ['كتبت اختبارات شاملة بـ Playwright خفّضت أخطاء الإصدارات بمقدار الثلث.', ['e2.b2']]
      ]
    },
    { id: 'e3', title: ['مطوّر ويب مبتدئ', ['e3.title']], bullets: [['حوّلت تصاميم Figma إلى صفحات HTML و CSS متجاوبة.', ['e3.b1']]] }
  ],
  education: [{ id: 'd1', degree: ['بكالوريوس علوم الحاسوب', ['d1.degree']], details: [] }],
  skills: [
    ['React', ['skills.1']],
    ['TypeScript', ['skills.2']],
    ['دعم RTL', ['e2.b1']],
    ['إمكانية الوصول (WCAG 2.2)', ['skills.7']],
    ['Next.js', ['skills.3']],
    ['GraphQL', ['skills.5']],
    ['Playwright', ['skills.8']],
    ['Tailwind CSS', ['skills.12']]
  ],
  languages: [
    ['العربية – اللغة الأم', ['languages.0']],
    ['الإنجليزية – ممتاز (C1)', ['languages.1']],
    ['الألمانية – جيد (B2)', ['languages.2']]
  ],
  certificates: [{ id: 'c1', name: ['Professional Scrum Master I', ['c1.name']], detail: ['Scrum.org', ['c1.detail']] }],
  projects: [
    {
      id: 'p1',
      name: ['rtl-datepicker', ['p1.name']],
      detail: ['منتقي تواريخ مفتوح المصدر لـ React يدعم الكتابة من اليمين لليسار، 1,200 نجمة على GitHub.', ['p1.detail']]
    }
  ]
})

/** Which demo application gets which tailored CV, by document language. */
const TAILORED: Record<string, TailoredCv> = {
  'app_demo0:en': FRONTEND,
  'app_demo1:en': PRODUCT,
  'app_demo5:ar': ARABIC
}

export function demoTailor(applicationId: string, language: string): CvTailorState | null {
  const cv = TAILORED[`${applicationId}:${language}`]
  if (!cv) return null
  const same = language === DEMO_MASTER.language
  return {
    ...EMPTY_TAILOR,
    language,
    tailored: cv,
    changes: diffCv(DEMO_MASTER, cv, same),
    missing: applicationId === 'app_demo0' ? ['Vue.js'] : [],
    sourceLanguage: DEMO_MASTER.language,
    generatedAt: new Date().toISOString()
  }
}

const LETTERS: Record<string, Partial<LetterState>> = {
  'app_demo0:en': {
    subject: 'Application for the Frontend Engineer position',
    subjects: [
      'Application for the Frontend Engineer position',
      'Frontend Engineer – accessible React interfaces',
      'Your opening for a Frontend Engineer'
    ],
    motivation: 'Nordlicht builds tools for public services, and I want my accessibility work to reach everyone.',
    recipient: 'Anna Weber\nNordlicht GmbH\nSeidlstraße 3\n80335 Munich',
    body: [
      'Dear Ms Weber,',
      'Nordlicht’s work on public-service software is exactly where I want my accessibility work to count. When I read that your next step is a shared design system, I recognised the job I have been doing at Kiezware for the last three years.',
      'There I led the move of a checkout used by 400,000 customers a month from jQuery to React and TypeScript, and built the Storybook component library that four product teams now ship with. Along the way I raised the store’s Lighthouse accessibility score from 68 to 97.',
      'Before that, at Souq Digital in Amman, I added right-to-left support across a payments product and wrote the Playwright tests that cut release bugs by a third. I would bring the same care for quality and for every user to your team.',
      'I would be glad to tell you more in a conversation.',
      'Kind regards,'
    ].join('\n\n'),
    enclosures: ['CV', 'Bachelor Diploma']
  },
  'app_demo5:ar': {
    subject: 'طلب التقدّم لوظيفة مطوّر واجهات',
    subjects: ['طلب التقدّم لوظيفة مطوّر واجهات', 'مطوّر واجهات بخبرة في دعم العربية'],
    motivation: 'المدار تبني منتجات للسوق العربي، وأنا عندي خبرة بدعم العربية من اليمين لليسار.',
    recipient: 'إدارة الموارد البشرية\nشركة المدار\nدبي، الإمارات العربية المتحدة',
    body: [
      'السادة في شركة المدار المحترمين،',
      'يسعدني أن أتقدّم لوظيفة مطوّر الواجهات لديكم. تبنون منتجات موجّهة للمستخدم العربي، وهذا تماماً ما عملت عليه خلال السنوات الماضية.',
      'في Souq Digital أضفت دعم الكتابة من اليمين لليسار لتطبيق مدفوعات كامل، وبنيت لوحة العملاء بـ React و GraphQL. وفي Kiezware ببرلين قدت إعادة بناء صفحة دفع يستخدمها 400 ألف عميل شهرياً، ورفعت نتيجة إمكانية الوصول من 68 إلى 97.',
      'أتطلّع إلى فرصة الحديث معكم عن كيف أقدر أساهم في فريقكم.',
      'مع خالص التقدير،'
    ].join('\n\n'),
    enclosures: ['السيرة الذاتية', 'شهادة البكالوريوس']
  }
}

export function demoLetter(applicationId: string, language: string): LetterState | null {
  const l = LETTERS[`${applicationId}:${language}`]
  if (!l) return null
  return {
    ...EMPTY_LETTER,
    language,
    layout: layoutFor(language, language === 'ar' ? 'rtl' : 'ltr'),
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    ...l
  }
}
