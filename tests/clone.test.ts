/**
 * "My design", measured from the PDF: reading a page by position, rebuilding it as a
 * flowing document, and swapping in tailored words. The CV is invented and drawn
 * with pdf-lib, so the whole path runs on a real PDF.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { activityBuckets } from '@shared/activity'
import { applyCv, bindableFacts, bindFacts, cloneCvDoc, looseText } from '@shared/clone/bind'
import { baselineOffset, buildClone, cellText, cloneBlocks, parseFontName, type CloneDoc, type CloneRow } from '@shared/clone/build'
import { cloneHtml } from '@shared/clone/render'
import { cleanCv } from '@shared/cv'
import { cleanRawPages } from '@shared/pdf/clean'
import { extractPage, type PdfPageLike, type RawPage } from '@shared/pdf/extract'
import { lineText, pageLines, pageText } from '@shared/pdf/lines'
import { cvLabels, type TailoredCv, type TItem } from '@shared/tailor'
import { pdfText } from '../src/main/pdf/read'

const LEFT = 50
const RIGHT = 545
const SUMMARY =
  'Engineer who builds accessible interfaces for public services. Led the rebuild of a booking flow used by ' +
  'four hundred thousand people a year, cut its loading time in half and wrote the component library that six ' +
  'teams now share. Enjoys pairing with designers and writing clear documentation.'
const BULLETS = [
  'Rebuilt keyboard navigation for the booking flow.',
  'Results: Cut loading time from 4.2 to 2.1 seconds.',
  'Wrote the component library shared by six teams.'
]

/** Breaks text into lines no wider than `width`, like a text editor would. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** A two-page CV in the usual shape; the content stream is written out of reading order on purpose. */
async function makeCv(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const teal = rgb(0.1, 0.43, 0.5)
  const ink = rgb(0.07, 0.1, 0.11)
  const page = pdf.addPage([595, 842])
  const text = (p: PDFPage, s: string, x: number, top: number, size: number, font = regular, color = ink): void =>
    p.drawText(s, { x, y: 842 - top, size, font, color })
  const right = (p: PDFPage, s: string, top: number, size: number): void =>
    text(p, s, RIGHT - regular.widthOfTextAtSize(s, size), top, size)
  const heading = (p: PDFPage, s: string, top: number): void => {
    text(p, s, LEFT, top, 9, bold, teal)
    p.drawRectangle({ x: LEFT, y: 842 - top - 7, width: RIGHT - LEFT, height: 0.75, color: rgb(0.8, 0.85, 0.87) })
  }

  // Stored first although it sits lower on the page: reading by position must put it back.
  wrap(SUMMARY, regular, 10, RIGHT - LEFT).forEach((l, i) => text(page, l, LEFT, 196 + i * 15, 10))
  text(page, 'Lina Haddad', LEFT, 70, 24, bold)
  text(page, 'Frontend Engineer', LEFT, 90, 11, regular, teal)
  ;[
    ['EMAIL', 'lina@example.com'],
    ['PHONE', '+49 30 5550 0199'],
    ['TOWN', 'Berlin, Germany']
  ].forEach(([label, value], i) => {
    text(page, label!, LEFT, 115 + i * 16, 7.5, bold)
    text(page, value!, 110, 115 + i * 16, 9.5)
  })
  heading(page, 'SUMMARY', 172)
  heading(page, 'EXPERIENCE', 268)
  text(page, 'Frontend Engineer', LEFT, 292, 10.5, bold)
  text(page, ' - Studio North, Berlin', LEFT + bold.widthOfTextAtSize('Frontend Engineer', 10.5), 292, 10.5)
  right(page, '2022 - 2024', 292, 9)
  BULLETS.forEach((b, i) => {
    text(page, '-', LEFT, 310 + i * 15, 9.5)
    text(page, b, LEFT + 10, 310 + i * 15, 9.5)
  })
  text(page, 'Web Developer', LEFT, 372, 10.5, bold)
  text(page, ' - Blue Harbor, Hamburg', LEFT + bold.widthOfTextAtSize('Web Developer', 10.5), 372, 10.5)
  right(page, '2019 - 2022', 372, 9)
  text(page, '-', LEFT, 390, 9.5)
  text(page, 'Built the online shop for a furniture maker.', LEFT + 10, 390, 9.5)

  const second = pdf.addPage([595, 842])
  heading(second, 'SKILLS', 60)
  text(second, 'Languages', LEFT, 84, 9.5, bold)
  text(second, 'TypeScript · React · CSS', 140, 84, 9.5)
  text(second, 'Tools', LEFT, 102, 9.5, bold)
  text(second, 'Figma · Playwright', 140, 102, 9.5)
  heading(second, 'VOLUNTEERING', 134)
  text(second, 'Mentor at a coding club for teenagers.', LEFT, 158, 9.5)
  return pdf.save()
}

