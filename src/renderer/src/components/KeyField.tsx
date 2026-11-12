import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import type { KeyStatus, SecretName } from '@shared/settings'
import { invoke, keys, useErrorToast, useWrite } from '@/lib/api'
import { Button, FieldLabel, TextInput } from '@/components/ui'

/** One API key: masked when saved, with Show / Change / Remove; an input when empty. */
export function KeyField({
  name,
  status,
  label,
  placeholder,
  disabled,
  saveLabel,
  compact,
  className
}: {
  name: SecretName
  status: KeyStatus
  label: string
  placeholder: string
  disabled?: boolean
  saveLabel?: string
  /** Narrow places: no Show/Change buttons once saved, only the masked key. */
  compact?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const onError = useErrorToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const write = useWrite(keys.settings, (n: SecretName, v: string | null) => invoke('secrets:set', n, v))

  useEffect(() => setRevealed(null), [status.masked])

  const showInput = !status.set || editing

  function save(): void {
    const value = draft.trim()
    if (!value) return
    write.mutate([name, value], {
      onSuccess: () => {
        setDraft('')
        setEditing(false)
        toast.success(t('settings.ai.keySaved'))
      }
    })
  }

  function remove(): void {
    write.mutate([name, null], {
      onSuccess: () => {
        setEditing(false)
        toast.success(t('settings.ai.keyRemoved'))
      }
    })
  }

  async function toggleReveal(): Promise<void> {
    if (revealed !== null) return setRevealed(null)
    try {
      setRevealed(await invoke('secrets:reveal', name))
    } catch (err) {
      onError(err)
    }
  }

  return (
    <div className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {showInput ? (
        <form
          className="flex items-center gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="relative min-w-0 flex-1">
            <KeyRound size={16} className="pointer-events-none absolute start-[11px] top-1/2 -translate-y-1/2 text-muted" />
            <TextInput
              id={id}
              type="password"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              disabled={disabled || write.isPending}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className="ps-9 font-mono text-[12px]"
            />
          </div>
          <Button type="submit" variant="primary" disabled={disabled || !draft.trim() || write.isPending}>
            {saveLabel ?? t('common.save')}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={() => (setEditing(false), setDraft(''))}>
              {t('common.cancel')}
            </Button>
          )}
        </form>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <div
              id={id}
              dir="ltr"
              className="flex h-[42px] min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-card border-ui border-soft bg-field px-[11px] font-mono text-[12px] whitespace-nowrap"
            >
              <KeyRound size={16} className="shrink-0 text-muted" />
              <span className="truncate select-all">{revealed ?? status.masked}</span>
            </div>
            {!compact && (
              <>
                <Button onClick={() => void toggleReveal()}>
                  {revealed !== null ? <EyeOff /> : <Eye />}
                  {revealed !== null ? t('settings.ai.hide') : t('settings.ai.show')}
                </Button>
                <Button onClick={() => setEditing(true)}>{t('settings.ai.change')}</Button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={write.isPending}
            className="mt-2 cursor-pointer text-[11.5px] text-muted underline underline-offset-[3px] hover:text-ink"
          >
            {t('settings.ai.remove')}
          </button>
        </>
      )}
    </div>
  )
}
