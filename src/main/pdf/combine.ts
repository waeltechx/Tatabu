/**
 * Merges files into one PDF, in the given order (port of the reference `combine.py`).
 * PDFs are appended page by page; PNG and JPEG images get their own A4 page.
 * Anything else (Word, other images) is skipped and reported back.
 */
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { fileKind } from '@shared/applications'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 42.5 // 1.5 cm

export interface CombineItem {
  path: string
  filename: string
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8
}

export async function combineFiles(items: CombineItem[]): Promise<{ pdf: Uint8Array; skipped: string[] }> {
  const out = await PDFDocument.create()
  const skipped: string[] = []

  for (const item of items) {
    const kind = fileKind(item.filename)
    try {
      const bytes = new Uint8Array(readFileSync(item.path))
      if (kind === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      } else if (kind === 'image' && (isPng(bytes) || isJpeg(bytes))) {
        const image = isPng(bytes) ? await out.embedPng(bytes) : await out.embedJpg(bytes)
        const page = out.addPage(A4)
        const scale = Math.min((A4[0] - 2 * MARGIN) / image.width, (A4[1] - 2 * MARGIN) / image.height)
        const w = image.width * scale
        const h = image.height * scale
        page.drawImage(image, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h })
      } else {
        skipped.push(item.filename)
      }
    } catch {
      skipped.push(item.filename)
    }
  }

  if (out.getPageCount() === 0) throw new Error('NOTHING_TO_COMBINE')
  return { pdf: await out.save(), skipped }
}
