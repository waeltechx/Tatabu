/**
 * Measures a PDF for "My design": every letter, line and shape with its position
 * (see `@shared/pdf/extract`), plus the pictures cut out of the rendered page, so a
 * photo keeps its frame and rounded corners exactly as drawn.
 */
import { extractPage, type PdfPageLike, type RawPage } from '@shared/pdf/extract'
import { pdfjs } from './pdfPages'

/** Room around a picture, in points, so a thin frame drawn around it is part of the cut-out. */
const PAD = 1

export async function extractPdfLayout(data: Uint8Array, maxPages = 4): Promise<RawPage[]> {
  const pdf = await pdfjs()
  const task = pdf.getDocument({ data: data.slice(), useSystemFonts: true, fontExtraProperties: true })
  const doc = await task.promise
  try {
    const out: RawPage[] = []
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n)
      const raw = await extractPage(page as unknown as PdfPageLike, pdf.OPS as unknown as Record<string, number>)
      const area = raw.width * raw.height
      // Photos and logos; a picture covering the page is a scan, not part of a design.
      const pictures = raw.images.filter((im) => im.w >= 12 && im.h >= 12 && im.w * im.h < area * 0.6).slice(0, 8)
      for (const im of pictures) {
        const x = Math.max(0, im.x - PAD)
        const y = Math.max(0, im.y - PAD)
        const w = Math.min(raw.width - x, im.w + PAD * 2)
        const h = Math.min(raw.height - y, im.h + PAD * 2)
        const scale = Math.min(6, 640 / Math.max(w, h))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // Only this corner of the page is drawn, at a higher resolution than the page preview.
        const viewport = page.getViewport({ scale, offsetX: -x * scale, offsetY: -y * scale })
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        Object.assign(im, { x, y, w, h, src: canvas.toDataURL('image/jpeg', 0.92) })
      }
      raw.images = pictures.filter((im) => im.src)
      out.push(raw)
      page.cleanup()
    }
    return out
  } finally {
    await task.destroy()
  }
}
