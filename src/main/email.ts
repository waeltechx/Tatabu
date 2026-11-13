/** Email status: reads a pasted email and suggests an application and status. Nothing is saved here. */
import { PROVIDER_NAMES, type ProviderId } from '@shared/ai'
import type { EmailAnalysis } from '@shared/email'
import { getDb } from './services'
import { listApplications } from './repo/applications'
import { readPrefs } from './prefs'
import { runJson, textTarget } from './ai/service'
import { cleanEmailResult, EmailResult, emailSystem, emailUser } from './ai/tasks/email'

export async function analyzeEmail(text: string, override?: ProviderId): Promise<EmailAnalysis> {
  if (!String(text ?? '').trim()) throw new Error('TEXT_EMPTY')
  const apps = listApplications(getDb())
  if (!apps.length) throw new Error('NO_APPLICATIONS')
  const candidates = apps.map((a) => ({ id: a.id, company: a.company, job_title: a.jobTitle, status: a.status }))
  const target = textTarget(override)
  const result = await runJson(
    {
      system: emailSystem(readPrefs().language === 'ar' ? 'Arabic' : 'English'),
      user: emailUser(String(text), candidates),
      schema: EmailResult,
      schemaName: 'email_result',
      temperature: 0.1
    },
    override
  )
  return {
    ...cleanEmailResult(result.data, new Set(apps.map((a) => a.id))),
    provider: PROVIDER_NAMES[target.provider],
    model: target.model
  }
}
