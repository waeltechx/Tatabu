/** The References page: the user's header, a title, the role it is for, then each referee. */
import type { Profile } from '../profile'
import type { Referee } from '../settings'
import { docLabels, esc, languageCode, lines, pageCss, DOC_FONT_HEAD, type DocHtml } from './common'

export interface ReferenceDocInput {
  profile: Profile
  title: string
  /** The line under the title, e.g. "For the Data Analyst position at Nordlicht". */
  subject: string
  referees: Referee[]
  lang: string
  dir: 'ltr' | 'rtl'
  paper?: 'A4' | 'Letter'
}

export function referenceDoc(input: ReferenceDocInput): DocHtml {
  const L = docLabels(input.lang)
  const p = input.profile
  const contact = [p.email, p.phone].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')
  const address = lines(p.address)
    .map((l) => `<bdi>${esc(l)}</bdi>`)
    .join(' · ')

  const referees = input.referees
    .filter((r) => [r.name, r.affiliation, r.email, r.phone, r.address].some((v) => v?.trim()))
    .map((r) => {
      const rows: string[] = []
      if (r.includeRelationship && r.relationship.trim())
        rows.push(`<div class="rel">${esc(L.relationship)}: ${esc(r.relationship)}</div>`)
      const reach = [r.email && `<span dir="ltr">${esc(r.email)}</span>`, r.phone && `<span dir="ltr">${esc(r.phone)}</span>`]
        .filter(Boolean)
        .map((x) => `<div>${x}</div>`)
        .join('')
      const addr = lines(r.address)
        .map((l) => `<bdi>${esc(l)}</bdi>`)
        .join(', ')
      return `<section class="ref">
        ${r.name ? `<h3>${esc(r.name)}</h3>` : ''}
        ${r.affiliation ? `<div class="aff">${esc(r.affiliation)}</div>` : ''}
        ${rows.join('')}
        <div class="reach">${reach}${addr ? `<div>${addr}</div>` : ''}</div>
      </section>`
    })
    .join('')

  const css = `${pageCss(input.paper)}
  .head h1 { font-family: ${DOC_FONT_HEAD}; font-size: 20pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
  .head .meta { color: #4b5263; font-size: 9pt; }
  .head { padding-bottom: 12pt; border-bottom: 1px solid #1d2433; margin-bottom: 26pt; }
  .title { font-family: ${DOC_FONT_HEAD}; font-size: 17pt; margin: 0 0 4pt; }
  .subject { color: #4b5263; font-size: 9.5pt; margin-bottom: 22pt; }
  .ref { padding: 14pt 0; border-top: 1px solid #d9d7d0; break-inside: avoid; }
  .ref:first-of-type { border-top: 0; padding-top: 0; }
  .ref h3 { font-size: 12pt; margin: 0 0 2pt; }
  .aff { font-weight: 500; margin-bottom: 4pt; }
  .rel { color: #4b5263; font-size: 9.5pt; margin-bottom: 4pt; }
  .reach { color: #1d2433; font-size: 9.5pt; line-height: 1.45; }
  [dir='rtl'] .head h1, [dir='rtl'] .title { letter-spacing: 0; font-family: 'Noto Sans Arabic', 'IBM Plex Sans Arabic', sans-serif; }
  `

  const body = `<div class="doc">
    <header class="head">
      ${p.fullName ? `<h1>${esc(p.fullName)}</h1>` : ''}
      ${contact ? `<div class="meta">${contact}</div>` : ''}
      ${address ? `<div class="meta">${address}</div>` : ''}
    </header>
    <h2 class="title">${esc(input.title || L.references)}</h2>
    ${input.subject ? `<div class="subject">${esc(input.subject)}</div>` : ''}
    ${referees}
  </div>`

  return { title: input.title || L.references, css, body, dir: input.dir, lang: input.lang }
}

/** The References page for one application, as both processes build it. */
export function referenceDocFor(args: {
  job: { jobTitle: string; company: string }
  title: string
  referees: Referee[]
  profile: Profile
  language: { id: string; name: string; dir: 'ltr' | 'rtl' }
  paper?: 'A4' | 'Letter'
}): DocHtml {
  const code = languageCode(args.language)
  const L = docLabels(code)
  return referenceDoc({
    profile: args.profile,
    title: args.title || L.references,
    subject: L.forRole(args.job.jobTitle, args.job.company),
    referees: args.referees,
    lang: code,
    dir: args.language.dir,
    paper: args.paper
  })
}
