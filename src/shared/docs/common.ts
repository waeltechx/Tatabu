/**
 * Building blocks shared by every printable document (references, cover letters, CVs).
 * Templates are plain functions that return HTML + CSS, so the renderer can preview
 * exactly what the main process prints to PDF.
 */
import type { DocLanguage } from '../settings'

export interface DocHtml {
  /** Page title, also the PDF title. */
  title: string
  css: string
  body: string
  dir: 'ltr' | 'rtl'
  lang: string
}

export function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Non-empty trimmed lines. */
export function lines(text: string): string[] {
  return (text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Only images we produced ourselves (PNG/JPEG data URLs) may go into a document. */
export function safeImage(dataUrl: string): string {
  return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl ?? '') ? dataUrl : ''
}

// --- languages ---------------------------------------------------------------

/** Common language names (as a user might type them) → ISO 639-1 codes. */
const NAME_TO_CODE: Record<string, string> = {
  english: 'en',
  arabic: 'ar',
  العربية: 'ar',
  german: 'de',
  deutsch: 'de',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
  italian: 'it',
  italiano: 'it',
  portuguese: 'pt',
  português: 'pt',
  dutch: 'nl',
  nederlands: 'nl',
  turkish: 'tr',
  türkçe: 'tr',
  turkce: 'tr',
  persian: 'fa',
  farsi: 'fa',
  فارسی: 'fa',
  urdu: 'ur',
  hebrew: 'he',
  polish: 'pl',
  polski: 'pl',
  swedish: 'sv',
  svenska: 'sv',
  norwegian: 'no',
  norsk: 'no',
  danish: 'da',
  dansk: 'da',
  finnish: 'fi',
  suomi: 'fi',
  russian: 'ru',
  русский: 'ru',
  ukrainian: 'uk',
  greek: 'el',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  hindi: 'hi',
  indonesian: 'id',
  malay: 'ms'
}

/** A BCP 47 code for a document language, for dates and the `lang` attribute. */
export function languageCode(lang: Pick<DocLanguage, 'id' | 'name'>): string {
  if (/^[a-z]{2,3}$/.test(lang.id)) return lang.id
  const key = lang.name.trim().toLocaleLowerCase()
  return NAME_TO_CODE[key] ?? NAME_TO_CODE[lang.id] ?? 'en'
}

export interface DocLabels {
  references: string
  application: string
  forRole: (role: string, company: string) => string
  relationship: string
  email: string
  phone: string
  address: string
  subject: string
  enclosures: string
  page: string
  date: string
  coverLetter: string
  cv: string
}

const EN: DocLabels = {
  references: 'References',
  application: 'Application',
  forRole: (role, company) =>
    role && company
      ? `For the ${role} position at ${company}`
      : role
        ? `For the ${role} position`
        : company
          ? `Application to ${company}`
          : '',
  relationship: 'Relationship',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  subject: 'Subject',
  enclosures: 'Enclosures',
  page: 'Page',
  date: 'Date',
  coverLetter: 'Cover letter',
  cv: 'CV'
}

const LABELS: Record<string, DocLabels> = {
  en: EN,
  ar: {
    references: 'المراجع',
    application: 'طلب التوظيف',
    forRole: (role, company) =>
      role && company ? `لوظيفة ${role} لدى ${company}` : role ? `لوظيفة ${role}` : company ? `طلب توظيف لدى ${company}` : '',
    relationship: 'صلة المعرفة',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    address: 'العنوان',
    subject: 'الموضوع',
    enclosures: 'المرفقات',
    page: 'صفحة',
    date: 'التاريخ',
    coverLetter: 'رسالة التقديم',
    cv: 'السيرة الذاتية'
  },
  de: {
    references: 'Referenzen',
    application: 'Bewerbung',
    forRole: (role, company) =>
      role && company
        ? `Für die Position ${role} bei ${company}`
        : role
          ? `Für die Position ${role}`
          : company
            ? `Bewerbung bei ${company}`
            : '',
    relationship: 'Beziehung',
    email: 'E-Mail',
    phone: 'Telefon',
    address: 'Adresse',
    subject: 'Betreff',
    enclosures: 'Anlagen',
    page: 'Seite',
    date: 'Datum',
    coverLetter: 'Anschreiben',
    cv: 'Lebenslauf'
  }
}

/** Fixed labels in the document's language; unknown languages fall back to English (or AI-supplied overrides). */
export function docLabels(code: string, overrides?: Partial<Record<keyof DocLabels, string>>): DocLabels {
  const base = LABELS[code] ?? EN
  if (!overrides) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(overrides)) {
    if (k !== 'forRole' && typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k] = v.trim()
  }
  return out
}

/** "13 November 2026", "13.11.2026" (German), "13 نوفمبر 2026" — Latin digits everywhere. */
export function formatDocDate(date: Date, code: string): string {
  if (code === 'de') {
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
  }
  const locale = code === 'ar' ? 'ar-u-nu-latn' : code === 'en' ? 'en-GB' : `${code}-u-nu-latn`
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  }
}

// --- page CSS ----------------------------------------------------------------

/** Fonts bundled with the app; Arabic falls back to IBM Plex Sans Arabic automatically. */
export const DOC_FONT = "'Inter', 'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif"
export const DOC_FONT_HEAD = "'Space Grotesk', 'IBM Plex Sans Arabic', 'Inter', 'Noto Sans Arabic', sans-serif"

export function pageCss(paper: 'A4' | 'Letter' = 'A4', margin = '22mm 20mm 20mm 22mm'): string {
  return `
  @page { size: ${paper}; margin: ${margin}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: ${DOC_FONT}; color: #1d2433; font-size: 10.5pt; line-height: 1.5;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  p { margin: 0; }
  .doc { width: 100%; }
  `
}
