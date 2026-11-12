import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { EMPTY_REFEREE, type Referee, type RefereeInput } from '@shared/settings'
import { invoke, keys, useReferees, useWrite } from '@/lib/api'
import { Button, Card, FieldLabel, TextInput, inputClass } from '@/components/ui'

function summary(r: Referee): string {
  return [r.affiliation, r.relationship, r.email].filter(Boolean).join(' · ')
}

export function ReferencesCard() {
  const { t } = useTranslation()
  const { data: referees = [] } = useReferees()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const move = useWrite(keys.referees, (id: string, delta: -1 | 1) => invoke('referees:move', id, delta))

  return (
    <Card number="02" label={t('settings.refs.label')} title={t('settings.refs.title')} description={t('settings.refs.desc')}>
      {referees.length === 0 && editing !== 'new' && (
        <p className="mb-3 rounded-card border-ui border-dashed border-soft px-3 py-4 text-[12.5px] text-muted">
          {t('settings.refs.empty')}
        </p>
      )}

      {referees.map((r, i) =>
        editing === r.id ? (
          <RefereeForm key={r.id} initial={r} onClose={() => setEditing(null)} />
        ) : (
          <div
            key={r.id}
            className="mb-2.5 grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-card border-ui border-soft bg-field p-3"
          >
            <span className="font-mono text-[11px] text-muted" dir="ltr">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <b className="block truncate text-[13px] font-semibold">{r.name}</b>
              <span className="block truncate text-[11.5px] text-muted">{summary(r)}</span>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label={t('settings.refs.moveUp')} disabled={i === 0} onClick={() => move.mutate([r.id, -1])}>
                <ChevronUp size={16} />
              </IconButton>
              <IconButton
                label={t('settings.refs.moveDown')}
                disabled={i === referees.length - 1}
                onClick={() => move.mutate([r.id, 1])}
              >
                <ChevronDown size={16} />
              </IconButton>
              <button
                type="button"
                onClick={() => setEditing(r.id)}
                className="ms-1.5 cursor-pointer text-[12px] font-semibold underline underline-offset-[3px]"
              >
                {t('common.edit')}
              </button>
            </div>
          </div>
        )
      )}

      {editing === 'new' ? (
        <RefereeForm initial={EMPTY_REFEREE} onClose={() => setEditing(null)} />
      ) : (
        <Button className="mt-1" onClick={() => setEditing('new')}>
          <Plus />
          {t('settings.refs.add')}
        </Button>
      )}
    </Card>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 cursor-pointer place-items-center rounded-[5px] text-muted hover:bg-surface hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function RefereeForm({ initial, onClose }: { initial: RefereeInput; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState<RefereeInput>(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = useWrite(keys.referees, (input: RefereeInput) => invoke('referees:save', input))
  const remove = useWrite(keys.referees, (refId: string) => invoke('referees:remove', refId))

  const set = <K extends keyof RefereeInput>(k: K, v: RefereeInput[K]): void => setDraft((d) => ({ ...d, [k]: v }))
  const field = (k: 'name' | 'affiliation' | 'relationship' | 'email' | 'phone', ltr = false, placeholder?: string) => (
    <div>
      <FieldLabel htmlFor={`${id}-${k}`} className="!mt-3">
        {t(`settings.refs.${k}`)}
      </FieldLabel>
      <TextInput
        id={`${id}-${k}`}
        value={draft[k]}
        dir={ltr ? 'ltr' : undefined}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
        autoFocus={k === 'name'}
      />
    </div>
  )

  return (
    <form
      className="mb-2.5 rounded-card border-ui border-strong bg-field p-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate([draft], { onSuccess: onClose })
      }}
    >
      <div className="grid grid-cols-2 gap-x-3">
        {field('name', false, t('settings.refs.namePlaceholder'))}
        {field('affiliation', false, t('settings.refs.affiliationPlaceholder'))}
        {field('relationship', false, t('settings.refs.relationshipPlaceholder'))}
        {field('email', true)}
        {field('phone', true)}
        <div>
          <FieldLabel htmlFor={`${id}-address`} className="!mt-3">
            {t('settings.refs.address')}
          </FieldLabel>
          <textarea
            id={`${id}-address`}
            rows={1}
            value={draft.address}
            onChange={(e) => set('address', e.target.value)}
            className={`${inputClass} h-[42px] resize-y py-2.5`}
          />
        </div>
      </div>
      <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-[12.5px]">
        <input
          type="checkbox"
          checked={draft.includeRelationship}
          onChange={(e) => set('includeRelationship', e.target.checked)}
          className="size-4 accent-[#202329]"
        />
        {t('settings.refs.includeRelationship')}
      </label>
      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!draft.name.trim() || save.isPending}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {draft.id && (
          <Button
            variant="ghost"
            className="ms-auto !text-[#b3261e]"
            disabled={remove.isPending}
            onClick={() => (confirmDelete ? remove.mutate([draft.id!], { onSuccess: onClose }) : setConfirmDelete(true))}
          >
            {confirmDelete ? t('settings.refs.confirmDelete') : t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  )
}
