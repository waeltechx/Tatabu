/**
 * Dev-only: in-memory applications and files for the browser mock.
 * `?demo` in the URL starts with a few invented applications.
 */
import type { IpcArgs, IpcResult } from '@shared/ipc'
import {
  EMPTY_JOB,
  fileKind,
  type AppFile,
  type Application,
  type FileType,
  type PickedFile,
  type Status
} from '@shared/applications'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type AppChannel =
  | 'apps:list'
  | 'apps:get'
  | 'apps:extract'
  | 'apps:checkDuplicate'
  | 'apps:create'
  | 'apps:update'
  | 'apps:delete'
  | 'apps:openFolder'
  | 'apps:setup'
  | 'files:pick'
  | 'files:list'
  | 'files:add'
  | 'files:attachLibrary'
  | 'files:setType'
  | 'files:delete'
  | 'files:open'
  | 'files:combine'
  | 'library:list'

export interface AppMockContext {
  hasGroq: () => boolean
  cv: () => { id: string; filename: string } | null
  hasReferees: () => boolean
}

const norm = (u = ''): string =>
  u
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')

export function createAppMocks(ctx: AppMockContext): {
  [C in AppChannel]: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
} {
  let apps: Application[] = new URLSearchParams(location.search).has('demo') ? demoApps() : []
  const files = new Map<string, AppFile[]>()
  const picked = new Map<string, PickedFile>()

  const findApp = (id: string): Application => {
    const app = apps.find((a) => a.id === id)
    if (!app) throw new Error('NOT_FOUND')
    return app
  }
  const mockFile = (applicationId: string, filename: string, type: FileType, size = 120_000): AppFile => ({
    id: `file_${Math.random().toString(36).slice(2, 10)}`,
    applicationId,
    type,
    filename,
    kind: fileKind(filename),
    size,
    missing: false,
    dateAdded: new Date().toISOString()
  })
  const ownerOf = (fileId: string): string | undefined =>
    [...files.entries()].find(([, list]) => list.some((f) => f.id === fileId))?.[0]

  return {
    'apps:list': () => [...apps].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
    'apps:get': (id) => findApp(id),
    'apps:extract': async (text, link) => {
      await wait(1200)
      if (!text.trim()) throw new Error('TEXT_EMPTY')
      if (text.includes('FAIL')) throw new Error('AI_RATE_LIMIT: Rate limit reached')
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const [first = '', second = ''] = lines
      let source = ''
      try {
        source = link ? new URL(link).hostname.replace(/^www\./, '') : ''
      } catch {
        source = ''
      }
      return {
        fields: {
          ...EMPTY_JOB,
          jobTitle: first.replace(/\(.*?\)/g, '').trim(),
          company: second.split('·')[0]?.trim() ?? '',
          location: second.split('·')[1]?.trim() ?? '',
          workMode: /hybrid/i.test(text) ? 'hybrid' : /remote/i.test(text) ? 'remote' : 'unknown',
          deadline: '2026-11-28',
          jobDescription: lines.slice(2).join('\n'),
          requirements: ['React', 'TypeScript', 'Accessibility'],
          language: /[؀-ۿ]/.test(text) ? 'ar' : 'en',
          source
        },
        provider: 'Groq',
        model: 'openai/gpt-oss-120b',
        seconds: 1.2
      }
    },
    'apps:checkDuplicate': (q) =>
      apps
        .filter((a) => a.id !== q.excludeId)
        .filter(
          (a) =>
            (!!q.link && !!a.applicationLink && norm(q.link) === norm(a.applicationLink)) ||
            (!!q.company &&
              !!q.jobTitle &&
              a.company.toLowerCase() === q.company.toLowerCase() &&
              a.jobTitle.toLowerCase() === q.jobTitle.toLowerCase()) ||
            (!!q.text && !!a.company && !!a.jobTitle && q.text.includes(a.company) && q.text.includes(a.jobTitle))
        )
        .map((a) => ({
          id: a.id,
          company: a.company,
          jobTitle: a.jobTitle,
          status: a.status,
          dateAdded: a.dateAdded,
          confidence: 'same_job' as const,
          reasons: [{ code: q.link && norm(q.link) === norm(a.applicationLink) ? ('link' as const) : ('identity' as const) }],
          similarity: 1
        })),
    'apps:create': (input, attachments) => {
      const now = new Date().toISOString()
      const { rawText: _raw, ...fields } = input
      const app: Application = {
        ...fields,
        id: `app_${Math.random().toString(36).slice(2, 10)}`,
        number: apps.length + 1,
        dateAdded: now,
        updatedAt: now,
        folder: `${input.company} – ${input.jobTitle}`
      }
      apps = [...apps, app]
      files.set(
        app.id,
        attachments.flatMap((a) => {
          const p = picked.get(a.token)
          return p ? [mockFile(app.id, p.filename, a.type, p.size)] : []
        })
      )
      return app
    },
    'apps:update': (id, patch) => {
      const next = { ...findApp(id), ...patch, updatedAt: new Date().toISOString() }
      apps = apps.map((a) => (a.id === id ? next : a))
      return next
    },
    'apps:delete': (id) => {
      apps = apps.filter((a) => a.id !== id)
    },
    'apps:openFolder': () => undefined,
    'apps:setup': () => ({ groq: ctx.hasGroq(), cv: !!ctx.cv(), profile: false, referees: ctx.hasReferees() }),
    'files:pick': () =>
      (
        [
          ['Omar_Haddad_CV.pdf', 248_000],
          ['Cover_letter.pdf', 96_000],
          ['Bachelor_Diploma.docx', 1_200_000]
        ] as const
      ).map(([filename, size]) => {
        const p: PickedFile = { token: `tok_${Math.random()}`, filename, size, kind: fileKind(filename) }
        picked.set(p.token, p)
        return p
      }),
    'files:list': (id) => files.get(id) ?? [],
    'files:add': (id, tokens, type = 'other') => {
      const added = tokens.flatMap((t) => {
        const p = picked.get(t)
        return p ? [mockFile(id, p.filename, type, p.size)] : []
      })
      files.set(id, [...(files.get(id) ?? []), ...added])
      return files.get(id) ?? []
    },
    'files:attachLibrary': (id, ids) => {
      const cv = ctx.cv()
      if (ids.length && cv) files.set(id, [...(files.get(id) ?? []), mockFile(id, cv.filename, 'other')])
      return files.get(id) ?? []
    },
    'files:setType': (fileId, type) => {
      const owner = ownerOf(fileId)
      if (!owner) return []
      files.set(
        owner,
        (files.get(owner) ?? []).map((f) => (f.id === fileId ? { ...f, type } : f))
      )
      return files.get(owner) ?? []
    },
    'files:delete': (fileId) => {
      const owner = ownerOf(fileId)
      if (!owner) return []
      files.set(
        owner,
        (files.get(owner) ?? []).filter((f) => f.id !== fileId)
      )
      return files.get(owner) ?? []
    },
    'files:open': () => undefined,
    'files:combine': async (id, ids, filename) => {
      await wait(500)
      const list = files.get(id) ?? []
      const skipped = list.filter((f) => ids.includes(f.id) && f.kind === 'docx').map((f) => f.filename)
      if (skipped.length === ids.length) throw new Error('NOTHING_TO_COMBINE')
      const name = `${(filename || 'Application').replace(/\.pdf$/i, '')}.pdf`
      files.set(id, [...list, mockFile(id, name, 'combined', 400_000)])
      return { files: files.get(id) ?? [], skipped }
    },
    'library:list': () => {
      const cv = ctx.cv()
      return cv ? [{ id: cv.id, label: 'CV', filename: cv.filename, kind: fileKind(cv.filename) }] : []
    }
  }
}

