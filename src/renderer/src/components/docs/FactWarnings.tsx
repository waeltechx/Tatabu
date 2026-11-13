import { useTranslation } from 'react-i18next'
import { CircleCheck, Crosshair, LoaderCircle, TriangleAlert, Wand2 } from 'lucide-react'
import type { FactWarning } from '@shared/verify'
import { Button } from '@/components/ui'

/** One card per flagged item: everything about it that didn't check out. */
export interface WarningGroup {
  itemId: string
  text: string
  warnings: FactWarning[]
}

export function groupWarnings(warnings: FactWarning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const w of warnings) {
    const g = groups.get(w.itemId) ?? { itemId: w.itemId, text: w.text, warnings: [] }
    g.warnings.push(w)
    groups.set(w.itemId, g)
  }
  return [...groups.values()]
}

/** A warning's token in words: months become their name. */
export function describeToken(w: FactWarning, lang: string): string {
  if (w.reason === 'date') {
    const m = Number(w.token)
    if (m >= 1 && m <= 12) return new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2000, m - 1, 1))
  }
  return w.token
}

/** What to tell "Fix it" about an item's problems. */
export function problemNotes(group: WarningGroup, lang = 'en'): string[] {
  return group.warnings.map((w) => `${describeToken(w, lang)} (${w.reason.replace('_', ' ')})`)
}

/**
 * The warning list that sits beside AI-written text. Warnings never block
 * anything: "Show me" jumps to the text, "Fix it" asks the AI to rewrite just
 * that item from its sources, "Keep it" dismisses the warning.
 */
export function FactWarnings({
  warnings,
  source = 'cv',
  busyItem,
  onShow,
  onFix,
  onKeep,
  canFix
}: {
  warnings: FactWarning[]
  /** What the facts are checked against: the master CV, or the uploaded file. */
  source?: 'cv' | 'file'
  busyItem?: string | null
  onShow: (group: WarningGroup) => void
  onFix?: (group: WarningGroup) => void
  onKeep: (group: WarningGroup) => void
  canFix?: (group: WarningGroup) => boolean
}) {
  const { t, i18n } = useTranslation()
  const groups = groupWarnings(warnings)

  if (!groups.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-card border-ui border-paper-ink bg-green px-3.5 py-3 text-[12.5px] font-medium text-paper-ink">
        <CircleCheck size={16} className="shrink-0" />
        {source === 'file' ? t('facts.allGoodFile') : t('facts.allGood')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        <TriangleAlert size={16} className="text-[#a3352a] dark:text-[#f19a8c]" />
        {t('facts.count', { count: groups.length })}
      </div>
      <p className="text-[12px] leading-relaxed text-muted">{source === 'file' ? t('facts.introFile') : t('facts.intro')}</p>
      {groups.map((g) => {
        const missing = g.warnings.filter(
          (w) => w.reason !== 'no_source' && w.reason !== 'translation' && w.reason !== 'unknown_source'
        )
        const unsourced = g.warnings.filter((w) => w.reason === 'no_source' || w.reason === 'unknown_source')
        const translated = g.warnings.filter((w) => w.reason === 'translation')
        // Each token is isolated so a Latin word inside Arabic text keeps its quotes in place.
        const [open, close] = i18n.language === 'ar' ? ['«', '»'] : ['“', '”']
        const list = (ws: FactWarning[]): string =>
          ws.map((w) => `${open}⁨${describeToken(w, i18n.language)}⁩${close}`).join(i18n.language === 'ar' ? '، ' : ', ')
        const busy = busyItem === g.itemId
        return (
          <div key={g.itemId} className="rounded-card border-ui border-paper-ink bg-pink px-3 py-2.5 text-paper-ink">
            {missing.length > 0 && (
              <div className="text-[12px] font-semibold">
                {t(source === 'file' ? 'facts.notInFile' : 'facts.notInCv', { list: list(missing) })}
              </div>
            )}
            {unsourced.length > 0 && (
              <div className="text-[12px] font-semibold">{t('facts.noSource', { list: list(unsourced) })}</div>
            )}
            {translated.length > 0 && (
              <div className="text-[12px] font-semibold">{t('facts.badTranslation', { list: list(translated) })}</div>
            )}
            <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-snug opacity-80" dir="auto">
              {g.text}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="paper" onClick={() => onShow(g)}>
                <Crosshair />
                {t('facts.showMe')}
              </Button>
              {onFix && (!canFix || canFix(g)) && (
                <Button size="sm" variant="paper" disabled={busy} onClick={() => onFix(g)}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
                  {t('facts.fixIt')}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="!text-paper-ink underline" onClick={() => onKeep(g)}>
                {t('facts.keep')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** "Show me" for a form: scrolls to the field holding the item, selects the first flagged token and flashes it. */
export function showField(selector: string, token?: string): void {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.focus({ preventScroll: true })
  if (token) {
    const i = el.value.toLocaleLowerCase().indexOf(token.toLocaleLowerCase())
    if (i >= 0) el.setSelectionRange(i, i + token.length)
  }
  el.classList.add('fact-flash')
  window.setTimeout(() => el.classList.remove('fact-flash'), 1800)
}
