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
    <div className="flex flex-wrap items-center gap-2">
      {value.map((req) => (
        <span
          key={req}
          dir="auto"
          className={clsx(
            'inline-flex h-[28px] items-center gap-1.5 rounded-[6px] border-ui ps-2.5 pe-1.5 text-[11.5px] font-medium',
            tone === 'purple' ? 'border-paper-ink bg-purple text-paper-ink' : 'border-strong bg-surface text-ink'
          )}
        >
          {req}
          <button
            type="button"
            onClick={() => onChange(value.filter((r) => r !== req))}
            aria-label={t('apps.removeRequirement', { name: req })}
            className="flex size-4 cursor-pointer items-center justify-center rounded-sm opacity-60 hover:opacity-100"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <span className="inline-flex h-[28px] items-center gap-1 rounded-[6px] border-ui border-dashed border-soft bg-field ps-2 pe-1">
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
