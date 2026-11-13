/**
 * The cover letter page in seven layouts (mockup `letter-templates.html`):
 * four left-to-right (Classic, DIN 5008, Modern header, Block) and three
 * right-to-left (رسمي عربي, Classic mirrored, Modern header mirrored).
 */
import type { Profile } from '../profile'
import type { LetterLabels, LetterLayout } from '../letter'
import { docLabels, esc, formatDocDate, lines, pageCss, safeImage, DOC_FONT_HEAD, type DocHtml } from './common'

export interface LetterDocInput {
  layout: LetterLayout
  profile: Profile
  recipient: string
  subject: string
  body: string
  enclosures: string[]
  signature: boolean
  /** ISO date; today when empty. */
  date: string
  lang: string
  dir: 'ltr' | 'rtl'
  labels?: LetterLabels
  paper?: 'A4' | 'Letter'
}

/** The town from the last address line ("12047 Berlin" → "Berlin"), for "Berlin, 13 November 2026". */
export function placeFrom(address: string): string {
  const last = lines(address).at(-1) ?? ''
  const town = last
    .replace(/\b[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}\b/g, '') // UK postcodes
    .replace(/\b\d{4,6}(-\d{3,4})?\b/g, '') // postal codes
    .replace(/^[\s,·-]+|[\s,·-]+$/g, '')
  return town.length <= 40 ? town : ''
}

function paragraphs(body: string): string[][] {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()))
    .filter((p) => p.some(Boolean))
}

