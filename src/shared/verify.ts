/**
 * The fact checker. Pure code, no AI.
 *
 * AI output comes as items (a bullet, a sentence, a skill…), each citing the
 * source keys it was built from. Each item is checked against *its own* sources:
 *
 *   - numbers and dates are normalised (Arabic-Indic digits, month names in
 *     several languages, numeric date formats, number words) and must appear in
 *     a cited source;
 *   - names, tools and acronyms must appear in a cited source, verbatim or as a
 *     translation/transliteration the AI declared for a string in that source;
 *   - "exact" items (a skill, an employer field) must equal a cited value.
 *
 * The result is a list of warnings. Warnings never block anything.
 */

export interface Translation {
  /** The string as it is in the source. */
  source: string
  /** How it appears in the output. */
  target: string
}

export interface FactItem {
  /** Where the item lives in the output, e.g. "e1.b2" or "p3.s1". Used by "Show me". */
  id: string
  text: string
  /** Source keys the AI says this item came from. */
  sources: string[]
  translations?: Translation[]
  /** The whole text must match a cited value (skills, organisations, titles). */
  exact?: boolean
}

export type WarningReason = 'no_source' | 'unknown_source' | 'number' | 'date' | 'name' | 'translation' | 'exact'

export interface FactWarning {
  id: string
  itemId: string
  /** The item text, so the UI can find and highlight it. */
  text: string
  reason: WarningReason
  /** The part that didn't check out (a number, a name, a month…). */
  token: string
}

export interface VerifyOptions {
  /** Language of the output (ISO 639-1). Decides whether capital letters mark names. */
  language: string
  /** Strings the output may name without a source: the company, role, contact person… */
  context?: string[]
}

// --- normalising -------------------------------------------------------------------

const DIGITS: Record<string, string> = {}
for (let i = 0; i < 10; i++) {
  DIGITS[String.fromCharCode(0x0660 + i)] = String(i) // Arabic-Indic
  DIGITS[String.fromCharCode(0x06f0 + i)] = String(i) // Extended (Persian, Urdu)
  DIGITS[String.fromCharCode(0x0966 + i)] = String(i) // Devanagari
}

/** Latin digits, Latin separators, plain spaces, no tatweel or Arabic diacritics. */
export function normalizeText(text: string): string {
  return (text ?? '')
    .replace(/[٠-٩۰-۹०-९]/g, (d) => DIGITS[d] ?? d)
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, ',') // Arabic thousands separator
    .replace(/،/g, ',') // Arabic comma
    .replace(/[ً-ٰٟـ]/g, '') // harakat, superscript alef, tatweel
    .replace(/[‐-―−]/g, '-')
    .replace(/[  -​ ]/g, ' ')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '') // direction marks
}

/** Letters and digits only, lower case: for loose "does this appear" checks. */
function fold(text: string): string {
  return normalizeText(text)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
}

const MONTHS: Array<[number, string[]]> = [
  [
    1,
    [
      'january',
      'jan',
      'januar',
      'jänner',
      'janvier',
      'janv',
      'enero',
      'gennaio',
      'janeiro',
      'januari',
      'ocak',
      'يناير',
      'كانون الثاني',
      'جانفي'
    ]
  ],
  [
    2,
    [
      'february',
      'feb',
      'februar',
      'février',
      'fevrier',
      'févr',
      'febrero',
      'febbraio',
      'fevereiro',
      'februari',
      'şubat',
      'subat',
      'فبراير',
      'شباط',
      'فيفري'
    ]
  ],
  [3, ['march', 'mar', 'märz', 'maerz', 'mars', 'marzo', 'março', 'marco', 'maart', 'mart', 'مارس', 'آذار', 'اذار']],
  [4, ['april', 'apr', 'avril', 'abril', 'aprile', 'nisan', 'أبريل', 'ابريل', 'نيسان', 'أفريل', 'افريل']],
  [5, ['may', 'mai', 'mayo', 'maggio', 'maio', 'mei', 'mayıs', 'mayis', 'مايو', 'أيار', 'ايار', 'ماي']],
  [6, ['june', 'jun', 'juni', 'juin', 'junio', 'giugno', 'junho', 'haziran', 'يونيو', 'يونيه', 'حزيران', 'جوان']],
  [7, ['july', 'jul', 'juli', 'juillet', 'julio', 'luglio', 'julho', 'temmuz', 'يوليو', 'يوليه', 'تموز', 'جويلية']],
  [8, ['august', 'aug', 'août', 'aout', 'agosto', 'augustus', 'ağustos', 'agustos', 'أغسطس', 'اغسطس', 'آب', 'اب', 'أوت', 'اوت']],
  [
    9,
    ['september', 'sep', 'sept', 'septembre', 'septiembre', 'settembre', 'setembro', 'eylül', 'eylul', 'سبتمبر', 'أيلول', 'ايلول']
  ],
  [
    10,
    [
      'october',
      'oct',
      'oktober',
      'okt',
      'octobre',
      'octubre',
      'ottobre',
      'outubro',
      'ekim',
      'أكتوبر',
      'اكتوبر',
      'تشرين الأول',
      'تشرين الاول'
    ]
  ],
  [11, ['november', 'nov', 'novembre', 'noviembre', 'novembro', 'kasım', 'kasim', 'نوفمبر', 'تشرين الثاني']],
  [
    12,
    [
      'december',
      'dec',
      'dezember',
      'dez',
      'décembre',
      'decembre',
      'déc',
      'diciembre',
      'dicembre',
      'dezembro',
      'aralık',
      'aralik',
      'ديسمبر',
      'كانون الأول',
      'كانون الاول'
    ]
  ]
]