/** A handful of invented applications for designing the dashboard. */
function demoApps(): Application[] {
  const day = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString()
  const soon = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  const rows: Array<[string, string, string, Application['workMode'], Status, string, number]> = [
    ['Nordlicht GmbH', 'Frontend Engineer', 'Munich', 'hybrid', 'applied', soon(6), 0],
    ['Lumen Labs', 'Product Engineer', 'Remote', 'remote', 'interview', soon(8), 1],
    ['Grünwerk', 'Frontend Developer', 'Berlin', 'hybrid', 'saved', soon(2), 2],
    ['Kite Bank', 'Software Engineer', 'Berlin', 'hybrid', 'offer', '', 4],
    ['Tessera', 'UI Engineer', 'Berlin', 'onsite', 'rejected', soon(-8), 6],
    ['شركة المدار', 'مطوّر واجهات', 'دبي', 'onsite', 'applied', soon(20), 3],
    ['Atlas Data', 'Data Analyst', 'Hamburg', 'remote', 'applied', '', 9],
    ['Brightline', 'QA Engineer', 'Cologne', 'hybrid', 'saved', '', 3],
    ['Halde Studio', 'Design Engineer', 'Leipzig', 'hybrid', 'applied', '', 12]
  ]
  return rows.map(([company, jobTitle, loc, workMode, status, deadline, ago], i) => ({
    ...EMPTY_JOB,
    id: `app_demo${i}`,
    number: rows.length - i,
    company,
    jobTitle,
    location: loc,
    workMode,
    status,
    deadline,
    applicationLink: `https://jobs.example.com/${i}`,
    jobDescription:
      'Build accessible products with a collaborative engineering team. Work across React interfaces, automated tests and design systems.',
    requirements: ['React', 'TypeScript', 'Testing'],
    contactPerson: i % 2 ? 'Anna Weber' : '',
    companyAddress: i % 2 ? 'Seidlstraße 3, 80335 Munich' : '',
    salary: i % 3 ? '€65,000–€80,000 / year' : '',
    language: /[؀-ۿ]/.test(company) ? 'ar' : 'en',
    dateAdded: day(ago),
    updatedAt: day(ago),
    folder: `${company} – ${jobTitle}`
  }))
}