const MASTER = cleanCv({
  name: 'Lina Haddad',
  headline: 'Frontend Engineer',
  contact: { email: 'lina@example.com', phone: '+49 30 5550 0199', location: 'Berlin, Germany', links: [] },
  summary: SUMMARY,
  experience: [
    { title: 'Frontend Engineer', organization: 'Studio North', location: 'Berlin', start: '2022', end: '2024', bullets: BULLETS },
    {
      title: 'Web Developer',
      organization: 'Blue Harbor',
      location: 'Hamburg',
      start: '2019',
      end: '2022',
      bullets: ['Built the online shop for a furniture maker.']
    }
  ],
  skills: ['TypeScript', 'React', 'CSS', 'Figma', 'Playwright'],
  other: [{ title: 'Volunteering', lines: ['Mentor at a coding club for teenagers.'] }],
  language: 'en'
})

const item = (id: string, text: string, sources: string[]): TItem => ({ id, text, sources, translations: [] })
const rowsOf = (doc: CloneDoc): CloneRow[] => cloneBlocks(doc).filter((b): b is CloneRow => b.kind === 'row')
const textOf = (doc: CloneDoc): string[] => rowsOf(doc).map((r) => r.cells.map(cellText).join(' | '))

let bytes: Uint8Array
let pages: RawPage[]
let layout: CloneDoc

beforeAll(async () => {
  bytes = await makeCv()
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, fontExtraProperties: true, verbosity: 0 }).promise
  pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    pages.push(await extractPage((await doc.getPage(n)) as unknown as PdfPageLike, lib.OPS as unknown as Record<string, number>))
  }
  layout = buildClone(pages)!.doc
})

describe('reading a PDF by position', () => {
  it('returns the lines top to bottom, whatever order the file stores them in', () => {
    const lines = pageLines(pages[0]!).map(lineText)
    expect(lines[0]).toBe('Lina Haddad')
    expect(lines[1]).toBe('Frontend Engineer')
    expect(lines.indexOf('SUMMARY')).toBeLessThan(lines.findIndex((l) => l.startsWith('Engineer who builds')))
    expect(lines.findIndex((l) => l.startsWith('Engineer who builds'))).toBeLessThan(lines.indexOf('EXPERIENCE'))
  })

  it('keeps a label and its value, and a title and its date, on one line', () => {
    const text = pageText(pages[0]!)
    expect(text).toMatch(/EMAIL\s+lina@example\.com/)
    expect(text).toMatch(/Frontend Engineer - Studio North, Berlin\s+2022 - 2024/)
  })

  it('reads positions, sizes, fonts and colours', () => {
    const name = pages[0]!.glyphs.find((g) => g.ch === 'L' && g.size === 24)!
    expect(name.x).toBeCloseTo(LEFT, 1)
    expect(name.y).toBeCloseTo(70, 1)
    expect(pages[0]!.fonts[name.font]!.name).toMatch(/Helvetica-Bold/)
    const heading = pages[0]!.glyphs.find((g) => g.size === 9 && g.ch === 'S')!
    expect(heading.color).toBe('#1a6e80')
    expect(pages[0]!.shapes.filter((s) => s.rect && s.box[3] - s.box[1] < 1)).toHaveLength(2)
  })

  it('gives the AI the CV in reading order', async () => {
    const text = await pdfText(bytes)
    expect(text.indexOf('Lina Haddad')).toBe(0)
    expect(text.indexOf('SUMMARY')).toBeLessThan(text.indexOf('Engineer who builds'))
    expect(text).toContain('Languages   TypeScript · React · CSS')
  })
})

