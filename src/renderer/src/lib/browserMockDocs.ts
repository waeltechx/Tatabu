/** Dev-only: profile, library and document channels for the browser mock (invented data). */
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import type { LibraryItem } from '@shared/applications'
import type { ReferenceState } from '@shared/documents'
import { EMPTY_PROFILE, type Profile } from '@shared/profile'
import type { Referee } from '@shared/settings'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type Handlers = { [C in IpcChannel]?: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>> }

export function createDocMocks(ctx: { referees: () => Referee[]; apps: Handlers }): Handlers {
  const demo = new URLSearchParams(location.search).has('demo')
  let profile: Profile = demo
    ? {
        ...EMPTY_PROFILE,
        fullName: 'Omar Haddad',
        headline: 'Frontend Engineer',
        email: 'omar.haddad@example.com',
        phone: '+49 30 5550 0184',
        address: 'Weserstraße 21\n12047 Berlin',
        links: ['https://github.com/omar-haddad']
      }
    : { ...EMPTY_PROFILE }
  let library: LibraryItem[] = demo
    ? [
        { id: 'lib_1', label: 'Bachelor Diploma', filename: 'Bachelor_Diploma.pdf', kind: 'pdf', size: 1_200_000 },
        { id: 'lib_2', label: 'Language Certificate', filename: 'Language_Certificate.pdf', kind: 'pdf', size: 420_000 }
      ]
    : []
  const refs = new Map<string, ReferenceState>()

  return {
    'profile:get': () => profile,
    'profile:save': (patch) => (profile = { ...profile, ...patch }),
    'library:list': () => library,
    'library:add': (label) => {
      library = [
        {
          id: `lib_${Date.now()}`,
          label: label || 'Document',
          filename: `${label || 'Document'}.pdf`,
          kind: 'pdf',
          size: 300_000
        },
        ...library
      ]
      return library
    },
    'library:rename': (id, label) => (library = library.map((l) => (l.id === id ? { ...l, label } : l))),
    'library:remove': (id) => (library = library.filter((l) => l.id !== id)),
    'library:open': () => undefined,
    'refs:get': (id) => refs.get(id) ?? { title: '', language: 'en', custom: false, referees: ctx.referees() },
    'refs:save': (id, state) => {
      const next = state.custom ? state : { ...state, referees: ctx.referees() }
      refs.set(id, next)
      return next
    },
    'refs:print': async (id, state) => {
      await wait(700)
      refs.set(id, state)
      const files = await (ctx.apps['files:list'] as (id: string) => Promise<never[]> | never[])(id)
      return { files, fileId: 'mock', filename: 'References.pdf' }
    }
  }
}
