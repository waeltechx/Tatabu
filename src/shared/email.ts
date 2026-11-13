/** Email status: a pasted email → which application it concerns and its new status. Nothing changes until the user confirms. */
import type { Status } from './applications'

/** Longer emails are cut; the part that matters is at the top. */
export const MAX_EMAIL_CHARS = 20_000

export interface EmailAnalysis {
  /** The matched application, or null when nothing matched confidently. */
  applicationId: string | null
  status: Status
  /** 0–1: how sure the model is about both the match and the status. */
  confidence: number
  reasoning: string
  provider: string
  model: string
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}
