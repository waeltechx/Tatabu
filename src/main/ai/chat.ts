/**
 * Chat calls, plain and structured.
 *
 * Structured output follows the reference app: ask for the JSON Schema
 * (`json_schema`), fall back to `json_object`, then to the prompt alone when a
 * provider or model refuses a mode; validate with zod and allow one repair turn.
 */
import { z } from 'zod'
import type { ProviderId } from '@shared/ai'
import { AiError, aiRequest, isAiError, type FetchFn } from './http'
import { PROVIDERS } from './providers'

export interface ChatTarget {
  provider: ProviderId
  key: string
  model: string
}

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Images as data URLs ("data:image/png;base64,…"), sent with the user message. */
  images?: string[]
}

export type JsonMode = 'json_schema' | 'json_object' | 'prompt'
const MODES: JsonMode[] = ['json_schema', 'json_object', 'prompt']

/** What each provider/model turned out not to accept, learned at run time. */
interface Quirks {
  noTemperature?: boolean
  tokenParam?: 'max_tokens' | 'max_completion_tokens' | 'none'
  jsonMode?: JsonMode
}
const quirks = new Map<string, Quirks>()
const quirkKey = (t: ChatTarget): string => `${t.provider}:${t.model}`

/** For tests. */
export function resetQuirks(): void {
  quirks.clear()
}

const DEFAULT_TIMEOUT_MS = 90_000

function userMessage(text: string, images: string[] = []): Message {
  if (!images.length) return { role: 'user', content: text }
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      ...images.map((url) => ({
        type: 'image_url' as const,
        image_url: { url }
      }))
    ]
  }
}

/** Removes a parameter the provider refused, if the error names one we can drop. Returns true if it did. */
function learnFromRefusal(q: Quirks, detail: string): boolean {
  const unsupported = /unsupported|not supported|does not support|only the default|not allowed|unrecognized|unknown/i
  if (/temperature/i.test(detail) && unsupported.test(detail) && !q.noTemperature) {
    q.noTemperature = true
    return true
  }
  if (/max_completion_tokens/i.test(detail) && q.tokenParam === 'max_completion_tokens') {
    q.tokenParam = 'none'
    return true
  }
  if (/max_tokens/i.test(detail) && (q.tokenParam ?? 'max_tokens') === 'max_tokens') {
    q.tokenParam = 'max_completion_tokens'
    return true
  }
  return false
}

const JSON_MODE_REFUSED = /response_format|json_schema|json_object|structured output|json mode/i
const JSON_GENERATION_FAILED = /json_validate_failed|failed to generate json|failed_generation/i

/** One chat completion. Retries only to drop parameters the model refused. */
async function complete(
  fetchFn: FetchFn,
  target: ChatTarget,
  messages: Message[],
  opts: ChatOptions,
  responseFormat?: unknown
): Promise<string> {
  const spec = PROVIDERS[target.provider]
  const q = quirks.get(quirkKey(target)) ?? {}
  quirks.set(quirkKey(target), q)

  for (let attempt = 0; attempt < 4; attempt++) {
    const body: Record<string, unknown> = { model: target.model, messages }
    if (!q.noTemperature) body['temperature'] = opts.temperature ?? 0
    const tokenParam = q.tokenParam ?? (target.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens')
    if (tokenParam !== 'none') body[tokenParam] = opts.maxTokens ?? 4096
    if (responseFormat) body['response_format'] = responseFormat

    try {
      const reply = await aiRequest(
        fetchFn,
        { baseUrl: spec.baseUrl, key: target.key, headers: spec.headers },
        'chat/completions',
        { json: body, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS }
      )
      return readContent(reply)
    } catch (err) {
      if (isAiError(err, 'AI_BAD_REQUEST') && learnFromRefusal(q, err.detail)) continue
      throw err
    }
  }
  throw new AiError('AI_BAD_REQUEST')
}

function readContent(reply: unknown): string {
  const choices = reply && typeof reply === 'object' ? (reply as { choices?: unknown }).choices : null
  const first = Array.isArray(choices) ? (choices[0] as { message?: { content?: unknown } } | undefined) : undefined
  const content = first?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((p) => (p && typeof p === 'object' && 'text' in p ? String(p.text) : '')).join('')
  }
  return ''
}

/** Strips code fences and keeps the outermost {...} (port of the reference `_extract_json`). */
export function extractJson(raw: string): string {
  let text = raw.trim()
  const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/)
  if (fenced?.[1] !== undefined) text = fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : text
}

