/**
 * Multi-signal duplicate detection (port of the reference app's `duplicates.py`).
 *
 * Signals:
 * 1. Canonical URL and job-board id (LinkedIn, Indeed, StepStone, Greenhouse, Lever, Workday, Xing).
 * 2. Reference numbers (Job ID, Req ID, Ref.-Nr., Kennziffer, Stellen-ID, …).
 * 3. A saved link appearing inside the pasted text.
 * 4. Text containment (overlap coefficient on word pairs): a clean description
 *    inside a noisy pasted page still matches.
 * 5. Cheap identity before any AI call: saved company + title found in the text.
 * 6. After extraction: company + title (+ city) with umlaut and legal-suffix normalising.
 * 7. Exact content hash.
 *
 * Pure apart from hashing, so it can be tested without a database.
 */
import { createHash } from 'node:crypto'
import type { DuplicateMatch, DuplicateQuery, DuplicateReason, Status } from '@shared/applications'

// Tracking / analytics query parameters to drop from job links.
const TRACKING_PARAMS = new Set([
  'gclid', 'fbclid', 'igshid', 'msclkid', 'ref', 'ref_src', 'source', 'trk',
  'trackingid', 'refid', 'identifier', 'feedid', 'midtoken', 'origin',
  'originalreferer', 'context', 'sessionid', 'fb_action_ids', 'fb_action_types',
  'yclid', '_ga', '_gl', 'spm', 'from', 'src'
]) // prettier-ignore

// Boilerplate lines found in pasted job pages.
const BOILERPLATE = [
  /^\s*we use cookies.*/i,
  /^\s*cookie settings.*/i,
  /^\s*accept all cookies.*/i,
  /^\s*privacy policy.*/i,
  /^\s*datenschutzerklärung.*/i,
  /^\s*alle rechte vorbehalten.*/i,
  /^\s*all rights reserved.*/i,
  /^\s*share (?:on|this job|via).*?/i,
  /^\s*apply (?:now|online|for this job).*?/i,
  /^\s*(?:home|jobs|careers|about us|login|sign in)\s*$/i
]

const LEGAL_SUFFIXES =
  /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|ag|se|inc\.?|ltd\.?|llc|corp\.?|co\.?|kg|kgaa|ug|e\.v\.|gesellschaft mit beschr\w+)\b/gi

const GENDER_TAGS = /[([{]\s*(m\/w\/d|m\/f\/d|m\/f\/x|w\/m\/d|f\/m\/d|d\/m\/w|all genders|gn)\s*[)\]}]/gi

const REF_PATTERNS = [
  /\b(?:(?:referenznummer|referenz|reference|kennziffer|stellen\s*[-_]?(?:id|nr|zeichen)?|aktenzeichen|chiffre|req(?:uisition)?|job|ref)[\s/.:#_-]*(?:id|nr|no|number|zeichen)?[\s/.:#_-]*)+([a-zA-Z0-9_\-/]{3,30})\b/gi,
  /\bref[.\s_-]*nr[.:\s#-]+([a-zA-Z0-9_\-/]{3,30})\b/gi,
  /\b(?:req|job|ref|pos|id)[-_]([0-9]{4,12})\b/gi,
  /\b#([0-9]{5,10})\b/g
]

const REF_STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'this', 'candidate', 'position', 'online',
  'portal', 'email', 'full', 'part', 'time', 'date', 'year', 'years', 'month'
]) // prettier-ignore

const TITLE_STOPWORDS = new Set([
  'and', 'for', 'the', 'with', 'und', 'fuer', 'von', 'oder', 'candidate',
  'position', 'role', 'stelle', 'job', 'full', 'part', 'time', 'mfx', 'mwd'
]) // prettier-ignore

/** Anything that isn't a letter, digit or underscore (Python's `[^\w\s]` with re.UNICODE). */
const NOT_WORD = /[^\p{L}\p{N}_\s]/gu

const UMLAUTS: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue',
  é: 'e', è: 'e', ê: 'e', á: 'a', à: 'a'
} // prettier-ignore

