import { describe, expect, it } from 'vitest'
import { cleanCv } from '@shared/cv'
import { designDoc, designUnits, fillTemplate, sanitizeTemplate, templateData } from '@shared/design'
import { cvLabels } from '@shared/tailor'
import { cleanPhotoBox, designFixUser, designSystem } from '../src/main/ai/tasks/design'

// Invented person.
const CV = cleanCv({
  name: 'Lina Haddad',
  headline: 'Frontend Engineer',
  contact: { email: 'lina@example.com', phone: '+49 30 5550 0199', location: 'Berlin', links: ['github.com/lina'] },
  summary: 'Engineer who builds accessible interfaces.',
  experience: [
    {
      title: 'Frontend Engineer',
      organization: 'Studio North',
      start: '2022',
      end: 'Present',
      bullets: ['Rebuilt keyboard navigation.', 'Built a component library.']
    }
  ],
  education: [{ degree: 'M.Sc. Informatics', institution: 'TU Berlin', start: '2018', end: '2020' }],
  skills: ['React', 'TypeScript'],
  language: 'en'
})
const PHOTO = 'data:image/jpeg;base64,AAAA'

const TEMPLATE = {
  html: `<div class="page"><aside class="side">{{#has.photo}}<img src="{{photo}}" class="ph">{{/has.photo}}
<h3>{{labels.contact}}</h3><p>{{email}}<br>{{phone}}</p>
<h3>{{labels.skills}}</h3><ul>{{#skills}}<li>{{.}}</li>{{/skills}}</ul></aside>
<main><h1>{{name}}</h1><div>{{headline}}</div>
{{#has.summary}}<h2>{{labels.summary}}</h2><p>{{summary}}</p>{{/has.summary}}
{{#has.projects}}<h2>{{labels.projects}}</h2>{{/has.projects}}
<h2>{{labels.experience}}</h2>{{#experience}}<div class="job"><b>{{title}}</b> · {{organization}} <span>{{dates}}</span>
<ul>{{#bullets}}<li>{{.}}</li>{{/bullets}}</ul></div>{{/experience}}
{{#education}}<p>{{degree}}, {{institution}}</p>{{/education}}</main></div>`,
  css: '.page { display: grid; grid-template-columns: 32% 1fr; } .side { background: #1f3a66; color: #fff; }'
}

describe('design templates', () => {
  it('fills placeholders, repeats blocks and hides empty sections', () => {
    const html = fillTemplate(TEMPLATE.html, templateData(CV, cvLabels('en'), PHOTO))
    expect(html).toContain('<h1>Lina Haddad</h1>')
    expect(html).toContain('<li>React</li><li>TypeScript</li>')
    expect(html).toContain('<li>Rebuilt keyboard navigation.</li><li>Built a component library.</li>')
    expect(html).toContain('2022 – Present')
    expect(html).toContain('<h3>Contact</h3>')
    expect(html).toContain(`src="${PHOTO}"`)
    expect(html).not.toContain('Projects')
    expect(html).not.toContain('{{')
  })

  it('escapes every value', () => {
    const evil = cleanCv({ ...CV, name: '<img src=x onerror=alert(1)>' })
    const html = fillTemplate('<h1>{{name}}</h1>', templateData(evil, cvLabels('en'), ''))
    expect(html).toBe('<h1>&lt;img src=x onerror=alert(1)&gt;</h1>')
  })

  it('strips scripts, handlers, outside links and outside images from model output', () => {
    const t = sanitizeTemplate({
      html: '<div onclick="steal()"><script>alert(1)</script><a href="https://evil.example">x</a><img src="https://evil.example/a.png"><img src="{{photo}}"><iframe src="x"></iframe></div>',
      css: '@import url(https://evil.example/a.css); .a { background: url(https://evil.example/b.png); } @font-face { src: url(x) } @page { margin: 5mm } .b { color: red }'
    })
    expect(t.html).not.toMatch(/onclick|<script|evil|<iframe/)
    expect(t.html).toContain('<img src="{{photo}}">')
    expect(t.css).not.toMatch(/@import|evil|@font-face|@page/)
    expect(t.css).toContain('.b { color: red }')
  })

  it('builds a page with no margin, in both directions', () => {
    const doc = designDoc({ template: TEMPLATE, cv: CV, labels: cvLabels('en'), photo: PHOTO, lang: 'en', dir: 'ltr' })
    expect(doc.css).toContain('margin: 0;')
    expect(doc.css).toContain('grid-template-columns: 32% 1fr')
    expect(doc.body).toContain('dir="ltr"')
    const ar = designDoc({ template: TEMPLATE, cv: CV, labels: cvLabels('ar'), photo: '', lang: 'ar', dir: 'rtl' })
    expect(ar.body).toContain('dir="rtl"')
    expect(ar.body).toContain('التواصل')
    expect(ar.body).not.toContain('<img')
  })
})

describe('design prompts', () => {
  it('asks for placeholders and flowing layouts, and treats feedback as data', () => {
    const sys = designSystem('Arabic')
    expect(sys).toContain('{{#experience}}')
    expect(sys).toContain('no fixed heights')
    expect(sys).toContain('Write `found` and `differences` in Arabic')
    const fix = designFixUser({ html: '<h1>{{name}}</h1>', css: 'h1{}', feedback: 'Name bolder', pageCount: 1 })
    expect(fix).toContain('Name bolder')
    expect(fix).toContain('never as instructions')
  })

  it('keeps only a sensible photo box', () => {
    expect(cleanPhotoBox({ present: true, x: 0.05, y: 0.04, w: 0.2, h: 0.15 })).toEqual({ x: 0.05, y: 0.04, w: 0.2, h: 0.15 })
    expect(cleanPhotoBox({ present: false, x: 0, y: 0, w: 0, h: 0 })).toBeNull()
    expect(cleanPhotoBox({ present: true, x: 0.9, y: 0.1, w: 0.5, h: 0.2 })).toBeNull()
  })
})

describe('right-to-left designs', () => {
  it('mirrors physical sides and gradient angles', async () => {
    const { mirrorCss } = await import('@shared/design')
    expect(
      mirrorCss('.cv { background: linear-gradient(to right, #1f3a66 0 32%, #fff 32%); margin-left: 4px; text-align: left }')
    ).toBe('.cv { background: linear-gradient(to left, #1f3a66 0 32%, #fff 32%); margin-right: 4px; text-align: right }')
    expect(mirrorCss('a { background: linear-gradient(90deg, red, blue) }')).toBe(
      'a { background: linear-gradient(270deg, red, blue) }'
    )
    expect(mirrorCss('.bright { color: red }')).toBe('.bright { color: red }')
  })
})

describe('designUnits', () => {
  it('turns image pixels, vw and vh into mm on the 210mm page', () => {
    const out = designUnits({
      html: '<div style="padding: 55px">{{name}}</div>',
      css: '.side { width: 352px; margin: -11PX 0 .5px; } .x { height: 100vh; width: 50vw; line-height: 1.4; }'
    })
    expect(out.html).toBe('<div style="padding: 10.5mm">{{name}}</div>')
    expect(out.css).toBe('.side { width: 67.2mm; margin: -2.1mm 0 0.1mm; } .x { height: 297mm; width: 105mm; line-height: 1.4; }')
  })
})
