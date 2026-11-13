/**
 * The hidden page every PDF is printed from. It only carries the bundled fonts;
 * the main process hands it a finished document (HTML + CSS) and prints it.
 */
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import '@fontsource/noto-sans-arabic/700.css'

interface PrintDoc {
  title: string
  css: string
  body: string
  dir: 'ltr' | 'rtl'
  lang: string
}

async function render(doc: PrintDoc): Promise<boolean> {
  document.title = doc.title || 'Document'
  document.documentElement.lang = doc.lang || 'en'
  document.documentElement.dir = doc.dir === 'rtl' ? 'rtl' : 'ltr'
  document.getElementById('doc-style')?.remove()
  const style = document.createElement('style')
  style.id = 'doc-style'
  style.textContent = doc.css
  document.head.appendChild(style)
  document.body.innerHTML = doc.body
  await document.fonts.ready
  await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))))
  return true
}

;(window as unknown as { __render: typeof render; __ready: boolean }).__render = render
;(window as unknown as { __ready: boolean }).__ready = true
