import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { DocHtml } from '@shared/docs/common'

const MM = 96 / 25.4
const PAPER = { A4: { w: 210, h: 297 }, Letter: { w: 215.9, h: 279.4 } }

/** Reads the @page margin from the document CSS ("22mm 20mm 20mm 22mm"), so the preview matches the PDF. */
function pageMargin(css: string): string {
  const m = /@page\s*\{[^}]*margin:\s*([^;}]+)/.exec(css)
  return m?.[1]?.trim() ?? '20mm'
}

/**
 * A live, scaled page preview of a printable document. The document is rendered in a
 * shadow root so its CSS can't leak into the app (and the app's can't leak in);
 * the app's bundled fonts still apply.
 */
export function DocPreview({
  doc,
  paper = 'A4',
  className,
  highlight
}: {
  doc: DocHtml
  paper?: 'A4' | 'Letter'
  className?: string
  /** Text to highlight and scroll to ("Show me"). */
  highlight?: string | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  // The document's real height, so a second page shows instead of being cut off.
  const [contentH, setContentH] = useState(0)
  const size = PAPER[paper]

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const update = (): void => setScale(el.clientWidth / (size.w * MM))
    const measure = (): void => setContentH(host.current?.offsetHeight ?? 0)
    update()
    measure()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const content = new ResizeObserver(measure)
    if (host.current) content.observe(host.current)
    return () => {
      ro.disconnect()
      content.disconnect()
    }
  }, [size.w])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    // @page rules don't apply on screen: turn them into page padding instead.
    const screenCss = doc.css.replace(/@page\s*\{[^}]*\}/g, '')
    root.innerHTML = `<style>
      :host { all: initial; display: block; }
      mark.tatabu-hl { background: #ffe45b; color: inherit; outline: 2px solid #ffe45b; border-radius: 2px; }
      ${screenCss.replace(/\bhtml\s*,\s*body\b|\bbody\b/g, '.page')}
      /* After the document's own rules, which reset body padding. */
      .page { background: #fff; color: #1d2433; width: ${size.w}mm; min-height: ${size.h}mm; padding: ${pageMargin(doc.css)}; box-sizing: border-box; }
    </style><div class="page" dir="${doc.dir}" lang="${doc.lang}">${doc.body}</div>`
    setContentH(el.offsetHeight)

    if (highlight && highlight.trim()) {
      const page = root.querySelector('.page')
      if (page) markText(page, highlight.trim())
      root.querySelector('mark.tatabu-hl')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [doc, size.w, size.h, highlight])

  return (
    <div ref={frame} className={clsx('relative w-full overflow-hidden', className)}>
      {/* Left-to-right box: the full-size page is scaled from its top-left corner, also in an Arabic UI. */}
      <div dir="ltr" style={{ height: `${Math.max(size.h * MM, contentH) * scale}px` }} className="min-h-full">
        <div
          ref={host}
          dir="ltr"
          style={{ display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left', width: `${size.w}mm` }}
          className="shadow-[0_1px_0_rgba(0,0,0,0.05)]"
        />
      </div>
    </div>
  )
}

/** Wraps the first occurrence of `needle` (case-insensitive, whitespace-tolerant) in a <mark>. */
function markText(root: Element, needle: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const target = needle.replace(/\s+/g, ' ').toLocaleLowerCase()
  const probe = target.slice(0, 60)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ')
    const i = text.toLocaleLowerCase().indexOf(probe)
    if (i >= 0) {
      const range = document.createRange()
      range.setStart(node, Math.min(i, node.textContent!.length))
      range.setEnd(node, Math.min(i + target.length, node.textContent!.length))
      const mark = document.createElement('mark')
      mark.className = 'tatabu-hl'
      try {
        range.surroundContents(mark)
      } catch {
        /* spans several elements: skip highlighting */
      }
      return
    }
  }
}
