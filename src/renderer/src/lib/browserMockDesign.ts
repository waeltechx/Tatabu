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

  return {
    'cv:get': () => ({ cv: null, source: null, unread: false, updatedAt: '', warnings: [] }),
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
    'letter:options': () => [],
    'letter:get': (id, language) =>
      letters.get(`${id}:${language}`) ?? {
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
