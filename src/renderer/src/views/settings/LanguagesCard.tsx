import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { invoke, keys, useLanguages, useWrite } from '@/lib/api'
import { Card } from '@/components/ui'

export function LanguagesCard() {
  const { t } = useTranslation()
  const { data: languages = [] } = useLanguages()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const add = useWrite(keys.languages, (n: string) => invoke('languages:add', n))
  const remove = useWrite(keys.languages, (id: string) => invoke('languages:remove', id))

  function submit(): void {
    if (!name.trim()) return setAdding(false)
    add.mutate([name], {
      onSuccess: () => {
        setName('')
        setAdding(false)
      }
    })
  }

  return (
    <Card number="04" label={t('settings.langs.label')} title={t('settings.langs.title')} description={t('settings.langs.desc')}>
      <div className="flex flex-wrap gap-2">
        {languages.map((l) => (
          <span
            key={l.id}
            dir={l.dir}
            className="flex h-9 items-center gap-2 rounded-card border-ui border-strong bg-surface px-3 text-[12.5px] font-medium"
          >
            {l.name}
            {l.builtin ? (
              <span className="font-mono text-[9px] text-muted uppercase">{t('settings.langs.default')}</span>
            ) : (
              <button
                type="button"
                onClick={() => remove.mutate([l.id])}
                title={t('settings.langs.remove', { name: l.name })}
                aria-label={t('settings.langs.remove', { name: l.name })}
                className="cursor-pointer text-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </span>
        ))}

        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setName('')
                  setAdding(false)
                }
              }}
              placeholder={t('settings.langs.placeholder')}
              aria-label={t('settings.langs.add')}
              className="h-9 w-44 rounded-card border-ui border-strong bg-field px-3 text-[12.5px] outline-none placeholder:text-muted"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-card border-ui border-dashed border-muted px-3 text-[12.5px] font-medium text-muted hover:text-ink"
          >
            <Plus size={14} />
            {t('settings.langs.add')}
          </button>
        )}
      </div>
    </Card>
  )
}