/** Longest names first, so "كانون الثاني" wins over a shorter overlap. */
const MONTH_NAMES = MONTHS.flatMap(([n, names]) => names.map((name) => [name, n] as const)).sort(
  (a, b) => b[0].length - a[0].length
)
const SHORT_AMBIGUOUS = new Set([
  'mar',
  'may',
  'mai',
  'jun',
  'jul',
  'dec',
  'aug',
  'sep',
  'oct',
  'nov',
  'jan',
  'feb',
  'apr',
  'mart',
  'ماي',
  'اب',
  'آب'
])

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  fifty: 50,
  hundred: 100,
  eins: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  واحد: 1,
  واحدة: 1,
  اثنان: 2,
  اثنين: 2,
  ثلاث: 3,
  ثلاثة: 3,
  أربع: 4,
  أربعة: 4,
  خمس: 5,
  خمسة: 5,
  ست: 6,
  ستة: 6,
  سبع: 7,
  سبعة: 7,
  ثماني: 8,
  ثمانية: 8,
  تسع: 9,
  تسعة: 9,
  عشر: 10,
  عشرة: 10,
  سنتين: 2,
  سنتان: 2,
  عامين: 2,
  عامان: 2
}

export interface Facts {
  numbers: Set<string>
  months: Set<number>
}