export function normalizeGermanUmlauts(s: string): string {
  return s ? s.replace(/[äöüßÄÖÜéèêáà]/g, (c) => UMLAUTS[c] ?? c) : ''
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function extractReferenceNumbers(text: string): string[] {
  if (!text) return []
  const refs = new Set<string>()
  for (const pattern of REF_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const val = (m[1] ?? '').replace(/^[ .\-_/#]+|[ .\-_/#]+$/g, '')
      const lower = val.toLowerCase()
      if (REF_STOPWORDS.has(lower) || val.length < 3) continue
      // Needs a digit, or an all-caps code of 4+ characters.
      if (/\d/.test(val) || (val === val.toUpperCase() && /[A-Z]/.test(val) && val.length >= 4)) refs.add(lower)
    }
  }
  return [...refs].sort()
}

export function extractEmailsAndUrls(text: string): { emails: Set<string>; urls: Set<string> } {
  if (!text) return { emails: new Set(), urls: new Set() }
  const emails = new Set([...text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)].map((m) => m[0].toLowerCase()))
  const urls = new Set<string>()
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    const norm = normalizeUrl(m[0])
    if (norm) urls.add(norm)
  }
  return { emails, urls }
}

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase()
  return TRACKING_PARAMS.has(k) || k.startsWith('utm_') || k.startsWith('mc_')
}

