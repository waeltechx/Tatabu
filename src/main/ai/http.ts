/**
 * HTTP for the OpenAI-compatible APIs. Runs only in the main process, so keys
 * never reach the renderer and the page's CSP can stay `connect-src 'self'`.
 */
import type { ErrorCode } from '@shared/settings'

export type FetchFn = typeof fetch

type AiErrorCode = Extract<ErrorCode, `AI_${string}` | `AUDIO_${string}`>

/** A failed AI call. `message` starts with the code so the renderer can translate it. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    /** The provider's own words, shortened. Never contains the key. */
    readonly detail = '',
    readonly status = 0
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'AiError'
  }
}

export function isAiError(err: unknown, code?: AiErrorCode): err is AiError {
  return err instanceof AiError && (code === undefined || err.code === code)
}

/** Pulls a readable message out of an error body (OpenAI, Groq, Gemini and OpenRouter shapes). */
export function errorDetail(body: unknown): string {
  const pick = (v: unknown): string => (typeof v === 'string' ? v : '')
  let message = ''
  if (Array.isArray(body)) return errorDetail(body[0]) // Gemini sometimes wraps errors in a list
  if (body && typeof body === 'object') {
    const err = (body as { error?: unknown }).error
    message =
      err && typeof err === 'object'
        ? pick((err as { message?: unknown }).message)
        : pick(err) || pick((body as { message?: unknown }).message)
  } else {
    message = pick(body)
  }
  return message.replace(/\s+/g, ' ').trim().slice(0, 240)
}

export function classifyStatus(status: number, detail: string): AiError {
  if (status === 401 || status === 403) return new AiError('AI_AUTH', detail, status)
  if (status === 429) return new AiError('AI_RATE_LIMIT', detail, status)
  if (status === 404) return new AiError('AI_MODEL_MISSING', detail, status)
  if (status === 413) return new AiError('AUDIO_TOO_LARGE', detail, status)
  if (status >= 500) return new AiError('AI_SERVER', detail, status)
  // Some providers answer an unknown model with 400 instead of 404.
  if (/model.{0,40}(not (be )?found|does not exist|decommissioned|not supported|invalid)/i.test(detail)) {
    return new AiError('AI_MODEL_MISSING', detail, status)
  }
  return new AiError('AI_BAD_REQUEST', detail, status)
}

export interface Endpoint {
  baseUrl: string
  key: string
  headers?: Record<string, string>
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Sends one request and returns the parsed JSON body, or throws an AiError. */
export async function aiRequest(
  fetchFn: FetchFn,
  endpoint: Endpoint,
  path: string,
  init: {
    method?: 'GET' | 'POST'
    json?: unknown
    form?: FormData
    timeoutMs: number
  }
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${endpoint.key}`,
    ...endpoint.headers
  }
  let body: string | FormData | undefined
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.json)
  } else if (init.form) {
    body = init.form
  }

  let response: Response
  try {
    response = await fetchFn(joinUrl(endpoint.baseUrl, path), {
      method: init.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      signal: AbortSignal.timeout(init.timeoutMs)
    })
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') throw new AiError('AI_TIMEOUT')
    throw new AiError('AI_NETWORK', err instanceof Error ? err.message.slice(0, 200) : '')
  }

  const text = await response.text().catch(() => '')
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Not JSON (an HTML error page, say); keep the text for the message.
  }
  if (!response.ok) {
    // Some providers quote the key back in the error; never let it travel further.
    const detail = endpoint.key ? errorDetail(parsed).split(endpoint.key).join('[key]') : errorDetail(parsed)
    throw classifyStatus(response.status, detail)
  }
  return parsed
}