/** Plain text reply, with surrounding code fences removed. */
export async function chatText(
  fetchFn: FetchFn,
  target: ChatTarget,
  system: string,
  user: string,
  opts: ChatOptions = {}
): Promise<string> {
  const messages: Message[] = [{ role: 'system', content: system }, userMessage(user, opts.images)]
  const raw = (await complete(fetchFn, target, messages, { temperature: 0.5, ...opts })).trim()
  if (!raw) throw new AiError('AI_INVALID_OUTPUT', 'empty reply')
  const fenced = raw.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/)
  return fenced?.[1] !== undefined ? fenced[1].trim() : raw
}

/** The JSON Schema we send: zod's export without the `$schema` marker some providers reject. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

export interface JsonResult<T> {
  data: T
  mode: JsonMode
  repaired: boolean
}

type Check<T> = { ok: true; data: T } | { ok: false; issues: string }

function validate<T>(schema: z.ZodType<T>, raw: string): Check<T> {
  if (!raw.trim()) return { ok: false, issues: 'The reply was empty.' }
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch {
    return { ok: false, issues: 'The reply was not valid JSON.' }
  }
  const result = schema.safeParse(parsed)
  return result.success ? { ok: true, data: result.data } : { ok: false, issues: z.prettifyError(result.error).slice(0, 1500) }
}

/** A reply that must match `schema`. Throws AI_INVALID_OUTPUT if it still doesn't after one repair. */
export async function chatJson<T>(
  fetchFn: FetchFn,
  target: ChatTarget,
  req: {
    system: string
    user: string
    schema: z.ZodType<T>
    schemaName: string
  } & ChatOptions
): Promise<JsonResult<T>> {
  const jsonSchema = jsonSchemaFor(req.schema)
  const system =
    `${req.system}\n\nReturn ONLY a single JSON object that conforms to this JSON Schema. ` +
    `No prose, no markdown, no code fences.\n${JSON.stringify(jsonSchema)}`
  const q = quirks.get(quirkKey(target)) ?? {}
  quirks.set(quirkKey(target), q)

  const formatFor = (mode: JsonMode): unknown =>
    mode === 'json_schema'
      ? {
          type: 'json_schema',
          json_schema: {
            name: req.schemaName,
            schema: jsonSchema,
            strict: false
          }
        }
      : mode === 'json_object'
        ? { type: 'json_object' }
        : undefined

  const messages: Message[] = [{ role: 'system', content: system }, userMessage(req.user, req.images)]

  // Ask in the best mode the model accepts.
  let mode = q.jsonMode ?? 'json_schema'
  let raw: string
  for (;;) {
    try {
      raw = await complete(fetchFn, target, messages, req, formatFor(mode))
      break
    } catch (err) {
      if (isAiError(err, 'AI_BAD_REQUEST') && JSON_GENERATION_FAILED.test(err.detail)) {
        raw = '' // The provider rejected its own output; treat it as invalid and repair below.
        break
      }
      const next = MODES[MODES.indexOf(mode) + 1]
      if (isAiError(err, 'AI_BAD_REQUEST') && next && JSON_MODE_REFUSED.test(err.detail)) {
        mode = next
        continue
      }
      throw err
    }
  }
  q.jsonMode = mode

  const first = validate(req.schema, raw)
  if (first.ok) return { data: first.data, mode, repaired: false }

  // One repair turn: show the model what was wrong.
  const repairMessages: Message[] = [
    ...messages,
    ...(raw.trim() ? [{ role: 'assistant' as const, content: raw }] : []),
    {
      role: 'user',
      content: `Your reply did not match the JSON Schema:\n${first.issues}\n\nReply again with only the corrected JSON object.`
    }
  ]
  let second: Check<T>
  try {
    second = validate(req.schema, await complete(fetchFn, target, repairMessages, req, formatFor(mode)))
  } catch (err) {
    if (isAiError(err, 'AI_BAD_REQUEST') && JSON_GENERATION_FAILED.test(err.detail)) {
      throw new AiError('AI_INVALID_OUTPUT', first.issues.slice(0, 240))
    }
    throw err
  }
  if (second.ok) return { data: second.data, mode, repaired: true }
  throw new AiError('AI_INVALID_OUTPUT', second.issues.slice(0, 240))
}