function parseUrl(url: string): URL | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw.replace(/^\/+/, '')}`)
  } catch {
    return null
  }
}

/** Canonical job link: no scheme, no "www.", no fragment, no trailing slash, no tracking params. */
export function normalizeUrl(url: string): string {
  const parts = url ? parseUrl(url) : null
  if (!parts) return ''
  let host = parts.hostname.toLowerCase()
  if (host.startsWith('www.')) host = host.slice(4)
  if (parts.port && parts.port !== '80' && parts.port !== '443') host = `${host}:${parts.port}`
  const path = parts.pathname.replace(/\/+$/, '')
  const kept = [...parts.searchParams.entries()].filter(([k]) => !isTrackingParam(k))
  kept.sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
  const query = new URLSearchParams(kept).toString()
  if (!host && !path) return ''
  return query ? `${host}${path}?${query}` : `${host}${path}`
}

/** "linkedin:4012345678" and friends, from known job boards. */
export function extractJobId(url: string): string {
  const parts = url ? parseUrl(url) : null
  if (!parts) return ''
  const host = parts.hostname.toLowerCase()
  const path = parts.pathname
  const q = parts.searchParams
  let m: RegExpMatchArray | null

  if (host.includes('linkedin.com')) {
    if ((m = path.match(/\/jobs\/view\/(\d+)/))) return `linkedin:${m[1]}`
    const current = q.get('currentJobId')
    if (current && /^\d+$/.test(current)) return `linkedin:${current}`
  }
  if (host.includes('indeed.')) {
    const jk = q.get('jk') || q.get('vjk')
    if (jk) return `indeed:${jk}`
  }
  if (host.includes('stepstone.')) {
    if ((m = path.match(/-id(\d+)\.html/))) return `stepstone:${m[1]}`
    if ((m = path.match(/\/stellenangebote--.*?--(\d+)-inline\.html/))) return `stepstone:${m[1]}`
  }
  if (host.includes('greenhouse.io')) {
    const gh = q.get('gh_jid')
    if (gh) return `greenhouse:${gh}`
    if ((m = path.match(/\/jobs\/(\d+)/))) return `greenhouse:${m[1]}`
  }
  if (host.includes('lever.co')) {
    if ((m = path.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i))) {
      return `lever:${(m[1] as string).toLowerCase()}`
    }
  }
  if (host.includes('myworkdayjobs.com') || host.includes('workday')) {
    if ((m = path.match(/\/job\/[^/]+\/([A-Za-z0-9_-]+)/))) return `workday:${m[1]}`
  }
  if (host.includes('xing.com')) {
    if ((m = path.match(/\/jobs\/[^/]+-(\d+)/))) return `xing:${m[1]}`
  }
  return ''
}

/** Lower-case words only, boilerplate lines dropped, umlauts spelled out. */
export function normalizeJobText(text: string): string {
  if (!text) return ''
  const lines = text
    .split(/\r?\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l && !BOILERPLATE.some((p) => p.test(l)))
  const joined = normalizeGermanUmlauts(lines.join(' ')).toLowerCase()
  return collapse(joined.replace(NOT_WORD, ' '))
}

export function computeContentHash(text: string): string {
  const norm = normalizeJobText(text)
  return norm ? createHash('sha256').update(norm, 'utf8').digest('hex') : ''
}

/** Word n-grams of already-normalised text. */
export function computeShingles(normText: string, n = 2): Set<string> {
  if (!normText) return new Set()
  const words = normText.split(' ').filter((w) => [...w].length > 1)
  if (words.length < n) return new Set(words)
  const out = new Set<string>()
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '))
  return out
}

function intersectionSize<T>(a: Set<T>, b: Set<T>): number {
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n
}

/** Jaccard similarity on words and word pairs (the larger of the two). */
export function computeSimilarity(text1: string, text2: string): number {
  const n1 = normalizeJobText(text1)
  const n2 = normalizeJobText(text2)
  if (!n1 || !n2) return 0
  if (n1 === n2) return 1
  const w1 = new Set(n1.split(' ').filter((w) => [...w].length > 1))
  const w2 = new Set(n2.split(' ').filter((w) => [...w].length > 1))
  if (!w1.size || !w2.size) return 0
  const union = new Set([...w1, ...w2]).size
  const token = union ? intersectionSize(w1, w2) / union : 0
  const s1 = computeShingles(n1)
  const s2 = computeShingles(n2)
  const shingleUnion = new Set([...s1, ...s2]).size
  const shingle = s1.size && s2.size && shingleUnion ? intersectionSize(s1, s2) / shingleUnion : 0
  return Math.max(token, shingle)
}

/**
 * Containment |A ∩ B| / min(|A|, |B|): close to 1 when a clean description sits
 * inside a pasted page full of menus, cookie banners and footers.
 */
export function computeOverlapCoefficient(queryText: string, storedText: string): number {
  const q = normalizeJobText(queryText)
  const s = normalizeJobText(storedText)
  if (!q || !s) return 0
  if (q === s) return 1
  const sq = computeShingles(q)
  const ss = computeShingles(s)
  const shingle = sq.size && ss.size ? intersectionSize(sq, ss) / Math.min(sq.size, ss.size) : 0
  const wq = new Set(q.split(' '))
  const ws = new Set(s.split(' '))
  const word = wq.size && ws.size ? intersectionSize(wq, ws) / Math.min(wq.size, ws.size) : 0
  return shingle > 0 && word > 0 ? Math.max(shingle, word * 0.95) : Math.max(shingle, word)
}

/** A compact signature: the 32 smallest word-pair hashes. */
export function computeTextFingerprint(text: string): string {
  const norm = normalizeJobText(text)
  if (!norm) return '[]'
  const shingles = computeShingles(norm)
  if (!shingles.size) return '[]'
  const hashes = new Set<number>()
  for (const sh of shingles) hashes.add(parseInt(createHash('md5').update(sh, 'utf8').digest('hex').slice(0, 8), 16))
  return JSON.stringify([...hashes].sort((a, b) => a - b).slice(0, 32))
}

export function normalizeCompany(name: string): string {
  if (!name) return ''
  const s = normalizeGermanUmlauts(name).replace(LEGAL_SUFFIXES, '')
  return collapse(s.replace(NOT_WORD, ' ').toLowerCase())
}

export function normalizeTitle(title: string): string {
  if (!title) return ''
  const s = normalizeGermanUmlauts(title).replace(GENDER_TAGS, '')
  return collapse(s.replace(NOT_WORD, ' ').toLowerCase())
}

interface IdentityResult {
  match: boolean
  reasons: DuplicateReason[]
  confidence: number
}

/** Before extraction: do the saved company and the key title words appear in the pasted text? */
export function checkCheapIdentity(
  storedCompany: string,
  storedTitle: string,
  storedLocation: string,
  storedDeadline: string,
  queryNormText: string
): IdentityResult {
  const none: IdentityResult = { match: false, reasons: [], confidence: 0 }
  const comp = normalizeCompany(storedCompany)
  const title = normalizeTitle(storedTitle)
  if (!comp || !title) return none

  let compMatched = queryNormText.includes(comp)
  if (!compMatched) {
    const tokens = comp.split(' ').filter((t) => [...t].length >= 4)
    compMatched = tokens.length > 0 && tokens.every((t) => queryNormText.includes(t))
  }
  if (!compMatched) return none

  const titleTokens = title.split(' ').filter((t) => [...t].length >= 4 && !TITLE_STOPWORDS.has(t))
  if (!titleTokens.length) return none
  const ratio = titleTokens.filter((t) => queryNormText.includes(t)).length / titleTokens.length
  if (ratio < 0.7) return none

  const loc = normalizeGermanUmlauts(storedLocation || '')
    .toLowerCase()
    .trim()
  const locMatched = loc.length >= 3 && queryNormText.includes(loc)
  const deadlineMatched = !!storedDeadline && queryNormText.includes(storedDeadline)

  const reasons: DuplicateReason[] = [{ code: 'identity' }]
  if (locMatched) reasons.push({ code: 'identityCity', value: storedLocation })
  if (deadlineMatched) reasons.push({ code: 'identityDeadline', value: storedDeadline })
  return { match: true, reasons, confidence: locMatched || deadlineMatched || ratio >= 0.85 ? 0.95 : 0.75 }
}

/** One saved application as the duplicate check sees it. */
export interface DuplicateRow {
  id: string
  company: string
  jobTitle: string
  location: string
  deadline: string
  status: Status
  dateAdded: string
  applicationLink: string
  jobDescription: string
  normalizedUrl: string
  jobId: string
  contentHash: string
  rawText: string
  refNumbers: string[]
}

/** Strong matches ("same job") first, then possible duplicates, by similarity. Rows newest first. */
export function findDuplicates(query: DuplicateQuery, rows: DuplicateRow[]): DuplicateMatch[] {
  const url = query.link ?? ''
  const jobText = query.text ?? ''
  const targetUrl = normalizeUrl(url)
  const targetJobId = extractJobId(url)
  const targetText = normalizeJobText(jobText)
  const targetHash = targetText ? computeContentHash(jobText) : ''
  const targetRefs = extractReferenceNumbers(jobText)
  const { urls: embeddedUrls } = extractEmailsAndUrls(jobText)
  const normComp = normalizeCompany(query.company ?? '')
  const normTitle = normalizeTitle(query.jobTitle ?? '')

  if (!(targetUrl || targetJobId || targetHash || targetRefs.length || (normComp && normTitle))) return []

  const matches: DuplicateMatch[] = []
  for (const r of rows) {
    if (query.excludeId && r.id === query.excludeId) continue

    const rowUrl = r.normalizedUrl || normalizeUrl(r.applicationLink)
    const rowJobId = r.jobId || extractJobId(r.applicationLink)
    const rowHash = r.contentHash || computeContentHash(r.jobDescription)
    const storedRefs = r.refNumbers.length ? r.refNumbers : extractReferenceNumbers(`${r.jobDescription}\n${r.rawText}`)

    const strong: DuplicateReason[] = []
    const medium: DuplicateReason[] = []
    let similarity = 0

    // 1–3: links
    if (targetJobId && rowJobId && targetJobId === rowJobId) strong.push({ code: 'jobId' })
    else if (targetUrl && rowUrl && targetUrl === rowUrl) strong.push({ code: 'link' })
    else if (rowUrl && targetText && (targetText.includes(rowUrl) || embeddedUrls.has(rowUrl)))
      strong.push({ code: 'linkInText' })

    // 4: exact text
    if (targetHash && rowHash && targetHash === rowHash) {
      strong.push({ code: 'identical' })
      similarity = 1
    } else if (targetHash && r.rawText && computeContentHash(r.rawText) === targetHash) {
      strong.push({ code: 'rawIdentical' })
      similarity = 1
    }

    // 5: containment
    if (targetText && (r.jobDescription || r.rawText)) {
      const fromDesc = r.jobDescription ? computeOverlapCoefficient(targetText, r.jobDescription) : 0
      const fromRaw = r.rawText ? computeOverlapCoefficient(targetText, r.rawText) : 0
      const best = Math.max(fromDesc, fromRaw)
      similarity = Math.max(similarity, best)
      const pct = String(Math.round(best * 100))
      if (best >= 0.8) strong.push({ code: 'contained', value: pct })
      else if (best >= 0.65) medium.push({ code: 'containedWeak', value: pct })
    }

    // 6: reference numbers
    if (targetRefs.length && storedRefs.length) {
      const shared = targetRefs.filter((ref) => storedRefs.includes(ref))
      if (shared.length) strong.push({ code: 'refNumber', value: shared.join(', ') })
    }

    // 7: company + title in the pasted text, before any AI
    if (targetText && !normComp && !normTitle) {
      const identity = checkCheapIdentity(r.company, r.jobTitle, r.location, r.deadline, targetText)
      if (identity.match) (identity.confidence >= 0.85 ? strong : medium).push(...identity.reasons)
    }

    // 8: after extraction, company + title (+ city)
    if (normComp && normTitle) {
      const rComp = normalizeCompany(r.company)
      const rTitle = normalizeTitle(r.jobTitle)
      const compMatch =
        rComp === normComp || (rComp.length > 4 && normComp.includes(rComp)) || (normComp.length > 4 && rComp.includes(normComp))
      const t1 = new Set(normTitle.split(' '))
      const t2 = new Set(rTitle.split(' ').filter(Boolean))
      const union = new Set([...t1, ...t2]).size
      const titleSim = t1.size && t2.size && union ? intersectionSize(t1, t2) / union : 0

      if (compMatch && titleSim >= 0.85) strong.push({ code: 'companyTitle' })
      else if (compMatch && titleSim >= 0.65) {
        const rLoc = normalizeGermanUmlauts(r.location || '').toLowerCase()
        const qLoc = normalizeGermanUmlauts(query.location || '').toLowerCase()
        if (rLoc && qLoc && rLoc === qLoc) strong.push({ code: 'companyCity', value: r.location })
        else medium.push({ code: 'companySimilarRole' })
      } else if (!compMatch && titleSim >= 0.9) medium.push({ code: 'titleOtherCompany' })
    }

    if (!strong.length && !medium.length) continue
    matches.push({
      id: r.id,
      company: r.company,
      jobTitle: r.jobTitle,
      status: r.status,
      dateAdded: r.dateAdded,
      confidence: strong.length ? 'same_job' : 'possible_duplicate',
      reasons: strong.length ? [...strong, ...medium] : medium,
      similarity
    })
  }

  const rank = (m: DuplicateMatch): number => (m.confidence === 'same_job' ? 1 : 0)
  return matches.sort((a, b) => rank(b) - rank(a) || b.similarity - a.similarity)
}

export interface StoredSignals {
  normalizedUrl: string
  jobId: string
  contentHash: string
  rawText: string
  textFingerprint: string
  refNumbers: string[]
}

/** The signals saved with an application, computed the way the reference app does on create. */
export function computeSignals(link: string, jobDescription: string, rawText: string): StoredSignals {
  const raw = (rawText || jobDescription || '').slice(0, 50_000)
  return {
    normalizedUrl: normalizeUrl(link),
    jobId: extractJobId(link),
    contentHash: computeContentHash(jobDescription),
    rawText: raw,
    textFingerprint: computeTextFingerprint(raw),
    refNumbers: extractReferenceNumbers(`${raw}\n${jobDescription}`)
  }
}
