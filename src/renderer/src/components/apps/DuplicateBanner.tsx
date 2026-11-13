import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { DuplicateMatch } from '@shared/applications'
import { formatDate } from '@/lib/apps'
import { usePrefs } from '@/lib/prefs'

/** "Possible duplicate": the best match, why it matched, and the two ways out. */
export function DuplicateBanner({ match, onDismiss }: { match: DuplicateMatch; onDismiss: () => void }) {
  const { t } = useTranslation()
  const { prefs } = usePrefs()
  // The strongest few reasons are enough to judge it.
  const reasons = match.reasons
    .slice(0, 3)
    .map((r) => t(`dup.reason.${r.code}`, { value: r.code === 'refNumber' ? (r.value ?? '').toUpperCase() : (r.value ?? '') }))
  return (
    <div
      role="alert"
      className="mt-5 rounded-card border-ui border-strong bg-[color-mix(in_srgb,var(--yellow)_38%,var(--surface))] px-4 py-3.5"
    >
      <b className="block text-[13.5px] font-semibold">
        ! {match.confidence === 'same_job' ? t('dup.sameJob') : t('dup.possible')}
      </b>
      <p className="mt-1.5 text-[12.5px] text-muted">
        {t('dup.added', {
          name: [match.company, match.jobTitle].filter(Boolean).join(' · '),
          date: formatDate(match.dateAdded, prefs.language, false),
          status: t(`status.${match.status}`)
        })}
      </p>
      <p className="mt-1 text-[11.5px] text-muted">{reasons.join(' · ')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link
          to={`/applications/${match.id}`}
          className="inline-flex h-[40px] items-center gap-1.5 rounded-card border-ui border-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink no-underline hover:bg-field"
        >
          {t('dup.open')}
          <ArrowUpRight size={15} className="rtl:-scale-x-100" />
        </Link>
        <button type="button" onClick={onDismiss} className="cursor-pointer text-[12.5px] font-semibold text-ink hover:underline">
          {t('dup.continue')}
        </button>
      </div>
    </div>
  )
}