describe('font names', () => {
  it.each([
    ['AAAAAA+FiraSans-SemiBold', 'Fira Sans', 600, false],
    ['Fira Sans Medium', 'Fira Sans', 500, false],
    ['BCDEEE+Arial-BoldMT', 'Arial', 700, false],
    ['TimesNewRomanPS-BoldItalicMT', 'Times New Roman', 700, true],
    ['Helvetica', 'Arial', 400, false],
    ['OpenSans-LightItalic', 'Open Sans', 300, true],
    ['SourceSansPro-Regular', 'Source Sans 3', 400, false]
  ])('%s', (name, family, weight, italic) => {
    expect(parseFontName(name)).toEqual({ family, weight, italic })
  })
})

describe('the measured design', () => {
  it('rebuilds lines, columns of a row, paragraphs and rules', () => {
    const rows = rowsOf(layout)
    const texts = textOf(layout)
    expect(texts[0]).toBe('Lina Haddad')
    expect(texts).toContain('EMAIL | lina@example.com')
    // The wrapped summary is one paragraph again.
    const summary = rows.find((r) => cellText(r.cells[0]!).startsWith('Engineer who builds'))!
    expect(cellText(summary.cells[0]!)).toBe(SUMMARY)
    expect(summary.cells[0]!.lines).toBeGreaterThan(1)
    expect(summary.cells[0]!.lh).toBeCloseTo(15, 1)
    // Title on the left, date pushed to the right edge.
    const title = rows.find((r) => cellText(r.cells[0]!).startsWith('Frontend Engineer - Studio North'))!
    expect(title.cells).toHaveLength(2)
    expect(title.cells[1]!.align).toBe('end')
    expect(cellText(title.cells[1]!)).toBe('2022 - 2024')
    // A bullet and its text.
    const bullet = rows.find((r) => r.marker && cellText(r.cells[1]!) === BULLETS[0])!
    expect(cellText(bullet.cells[0]!)).toBe('-')
    expect(cloneBlocks(layout).filter((b) => b.kind === 'rule')).toHaveLength(4)
    expect(layout.fonts).toEqual(['Arial'])
    expect(layout.pages).toBe(2)
  })

  it('puts every first baseline where the PDF has it', () => {
    const name = rowsOf(layout)[0]!
    const style = layout.styles[name.cells[0]!.s]!
    expect(name.top + baselineOffset(name.cells[0]!.lh, style)).toBeCloseTo(70, 1)
    // Gaps add up to the tops: nothing drifts down the page.
    let y = layout.margin.top
    for (const b of cloneBlocks(layout).filter((x) => x.page === 0)) {
      y += b.gap
      expect(y).toBeCloseTo(b.top, 2)
      y += b.h
    }
  })

  it('prints as plain, escaped HTML', () => {
    const copy: CloneDoc = structuredClone(layout)
    rowsOf(copy)[0]!.cells[0]!.runs[0]!.t = '<script>alert(1)</script>'
    const html = cloneHtml(copy, { title: 'CV', lang: 'en', dir: 'ltr' })
    expect(html.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html.body).not.toContain('<script')
    expect(html.css).toMatch(/@page \{ size: 595pt 842pt; margin: [\d.]+pt 0 [\d.]+pt 0; \}/)
    expect(html.css).toContain("font-family:'Arial'")
  })

  it('refuses a scan and a right-to-left page', () => {
    expect(buildClone([{ ...pages[0]!, glyphs: pages[0]!.glyphs.slice(0, 40) }])).toBeNull()
    expect(buildClone([{ ...pages[0]!, glyphs: pages[0]!.glyphs.map((g) => ({ ...g, ch: 'ب' })) }])).toBeNull()
  })
})

