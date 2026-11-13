/**
 * Draws PDF pages to images in the renderer with pdf.js. The worker code runs on
 * the main thread (registered as `globalThis.pdfjsWorker`), because the page's
 * security policy allows no worker scripts or eval. Loaded only when needed.
 */
type PdfJs = typeof import('pdfjs-dist')

let lib: Promise<PdfJs> | null = null

function pdfjs(): Promise<PdfJs> {
  lib ??= (async () => {
    // @ts-expect-error the worker module ships without type declarations
    const worker: unknown = await import('pdfjs-dist/build/pdf.worker.mjs')
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
    return import('pdfjs-dist')
  })()
  return lib
}

/** Up to `maxPages` pages as JPEG data URLs, about `width` pixels wide. */
export async function renderPdfPages(data: Uint8Array, maxPages = 2, width = 1100): Promise<string[]> {
  const pdf = await pdfjs()
  const task = pdf.getDocument({ data: data.slice(), useSystemFonts: true })
  const doc = await task.promise
  try {
    const out: string[] = []
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('PDF_FAILED')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      out.push(canvas.toDataURL('image/jpeg', 0.86))
      page.cleanup()
    }
    return out
  } finally {
    await task.destroy()
  }
}

/** Cuts a box (fractions of the image) out of an image, no bigger than `max` pixels a side. */
export async function cropImage(
  dataUrl: string,
  box: { x: number; y: number; w: number; h: number },
  max = 600
): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const sx = box.x * img.naturalWidth
  const sy = box.y * img.naturalHeight
  const sw = box.w * img.naturalWidth
  const sh = box.h * img.naturalHeight
  const scale = Math.min(1, max / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.9)
}