export function letterDoc(input: LetterDocInput): DocHtml {
  const L = docLabels(input.lang, input.labels)
  const p = input.profile
  const rtl = input.dir === 'rtl'
  const date = formatDocDate(input.date ? new Date(input.date) : new Date(), input.lang)
  const place = placeFrom(p.address)
  // Each line isolated, so "12047 Berlin" keeps its order inside right-to-left text.
  const bdi = (l: string): string => `<bdi>${esc(l)}</bdi>`
  const placeDate = place ? `${bdi(place)}${rtl ? '،' : ','} ${esc(date)}` : esc(date)
  const addressLines = lines(p.address).map(bdi)
  const contact = [p.email, p.phone].filter(Boolean).map((x) => `<span dir="ltr">${esc(x)}</span>`)
  const recipient = lines(input.recipient).map(bdi)
  const sig = input.signature ? safeImage(p.signature) : ''

  // The body: the last line is the name when the AI signed off with it; the signature goes just above.
  const paras = paragraphs(input.body)
  const lastPara = paras.at(-1) ?? []
  const signedName = p.fullName && lastPara.at(-1)?.trim() === p.fullName.trim()
  if (signedName) lastPara.pop()
  const bodyHtml = paras
    .filter((para) => para.some(Boolean))
    .map((para) => `<p>${para.map(esc).join('<br>')}</p>`)
    .join('')
  const nameLine = p.fullName ? `<div class="name">${esc(p.fullName)}</div>` : ''
  const signoff = `<div class="signoff">${sig ? `<img class="sig" src="${sig}" alt="">` : ''}${signedName || sig ? nameLine : ''}</div>`

  const enclosures = input.enclosures.filter((e) => e.trim())
  const encl = enclosures.length
    ? input.layout === 'din5008'
      ? `<div class="encl"><b>${esc(L.enclosures)}</b><br>${enclosures.map(esc).join('<br>')}</div>`
      : `<div class="encl">${esc(L.enclosures)}: ${enclosures.map(esc).join(rtl ? '، ' : ', ')}</div>`
    : ''

  const subjectText = input.subject.trim()
  const subjectLabel =
    rtl || (input.labels?.subject && !['en', 'de'].includes(input.lang))
      ? `${esc(L.subject)}: `
      : input.layout === 'block' && input.lang === 'en'
        ? 'Re: '
        : ''
  const subject = subjectText ? `<div class="subject">${subjectLabel}${esc(subjectText)}</div>` : ''

  const sender = `<b class="sender-name">${esc(p.fullName)}</b>${addressLines.length ? '<br>' + addressLines.join('<br>') : ''}${contact.length ? '<br>' + contact.join(' · ') : ''}`
  const recipientBlock = recipient.length
    ? `<b>${recipient[0]}</b>${recipient.length > 1 ? '<br>' + recipient.slice(1).join('<br>') : ''}`
    : ''
  const band = `<div class="band"><div class="band-name">${esc(p.fullName)}</div><div class="band-meta">${[
    esc(p.headline),
    esc(place),
    ...contact
  ]
    .filter(Boolean)
    .join(' · ')}</div></div>`

  let head = ''
  switch (input.layout) {
    case 'classic':
    case 'ar-classic':
      head = `<div class="blk end">${sender}</div><div class="blk start">${recipientBlock}</div><div class="date ${rtl ? 'start' : 'end'}">${placeDate}</div>`
      break
    case 'din5008':
      head =
        `<div class="blk end">${sender}</div>` +
        `<div class="din-window"><div class="return">${esc([p.fullName, ...lines(p.address)].filter(Boolean).join(' · '))}</div>${recipientBlock}</div>` +
        `<div class="date end">${placeDate}</div>`
      break
    case 'block':
      head = `<div class="blk">${sender}</div><div class="blk">${esc(date)}</div><div class="blk">${recipientBlock}</div>`
      break
    case 'modern':
    case 'ar-modern':
      head = `<div class="row blk"><div>${recipientBlock}</div><div class="date-inline">${esc(date)}</div></div>`
      break
    case 'ar-formal':
      head = `<div class="row blk"><div>${sender}</div><div class="date-inline">${esc(L.date)}: ${esc(date)}</div></div><div class="blk">${recipientBlock}</div>`
      break
  }

  const modern = input.layout === 'modern' || input.layout === 'ar-modern'
  const css = `${pageCss(input.paper, modern ? '0 0 18mm 0' : '20mm 20mm 18mm 22mm')}
  body { font-size: 10.5pt; line-height: 1.55; }
  .letter { ${modern ? 'padding: 0;' : ''} }
  .inner { ${modern ? 'padding: 0 20mm 0 22mm;' : ''} }
  .blk { margin-bottom: 14pt; font-size: 9.5pt; line-height: 1.45; }
  .start { text-align: start; } .end { text-align: end; }
  .sender-name { font-size: 11pt; }
  .date { margin-bottom: 4pt; font-size: 9.5pt; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16pt; }
  .date-inline { white-space: nowrap; font-size: 9.5pt; }
  .subject { font-weight: 700; font-size: 11pt; margin: 16pt 0 12pt; }
  .body p { margin: 0 0 9pt; }
  .signoff { margin-top: 2pt; }
  .sig { display: block; max-height: 16mm; max-width: 55mm; margin: 2pt 0 2pt; }
  .encl { margin-top: 16pt; font-size: 9pt; color: #4b5263; }
  .din-window { min-height: 40mm; margin: 6mm 0 8mm; font-size: 9.5pt; line-height: 1.45; }
  .return { font-size: 7pt; text-decoration: underline; color: #4b5263; margin-bottom: 4pt; }
  .band { background: #202329; color: #fff; padding: 14mm 20mm 7mm 22mm; margin-bottom: 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .band-name { font-family: ${DOC_FONT_HEAD}; font-size: 22pt; font-weight: 700; }
  .band-meta { font-size: 8.5pt; opacity: 0.85; margin-top: 4pt; }
  [dir='rtl'] .band-name { font-family: 'Noto Sans Arabic', 'IBM Plex Sans Arabic', sans-serif; }
  .ar-formal .subject { text-align: center; }
  .ar-formal .signoff { text-align: left; }
  .ar-formal .sig { margin-left: 0; margin-right: auto; }
  .letter.rtl { line-height: 1.75; }
  `

  // The modern layouts put a full-width name band above everything else.
  const body = `<div class="letter ${input.layout}${rtl ? ' rtl' : ''}">
    ${modern ? band : ''}
    <div class="inner">
      ${head}
      ${subject}
      <div class="body">${bodyHtml}</div>
      ${signoff}
      ${encl}
    </div>
  </div>`

  return { title: subjectText || L.application, css, body, dir: input.dir, lang: input.lang }
}
