/**
 * Dev-only: master CV, "My design" and cover letter channels for the browser mock.
 * The design is really measured (the same shared code the app runs), so the compare
 * screen can be worked on in a browser tab with any PDF.
 */
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { buildClone } from '@shared/clone/build'
import type { DesignDraft, DesignSource, DesignState } from '@shared/design'
import { EMPTY_LETTER, layoutFor, type LetterState } from '@shared/letter'
import { cleanRawPages } from '@shared/pdf/clean'
import { EMPTY_TAILOR, type CvTailorState } from '@shared/tailor'
import { DEMO_MASTER, demoLetter, demoTailor } from './browserMockShowcase'

type Handlers = { [C in IpcChannel]?: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>> }

/** Lets the person pick a PDF from disk, or takes one put on `window.__devPdf` from the console. */
function pickPdf(): Promise<DesignSource | null> {
  const preset = (window as unknown as { __devPdf?: DesignSource }).__devPdf
  if (preset) return Promise.resolve(preset)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { filename: file.name, data: new Uint8Array(await file.arrayBuffer()) } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function createDesignMocks(): Handlers {
  let draft: DesignDraft | null = null
  let saved: DesignDraft | null = null
  const state = (): DesignState => ({ draft, saved })
  const letters = new Map<string, LetterState>()
  const cvs = new Map<string, CvTailorState>()
  // `?demo` fills the master CV, and a few applications come already tailored.
  const demo = new URLSearchParams(location.search).has('demo')

  return {
    'cv:get': () =>
      demo
        ? { cv: DEMO_MASTER, source: { id: 'lib_cv', filename: 'Omar_Haddad_CV.pdf' }, unread: false, updatedAt: new Date().toISOString(), warnings: [] }
        : { cv: null, source: null, unread: false, updatedAt: '', warnings: [] },
    'design:get': state,
    'design:pick': pickPdf,
    'design:masterPdf': () => null,
    'design:read': (input) => {
      const raw = input.ai ? null : cleanRawPages(input.layout)
      const measured = raw ? buildClone(raw) : null
      // The vision model is not available in a browser tab.
      if (!measured) throw new Error('AI_NO_VISION')
      draft = {
        html: '',
        css: '',
        layout: measured.doc,
        sourceName: input.filename,
        pages: input.pages,
        photo: '',
        photoBox: null,
        found: [],
        differences: [],
        round: 1,
        feedback: [],
        updatedAt: new Date().toISOString()
      }
      return state()
    },
    'design:photo': state,
    'design:save': () => {
      saved = draft ?? saved
      draft = null
      return state()
    },
    'design:recheck': () => {
      draft = saved
      return state()
    },
    'design:discard': () => {
      draft = null
      return state()
    },
    'design:remove': () => {
      saved = null
      return state()
    },
    // Tailoring needs the AI, so the browser only keeps the user's choices.
    'cvs:get': (id, language) =>
      cvs.get(`${id}:${language}`) ?? (demo ? demoTailor(id, language) : null) ?? { ...EMPTY_TAILOR, language },
    'cvs:tailor': (id, s) => {
      const made = demo ? demoTailor(id, s.language) : null
      if (!made) throw new Error('AI_NO_KEY')
      const next = { ...made, look: s.look, highlight: s.highlight }
      cvs.set(`${id}:${s.language}`, next)
      return next
    },
    'cvs:save': (id, s) => {
      const next = { ...EMPTY_TAILOR, ...cvs.get(`${id}:${s.language}`), ...s } as CvTailorState
      cvs.set(`${id}:${next.language}`, next)
      return next
    },
    'letter:options': () => [],
    'letter:get': (id, language) =>
      letters.get(`${id}:${language}`) ??
      (demo ? demoLetter(id, language) : null) ?? {
        ...EMPTY_LETTER,
        language,
        layout: layoutFor(language, language === 'ar' ? 'rtl' : 'ltr'),
        recipient: 'Anna Weber\nNordlicht GmbH\nSeidlstraße 3\n80335 Munich'
      },
    'letter:save': (id, s) => {
      letters.set(`${id}:${s.language}`, s)
      return s
    }
  }
}
