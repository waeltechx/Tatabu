import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { STATUSES, type Status } from '@shared/applications'
import { STATUS_TONE } from '@/lib/apps'

/** A coloured status pill that is also a dropdown. */
export function StatusSelect({
  value,
  onChange,
  size = 'sm',
  disabled,
  className
}: {
  value: Status
  onChange: (status: Status) => void
  size?: 'sm' | 'lg'
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <span className={clsx('relative inline-flex', className)} onClick={(e) => e.stopPropagation()}>
      <select
        value={value}
        disabled={disabled}
        aria-label={t('apps.status')}
        onChange={(e) => onChange(e.target.value as Status)}
        className={clsx(
          'cursor-pointer appearance-none rounded-[6px] border-ui border-paper-ink font-medium text-paper-ink outline-none',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default',
          size === 'sm'
            ? 'h-[26px] min-w-[128px] ps-2.5 pe-7 text-[11.5px]'
            : 'h-[40px] min-w-[150px] ps-3.5 pe-9 text-[13px] font-semibold shadow-hard',
          STATUS_TONE[value]
        )}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={size === 'sm' ? 13 : 15}
        className={clsx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-paper-ink',
          size === 'sm' ? 'end-2' : 'end-3'
        )}
      />
    </span>
  )
}

/** The read-only pill used in lists. */
export function StatusPill({ status }: { status: Status }) {
  const { t } = useTranslation()
  return (
    <span
      className={clsx(
        'inline-flex h-[22px] min-w-[92px] items-center rounded-[5px] border-ui border-paper-ink px-2 text-[11px] font-medium text-paper-ink',
        STATUS_TONE[status]
      )}
    >
      {t(`status.${status}`)}
    </span>
  )
}
