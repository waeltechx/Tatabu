import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/layout/PageHeader'

/** Temporary screen used until each phase builds the real one. */
export function PlaceholderView({ page }: { page: string }) {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader page={page} />
      <section className="rounded-card border-ui border-strong bg-surface p-8">
        <div className="label-mono">Tatabu</div>
        <p className="mt-3 text-[15px] text-muted">{t('common.comingSoon')}</p>
      </section>
    </>
  )
}
