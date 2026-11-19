import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { clsx } from 'clsx'

/** Requirement chips: × removes one, the small field adds one (Enter or comma). */
export function RequirementsEditor({
  value,
  onChange,
  tone = 'plain'
}: {
  value: string[]
  onChange: (next: string[]) => void
  tone?: 'plain' | 'purple'
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  function add(): void {
    const items = draft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s))
    if (items.length) onChange([...value, ...items])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((req) => (
        <span
          key={req}
          dir="auto"
          className={clsx(
            'inline-flex h-7 items-center gap-0.5 rounded-[6px] border-ui ps-2.5 pe-0.5 text-[11.5px] font-medium',
            tone === 'purple' ? 'border-paper-ink bg-purple text-paper-ink' : 'border-strong bg-surface text-ink'
          )}
        >
          {req}
          <button
            type="button"
            onClick={() => onChange(value.filter((r) => r !== req))}
            aria-label={t('apps.removeRequirement', { name: req })}
            // 24px hit area inside the 28px chip.
            className="flex size-6 cursor-pointer items-center justify-center rounded-[5px] opacity-60 hover:bg-current/10 hover:opacity-100 focus-visible:opacity-100"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <span className="inline-flex h-7 items-center gap-1 rounded-[6px] border-ui border-dashed border-soft bg-field ps-2 pe-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder={t('apps.addRequirement')}
          className="w-[110px] bg-transparent text-[11.5px] outline-none placeholder:text-muted"
        />
        <Plus size={13} className="text-muted" aria-hidden />
      </span>
    </div>
  )
}
