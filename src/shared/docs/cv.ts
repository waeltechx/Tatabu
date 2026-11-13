/**
 * The ATS CV: one column, real text in reading order, standard section names, no
 * tables, columns or icons. Applicant tracking systems read it top to bottom, so
 * dates sit on the line under the title instead of floating to the side.
 */
import type { MasterCv } from '../cv'
import type { Profile } from '../profile'
import type { CvLabels } from '../tailor'
import { DOC_FONT_HEAD, esc, pageCss, type DocHtml } from './common'

export interface AtsCvInput {
  cv: MasterCv
  /** Fills in contact details the CV lacks. */
  profile?: Pick<Profile, 'fullName' | 'email' | 'phone' | 'address'>
  labels: CvLabels
  lang: string
  dir: 'ltr' | 'rtl'
  paper?: 'A4' | 'Letter'
  /** Keys (as in cvFacts) to highlight on screen. Leave empty when printing. */
  marks?: Set<string>
}

export function atsCvDoc(input: AtsCvInput): DocHtml {
  const { cv, labels, dir } = input
  const rtl = dir === 'rtl'
  const marks = input.marks ?? new Set<string>()
  const sep = rtl ? '، ' : ', '
  /** A fact wrapped so the preview can find and highlight it. */
  const k = (key: string, text: string): string =>
    text ? `<span data-k="${esc(key)}"${marks.has(key) ? ' class="hl"' : ''}>${esc(text)}</span>` : ''
  const bdi = (text: string): string => (text ? `<bdi>${esc(text)}</bdi>` : '')
  const dates = (start: string, end: string): string => [start, end].filter(Boolean).map(bdi).join(' – ')
  const line = (...parts: string[]): string => parts.filter(Boolean).join(' · ')

  const name = cv.name || input.profile?.fullName || ''
  const contact = [
    cv.contact.location || (input.profile?.address ?? '').split('\n').slice(-1)[0] || '',
    cv.contact.email || input.profile?.email || '',
    cv.contact.phone || input.profile?.phone || '',
    ...cv.contact.links
  ]
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `<span dir="auto">${esc(c)}</span>`)
    .join(' · ')

  const section = (title: string, body: string): string => (body.trim() ? `<h2>${esc(title)}</h2>${body}` : '')
  const bullets = (items: Array<[string, string]>): string =>
    items.length ? `<ul>${items.map(([key, text]) => `<li>${k(key, text)}</li>`).join('')}</ul>` : ''

  const experience = cv.experience
    .map(
      (e) => `<div class="entry">
        <div class="what"><b>${k(`${e.id}.title`, e.title)}</b>${e.organization ? ` · ${bdi(e.organization)}` : ''}</div>
        <div class="meta">${line(dates(e.start, e.end), bdi(e.location))}</div>
        ${bullets(e.bullets.map((b, i) => [`${e.id}.b${i}`, b]))}
      </div>`
    )
    .join('')
  const education = cv.education
    .map(
      (e) => `<div class="entry">
        <div class="what"><b>${k(`${e.id}.degree`, e.degree)}</b>${e.institution ? ` · ${bdi(e.institution)}` : ''}</div>
        <div class="meta">${line(dates(e.start, e.end), bdi(e.location))}</div>
        ${bullets(e.details.map((d, i) => [`${e.id}.d${i}`, d]))}
      </div>`
    )
    .join('')
  const entries = (list: MasterCv['certificates']): string =>
    list.length
      ? `<ul>${list
          .map(
            (c) =>
              `<li>${line(k(`${c.id}.name`, c.name) && `<b>${k(`${c.id}.name`, c.name)}</b>`, k(`${c.id}.detail`, c.detail), bdi(c.date))}</li>`
          )
          .join('')}</ul>`
      : ''
  const skills = cv.skills.length ? `<p>${cv.skills.map((s, i) => k(`skills.${i}`, s)).join(sep)}</p>` : ''
  const languages = cv.languages.length
    ? `<p>${cv.languages.map((l, i) => k(`languages.${i}`, [l.name, l.level].filter(Boolean).join(' – '))).join(sep)}</p>`
    : ''
  const other = cv.other.map((s) => section(s.title, bullets(s.lines.map((l, i) => [`${s.id}.l${i}`, l])))).join('')

  const body = `<div class="cv${rtl ? ' rtl' : ''}">
    <header>
      <h1>${esc(name)}</h1>
      ${cv.headline ? `<div class="headline">${k('headline', cv.headline)}</div>` : ''}
      ${contact ? `<div class="contact">${contact}</div>` : ''}
    </header>
    ${section(labels.summary, cv.summary ? `<p>${k('summary', cv.summary)}</p>` : '')}
    ${section(labels.experience, experience)}
    ${section(labels.education, education)}
    ${section(labels.skills, skills)}
    ${section(labels.languages, languages)}
    ${section(labels.certificates, entries(cv.certificates))}
    ${section(labels.projects, entries(cv.projects))}
    ${other}
  </div>`

  const css = `${pageCss(input.paper, '16mm 18mm 16mm 18mm')}
  body { font-size: 10pt; line-height: 1.45; }
  .cv { text-align: start; }
  header { margin-bottom: 10pt; }
  h1 { font-family: ${DOC_FONT_HEAD}; font-size: 20pt; line-height: 1.15; margin: 0; letter-spacing: -0.01em; }
  .headline { font-size: 11pt; font-weight: 600; margin-top: 3pt; }
  .contact { color: #4b5263; font-size: 9pt; margin-top: 4pt; }
  h2 { font-family: ${DOC_FONT_HEAD}; font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.06em; margin: 12pt 0 5pt;
       padding-bottom: 2pt; border-bottom: 0.75pt solid #1d2433; break-after: avoid; }
  .rtl h2 { text-transform: none; letter-spacing: 0; font-size: 11.5pt; }
  .rtl { line-height: 1.7; }
  .entry { margin-bottom: 7pt; break-inside: avoid; }
  .what { font-size: 10.5pt; }
  .meta { color: #4b5263; font-size: 9pt; }
  ul { margin: 3pt 0 0; padding-inline-start: 14pt; }
  li { margin: 1.5pt 0; }
  .hl { background: #fff1a8; box-shadow: 0 0 0 1.5pt #fff1a8; }
  `
  return { title: name || 'CV', css, body, dir, lang: input.lang }
}