describe('checking what the renderer sends', () => {
  it('keeps measured pages and drops everything else', () => {
    const clean = cleanRawPages(JSON.parse(JSON.stringify(pages)))!
    expect(clean).toHaveLength(2)
    expect(clean[0]!.glyphs.length).toBe(pages[0]!.glyphs.length)
    const dirty = cleanRawPages([
      {
        width: 595,
        height: 842,
        fonts: [{ name: 'X', ascent: 'big', descent: null }],
        glyphs: [{ ch: 'a', x: 'NaN', y: 1e99, adv: -4, size: 10, font: 9, color: 'red;}', seq: 1 }],
        shapes: [
          { d: 'M0 0L1 1"/><script>', box: [0, 0, 1, 1], fill: '#000000', stroke: '', lineWidth: 1, opacity: 1, rect: false, seq: 2 },
          { d: 'M0 0L5 5', box: [0, 0, 5, 5], fill: 'url(x)', stroke: '#ff0000', lineWidth: 1, opacity: 1, rect: false, seq: 3 }
        ],
        images: [{ x: 1, y: 1, w: 10, h: 10, seq: 4, src: 'https://example.com/x.png' }]
      }
    ])!
    expect(dirty[0]!.glyphs[0]).toMatchObject({ x: 0, y: 20_000, adv: 0, font: 0, color: '#000000' })
    expect(dirty[0]!.shapes).toHaveLength(1)
    expect(dirty[0]!.shapes[0]).toMatchObject({ fill: '', stroke: '#ff0000' })
    expect(dirty[0]!.images[0]!.src).toBeUndefined()
    expect(cleanRawPages('nonsense')).toBeNull()
    expect(cleanRawPages([{ width: 1, height: 1 }])).toBeNull()
  })
})