function canonicalNumber(raw: string): string {
  let n = raw
  if (/^\d{1,3}([,.' ]\d{3})+$/.test(n))
    n = n.replace(/[,.' ]/g, '') // 1,200 · 1.200 · 1 200
  else n = n.replace(',', '.')
  if (n.includes('.')) n = n.replace(/0+$/, '').replace(/\.$/, '')
  return n.replace(/^0+(?=\d)/, '')
}

/** Numbers and months a text states, with dates understood in any common form. */
export function extractFacts(text: string): Facts {
  const numbers = new Set<string>()
  const months = new Set<number>()
  let t = ' ' + normalizeText(text).toLocaleLowerCase() + ' '

  // Numeric dates first, so "03/2021" is March 2021 rather than the numbers 3 and 2021.
  const date = (m: string, y: string, mo: string, d?: string): string => {
    if (!(+mo >= 1 && +mo <= 12)) return m
    numbers.add(canonicalNumber(y))
    months.add(+mo)
    if (d) numbers.add(canonicalNumber(d))
    return ' '
  }
  t = t.replace(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/g, (m, y: string, mo: string, d?: string) => date(m, y, mo, d))
  t = t.replace(/\b(?:(\d{1,2})[./])?(\d{1,2})[./](\d{4})\b/g, (m, d: string | undefined, mo: string, y: string) =>
    date(m, y, mo, d)
  )

  // Month names: whole words only; short forms only next to a number ("Mar 2021").
  for (const [name, n] of MONTH_NAMES) {
    const isArabic = /[؀-ۿ]/.test(name)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = isArabic
      ? new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'gu')
      : SHORT_AMBIGUOUS.has(name)
        ? new RegExp(`(^|[^\\p{L}])${escaped}\\.?(?=\\s*'?\\d{2,4}\\b)`, 'gu')
        : new RegExp(`(^|[^\\p{L}])${escaped}\\.?(?=$|[^\\p{L}])`, 'gu')
    t = t.replace(re, (_m, pre: string) => {
      months.add(n)
      return pre + ' '
    })
  }

  for (const m of t.matchAll(/\d+(?:[.,'](?=\d)\d+)*/g)) numbers.add(canonicalNumber(m[0]))
  for (const m of t.matchAll(/[\p{L}]+/gu)) {
    const w = m[0]
    const n = NUMBER_WORDS[w] ?? NUMBER_WORDS[w.replace(/^(وال|ال|و)/, '')]
    if (n !== undefined) numbers.add(String(n))
  }
  return { numbers, months }
}

// --- names -------------------------------------------------------------------------

/** Languages whose capital letters reliably mark names (German capitalises every noun). */
const CASED_NAME_LANGS = new Set(['en', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'cs', 'ro', 'tr', 'id', 'ms'])

const STOP = new Set(
  (
    'i a an the and or of in on at to for with by from as my our your their his her its this that these those ' +
    'dear mr mrs ms miss dr prof sir madam ladies gentlemen hiring manager team sincerely regards kind best yours faithfully truly ' +
    'cv resume curriculum vitae re subject enclosures attachments ps ' +
    'monday tuesday wednesday thursday friday saturday sunday present today current now ' +
    'ich sie wir ihr und der die das mit freundlichen grüßen sehr geehrte geehrter damen herren ' +
    'je nous vous madame monsieur cordialement le la les'
  ).split(' ')
)

/**
 * Words that name something: tools and acronyms (SQL, C++, AWS) everywhere;
 * capitalised words mid-sentence in cased languages; any Latin word inside
 * text written in another script (a tool or company name in an Arabic letter).
 */
export function nameTokens(text: string, language: string): string[] {
  const t = normalizeText(text)
  const out = new Set<string>()
  // Written in another script (Arabic, Cyrillic…): any Latin word in it names something.
  const mostlyOtherScript = (t.match(/[^\P{L}A-Za-zÀ-ɏ]/gu) ?? []).length >= 3
  const cased = CASED_NAME_LANGS.has(language) && !mostlyOtherScript

  // Split into sentences so the first word of each is not mistaken for a name.
  for (const sentence of t.split(/(?<=[.!?:;])\s+|\n+|^\s*[-•*]\s*/m)) {
    const words = [...sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}&+#.'’-]*/gu)].map((m) => m[0].replace(/[.'’-]+$/, ''))
    words.forEach((w, i) => {
      if (!w || STOP.has(w.toLocaleLowerCase())) return
      const latin = /^[A-Za-z0-9][A-Za-z0-9&+#.'’-]*$/.test(w)
      const hasLetter = /\p{L}/u.test(w)
      if (!hasLetter) return
      const acronym = latin && w.length >= 2 && /[A-Z].*[A-Z]|[+#]|\d/.test(w) && !/^\d/.test(w)
      if (acronym) return void out.add(w)
      if (mostlyOtherScript && latin && w.length >= 2) return void out.add(w)
      if (cased && i > 0 && /^\p{Lu}/u.test(w) && w.length >= 2) out.add(w)
    })
  }
  return [...out]
}

// --- the check -----------------------------------------------------------------------

function contains(haystack: string, needle: string): boolean {
  const h = ` ${fold(haystack)} `
  const n = fold(needle)
  return !!n && h.includes(` ${n} `)
}

export function verifyItems(items: FactItem[], sources: Record<string, string>, opts: VerifyOptions): FactWarning[] {
  const warnings: FactWarning[] = []
  const context = (opts.context ?? []).filter(Boolean).join('\n')
  const contextFacts = extractFacts(context)
  const warn = (item: FactItem, reason: WarningReason, token: string): void => {
    if (warnings.some((w) => w.itemId === item.id && w.reason === reason && w.token === token)) return
    warnings.push({ id: `${item.id}:${reason}:${token}`, itemId: item.id, text: item.text, reason, token })
  }

  for (const item of items) {
    const text = item.text ?? ''
    if (!text.trim()) continue
    const cited = item.sources.filter((k) => k in sources)
    for (const k of item.sources) if (!(k in sources)) warn(item, 'unknown_source', k)
    const sourceText = cited.map((k) => sources[k]).join('\n')
    const translations = (item.translations ?? []).filter((t) => t.source?.trim() && t.target?.trim())

    // A declared translation must translate something that is really in the cited sources.
    const goodTranslations = translations.filter((t) => {
      if (contains(sourceText, t.source)) return true
      warn(item, 'translation', t.source)
      return false
    })

    if (item.exact) {
      const ok =
        cited.some((k) => fold(sources[k]!) === fold(text)) ||
        goodTranslations.some((t) => fold(t.target) === fold(text)) ||
        (cited.length > 0 && contains(sourceText, text))
      if (!ok) warn(item, cited.length ? 'exact' : 'no_source', text.trim())
      continue
    }

    // Numbers and dates.
    const have = extractFacts(sourceText + '\n' + goodTranslations.map((t) => t.source).join('\n'))
    const said = extractFacts(text)
    for (const n of said.numbers) {
      if (!have.numbers.has(n) && !contextFacts.numbers.has(n)) warn(item, cited.length ? 'number' : 'no_source', n)
    }
    for (const m of said.months) {
      if (!have.months.has(m) && !contextFacts.months.has(m)) warn(item, cited.length ? 'date' : 'no_source', String(m))
    }

    // Names, tools and acronyms.
    const allowed = sourceText + '\n' + context + '\n' + goodTranslations.map((t) => t.target).join('\n')
    for (const name of nameTokens(text, opts.language)) {
      if (!contains(allowed, name)) warn(item, cited.length ? 'name' : 'no_source', name)
    }
  }
  return warnings
}
