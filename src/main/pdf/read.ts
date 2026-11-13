/** Reading uploaded files: text from PDF (pdfjs) and Word (mammoth). */
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Promise<PdfJs> | null = null

function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs
}

export async function openPdf(data: Uint8Array) {
  const lib = await loadPdfJs()
  return lib.getDocument({ data: new Uint8Array(data), useSystemFonts: false, disableFontFace: true }).promise
}

/** Plain text of a PDF, page by page, with line breaks where the text moves down. */
export async function pdfText(data: Uint8Array, maxPages = 12): Promise<string> {
  const doc = await openPdf(data)
  const pages: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let out = ''
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5] as number
      if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n'
      else if (out && !out.endsWith(' ') && item.str && !item.str.startsWith(' ')) out += item.hasEOL ? '\n' : ' '
      out += item.str
      lastY = y
    }
    pages.push(
      out
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
  }
  await doc.cleanup()
  return pages.join('\n\n')
}

export async function docxText(data: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer: Buffer.from(data) })
  return result.value.replace(/\n{3,}/g, '\n\n').trim()
}

/** Text of a CV file the user picked (PDF or Word). */
export async function fileText(path: string): Promise<string> {
  const data = new Uint8Array(readFileSync(path))
  const ext = extname(path).toLowerCase()
  if (ext === '.pdf') return pdfText(data)
  if (ext === '.docx') return docxText(data)
  if (ext === '.txt' || ext === '.md') return Buffer.from(data).toString('utf8')
  throw new Error('UNSUPPORTED_FILE')
}