describe('same design, different words', () => {
  it('finds every fact of the master CV in the design', () => {
    const facts = bindableFacts(MASTER)
    const hits = bindFacts(layout, facts)
    expect(Object.keys(facts).filter((k) => !hits.has(k))).toEqual([])
    expect(looseText(layout, MASTER)).toEqual([])
    // Without the summary in the master CV, the paragraph is text nothing can tailor.
    expect(looseText(layout, { ...MASTER, summary: '' })).toHaveLength(1)
  })

  it('changes nothing while the words are the same', () => {
    const same = applyCv(layout, MASTER, null)
    expect(same.doc).toEqual(layout)
    expect(same.unplaced).toEqual([])
  })

  it('rewrites, drops, reorders and adds lines without touching the rest', () => {
    const [e1, e2] = MASTER.experience
    const tailored: TailoredCv = {
      headline: item('h', 'Accessibility Engineer', ['headline']),
      summary: item('s', 'Engineer for accessible public services.', ['summary']),
      experience: [
        {
          id: e1!.id,
          title: item('e1.t', e1!.title, ['e1.title']),
          bullets: [
            item('x0', 'Results: Halved the loading time.', ['e1.b1']),
            item('x1', BULLETS[0]!, ['e1.b0']),
            item('x2', 'Paired with designers every week.', ['summary'])
          ]
        }
      ],
      education: [],
      skills: [item('sk0', 'React', ['skills.1']), item('sk1', 'TypeScript', ['skills.0']), item('sk2', 'Figma', ['skills.3'])],
      languages: [],
      certificates: [],
      projects: [],
      other: []
    }
    const before = textOf(layout)
    const { doc, unplaced } = applyCv(layout, MASTER, tailored)
    const after = textOf(doc)
    expect(unplaced).toEqual([])
    expect(after).toContain('Accessibility Engineer')
    expect(after).toContain('Engineer for accessible public services.')
    // Bullets: reworded one first, the kept one second, the new one in the same look, the third gone.
    const i = after.indexOf('- | Results: Halved the loading time.')
    expect(after.slice(i, i + 3)).toEqual([
      '- | Results: Halved the loading time.',
      `- | ${BULLETS[0]}`,
      '- | Paired with designers every week.'
    ])
    expect(after.join('\n')).not.toContain(BULLETS[2])
    // The second job and the volunteering section are left out, with heading and rule.
    expect(after.join('\n')).not.toMatch(/Web Developer|furniture|VOLUNTEERING|Mentor/)
    expect(cloneBlocks(doc).filter((b) => b.kind === 'rule')).toHaveLength(3)
    // Skills left out go with their separator; a row without values goes with its label.
    expect(after).toContain('Languages | TypeScript · React')
    expect(after).toContain('Tools | Figma')
    // Everything that is not a fact stays as it was.
    for (const line of ['Lina Haddad', 'EMAIL | lina@example.com', 'SUMMARY', 'EXPERIENCE', 'SKILLS']) {
      expect(after).toContain(line)
      expect(before).toContain(line)
    }
    // The new bullet copies the row it follows; the reworded one keeps its row's gap.
    const rows = rowsOf(doc)
    const added = rows.find((r) => cellText(r.cells[1] ?? r.cells[0]!) === 'Paired with designers every week.')!
    const model = rows.find((r) => cellText(r.cells[1] ?? r.cells[0]!) === BULLETS[0])!
    expect(added.cells[1]!.s).toBe(model.cells[1]!.s)
    expect(added.x).toBe(model.x)
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('prints the tailored CV in the design and translates known headings', () => {
    const tailored: TailoredCv = {
      headline: item('h', 'Frontend-Entwicklerin', ['headline']),
      summary: item('s', 'Entwicklerin für barrierefreie Oberflächen.', ['summary']),
      experience: MASTER.experience.map((e) => ({
        id: e.id,
        title: item(`${e.id}.t`, e.title, [`${e.id}.title`]),
        bullets: e.bullets.map((b, i) => item(`${e.id}.x${i}`, b, [`${e.id}.b${i}`]))
      })),
      education: [],
      skills: MASTER.skills.map((s, i) => item(`sk${i}`, s, [`skills.${i}`])),
      languages: [],
      certificates: [],
      projects: [],
      other: MASTER.other.map((s) => ({
        id: s.id,
        title: item('o.t', 'Ehrenamt', [`${s.id}.title`]),
        lines: s.lines.map((l, i) => item(`o.z${i}`, l, [`${s.id}.l${i}`]))
      }))
    }
    const html = cloneCvDoc({ layout, master: MASTER, tailored, labels: cvLabels('de'), lang: 'de', dir: 'ltr' })
    expect(html.lang).toBe('de')
    expect(html.body).toContain('Frontend-Entwicklerin')
    // Headings keep their capitals.
    expect(html.body).toContain('BERUFSERFAHRUNG')
    expect(html.body).toContain('KENNTNISSE')
    expect(html.body).toContain('EHRENAMT')
    expect(html.body).not.toContain('EXPERIENCE')
  })
})

describe('the activity chart', () => {
  const now = new Date(2026, 10, 14, 15) // Saturday 14 November 2026
  const at = (y: number, m: number, d: number): string => new Date(y, m - 1, d, 12).toISOString()

  it('counts applications per day and steps back by whole views', () => {
    const dates = [at(2026, 11, 14), at(2026, 11, 14), at(2026, 11, 1), at(2026, 10, 31), at(2026, 10, 20)]
    const view = activityBuckets(dates, '2w', 0, now)
    expect(view).toHaveLength(14)
    expect(view[0]).toMatchObject({ from: '2026-11-01', count: 1 })
    expect(view.at(-1)).toMatchObject({ from: '2026-11-14', to: '2026-11-14', count: 2 })
    const earlier = activityBuckets(dates, '2w', 1, now)
    expect(earlier[0]!.from).toBe('2026-10-18')
    expect(earlier.at(-1)).toMatchObject({ from: '2026-10-31', count: 1 })
    expect(earlier.reduce((n, b) => n + b.count, 0)).toBe(2)
  })

  it('groups by week from Monday and by calendar month', () => {
    const weeks = activityBuckets([at(2026, 11, 9), at(2026, 11, 15), at(2026, 11, 8)], '3m', 0, now)
    expect(weeks).toHaveLength(13)
    expect(weeks.at(-1)).toMatchObject({ from: '2026-11-09', to: '2026-11-15', count: 2 })
    expect(weeks.at(-2)).toMatchObject({ from: '2026-11-02', to: '2026-11-08', count: 1 })
    const months = activityBuckets([at(2026, 2, 28), at(2025, 12, 31)], '1y', 0, now)
    expect(months[0]).toMatchObject({ from: '2025-12-01', to: '2025-12-31', count: 1 })
    expect(months[2]).toMatchObject({ from: '2026-02-01', to: '2026-02-28', count: 1 })
    expect(months.at(-1)!.from).toBe('2026-11-01')
  })
})
