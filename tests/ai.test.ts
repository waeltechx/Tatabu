/**
 * The AI layer against recorded-style provider replies (invented fixtures,
 * shaped like real Groq / Gemini / OpenAI / OpenRouter responses). No network.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AiError, aiRequest, classifyStatus, errorDetail, type FetchFn } from '../src/main/ai/http'
import { chatJson, chatText, extractJson, jsonSchemaFor, resetQuirks, type ChatTarget } from '../src/main/ai/chat'
import { isChatModel, parseModelList, pickDefaultModel, visionCandidates } from '../src/main/ai/providers'
import { testProvider } from '../src/main/ai/check'
import { audioType, MAX_AUDIO_BYTES, transcribe } from '../src/main/ai/voice'
import { otherTextProvider, textProvider } from '@shared/ai'
import type { KeyStatus, SecretName } from '@shared/settings'

// --- a scripted fetch ---------------------------------------------------------

interface Sent {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
  form: FormData | null
}

type Reply = { status?: number; json?: unknown; text?: string } | Error

function scriptedFetch(...replies: Reply[]): { fetch: FetchFn; sent: Sent[] } {
  const sent: Sent[] = []
  const queue = [...replies]
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      form: init.body instanceof FormData ? init.body : null
    })
    const next = queue.shift()
    if (!next) throw new Error(`unexpected request ${url}`)
    if (next instanceof Error) throw next
    const text = next.text ?? JSON.stringify(next.json ?? {})
    return new Response(text, { status: next.status ?? 200 })
  }) as unknown as FetchFn
  return { fetch, sent }
}

const chat = (content: string | null) => ({
  json: { choices: [{ message: { role: 'assistant', content } }] }
})
const refusal = (message: string, status = 400) => ({
  status,
  json: { error: { message, type: 'invalid_request_error' } }
})

const groq: ChatTarget = {
  provider: 'groq',
  key: 'gsk_test_key_123',
  model: 'openai/gpt-oss-120b'
}
const openai: ChatTarget = {
  provider: 'openai',
  key: 'sk-test',
  model: 'gpt-5-mini'
}

const Job = z.object({
  company: z.string(),
  title: z.string(),
  remote: z.boolean(),
  skills: z.array(z.string())
})
const jobReq = {
  system: 'Extract the job.',
  user: 'Posting text',
  schema: Job,
  schemaName: 'job'
}
const goodJob = {
  company: 'Nordlicht GmbH',
  title: 'Data Analyst',
  remote: true,
  skills: ['SQL', 'Python']
}

beforeEach(() => resetQuirks())

// --- JSON extraction ----------------------------------------------------------

describe('extractJson', () => {
  it('strips code fences and surrounding prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('Sure! Here it is: {"a":{"b":2}} Hope that helps.')).toBe('{"a":{"b":2}}')
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}')
  })

  it('leaves text without an object alone', () => {
    expect(extractJson('no json here')).toBe('no json here')
  })
})

describe('jsonSchemaFor', () => {
  it('exports the zod schema without the $schema marker', () => {
    const schema = jsonSchemaFor(Job)
    expect(schema['$schema']).toBeUndefined()
    expect(schema['type']).toBe('object')
    expect(schema['required']).toEqual(['company', 'title', 'remote', 'skills'])
  })
})

// --- structured output: degrade and repair ------------------------------------

describe('chatJson', () => {
  it('uses json_schema when the model accepts it', async () => {
    const { fetch, sent } = scriptedFetch(chat(JSON.stringify(goodJob)))
    const result = await chatJson(fetch, groq, jobReq)
    expect(result).toEqual({
      data: goodJob,
      mode: 'json_schema',
      repaired: false
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(sent[0]!.headers['Authorization']).toBe('Bearer gsk_test_key_123')
    const format = sent[0]!.body!['response_format'] as {
      type: string
      json_schema: { name: string }
    }
    expect(format.type).toBe('json_schema')
    expect(format.json_schema.name).toBe('job')
    // The schema is also spelled out in the system prompt, as in the reference app.
    const system = (sent[0]!.body!['messages'] as Array<{ content: string }>)[0]!.content
    expect(system).toContain('Return ONLY a single JSON object')
    expect(system).toContain('"company"')
  })

  it('falls back to json_object when json_schema is refused, and remembers it', async () => {
    const { fetch, sent } = scriptedFetch(
      refusal('response_format `json_schema` is not supported with this model'),
      chat(JSON.stringify(goodJob)),
      chat(JSON.stringify(goodJob))
    )
    const first = await chatJson(fetch, groq, jobReq)
    expect(first.mode).toBe('json_object')
    expect((sent[1]!.body!['response_format'] as { type: string }).type).toBe('json_object')

    await chatJson(fetch, groq, jobReq)
    expect(sent).toHaveLength(3)
    expect((sent[2]!.body!['response_format'] as { type: string }).type).toBe('json_object')
  })

  it('falls back to the prompt alone when both JSON modes are refused', async () => {
    const { fetch, sent } = scriptedFetch(
      refusal("Invalid value for 'response_format': json_schema is not supported"),
      refusal('This model does not support response_format json_object'),
      chat('```json\n' + JSON.stringify(goodJob) + '\n```')
    )
    const result = await chatJson(fetch, groq, jobReq)
    expect(result).toEqual({ data: goodJob, mode: 'prompt', repaired: false })
    expect(sent[2]!.body!['response_format']).toBeUndefined()
  })

  it('repairs an answer that misses fields, once', async () => {
    const { fetch, sent } = scriptedFetch(
      chat('{"company":"Nordlicht GmbH","title":"Data Analyst","remote":"yes"}'),
      chat(JSON.stringify(goodJob))
    )
    const result = await chatJson(fetch, groq, jobReq)
    expect(result).toEqual({
      data: goodJob,
      mode: 'json_schema',
      repaired: true
    })
    const messages = sent[1]!.body!['messages'] as Array<{
      role: string
      content: string
    }>
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[3]!.content).toContain('did not match the JSON Schema')
    expect(messages[3]!.content).toMatch(/remote|skills/)
  })

  it('repairs non-JSON prose', async () => {
    const { fetch } = scriptedFetch(chat('I could not find a company name.'), chat(JSON.stringify(goodJob)))
    const result = await chatJson(fetch, groq, jobReq)
    expect(result.repaired).toBe(true)
  })

  it('gives up with AI_INVALID_OUTPUT when the repair is still wrong', async () => {
    const { fetch, sent } = scriptedFetch(chat('{"company":1}'), chat('{"company":2}'))
    await expect(chatJson(fetch, groq, jobReq)).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT'
    })
    expect(sent).toHaveLength(2)
  })

  it("treats Groq's json_validate_failed as an answer to repair", async () => {
    const { fetch, sent } = scriptedFetch(
      refusal("Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details."),
      chat(JSON.stringify(goodJob))
    )
    const result = await chatJson(fetch, groq, jobReq)
    expect(result.repaired).toBe(true)
    const roles = (sent[1]!.body!['messages'] as Array<{ role: string }>).map((m) => m.role)
    expect(roles).toEqual(['system', 'user', 'user'])
  })

  it('does not retry other errors', async () => {
    const { fetch, sent } = scriptedFetch(refusal('Rate limit reached for model', 429))
    await expect(chatJson(fetch, groq, jobReq)).rejects.toMatchObject({
      code: 'AI_RATE_LIMIT'
    })
    expect(sent).toHaveLength(1)
  })

  it('sends images with the user message', async () => {
    const { fetch, sent } = scriptedFetch(chat(JSON.stringify(goodJob)))
    await chatJson(fetch, groq, {
      ...jobReq,
      images: ['data:image/png;base64,AAAA']
    })
    const user = (sent[0]!.body!['messages'] as Array<{ content: unknown }>)[1]!.content as Array<{ type: string }>
    expect(user.map((p) => p.type)).toEqual(['text', 'image_url'])
  })
})

// --- parameters some models refuse ---------------------------------------------

describe('chatText', () => {
  it('uses max_completion_tokens for OpenAI and drops temperature when refused', async () => {
    const { fetch, sent } = scriptedFetch(
      refusal("Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported."),
      chat('Hello')
    )
    expect(await chatText(fetch, openai, 'sys', 'hi')).toBe('Hello')
    expect(sent[0]!.body!['max_completion_tokens']).toBe(4096)
    expect(sent[0]!.body!['max_tokens']).toBeUndefined()
    expect(sent[0]!.body!['temperature']).toBe(0.5)
    expect(sent[1]!.body!['temperature']).toBeUndefined()
  })

  it('switches to max_completion_tokens when max_tokens is refused', async () => {
    const { fetch, sent } = scriptedFetch(
      refusal("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."),
      chat('ok')
    )
    await chatText(fetch, { ...groq, provider: 'openrouter' }, 'sys', 'hi')
    expect(sent[0]!.body!['max_tokens']).toBe(4096)
    expect(sent[1]!.body!['max_completion_tokens']).toBe(4096)
  })

  it('removes code fences around a plain answer', async () => {
    const { fetch } = scriptedFetch(chat('```\nDear team,\nThanks.\n```'))
    expect(await chatText(fetch, groq, 's', 'u')).toBe('Dear team,\nThanks.')
  })

  it('rejects an empty answer', async () => {
    const { fetch } = scriptedFetch(chat(''))
    await expect(chatText(fetch, groq, 's', 'u')).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT'
    })
  })
})

// --- errors ----------------------------------------------------------------------

describe('errors', () => {
  it('maps HTTP statuses to codes', () => {
    expect(classifyStatus(401, '').code).toBe('AI_AUTH')
    expect(classifyStatus(403, '').code).toBe('AI_AUTH')
    expect(classifyStatus(429, '').code).toBe('AI_RATE_LIMIT')
    expect(classifyStatus(404, '').code).toBe('AI_MODEL_MISSING')
    expect(classifyStatus(503, '').code).toBe('AI_SERVER')
    expect(classifyStatus(400, 'The model `llama-2` has been decommissioned').code).toBe('AI_MODEL_MISSING')
    expect(classifyStatus(400, 'messages: field required').code).toBe('AI_BAD_REQUEST')
  })

  it('reads the message from every provider shape', () => {
    expect(errorDetail({ error: { message: 'Invalid API Key' } })).toBe('Invalid API Key')
    expect(errorDetail([{ error: { code: 400, message: 'API key not valid.' } }])).toBe('API key not valid.')
    expect(errorDetail({ error: 'plain' })).toBe('plain')
    expect(errorDetail('<html>Bad gateway</html>')).toBe('<html>Bad gateway</html>')
  })

  it('reports network failures and timeouts', async () => {
    const endpoint = { baseUrl: 'https://x.test/v1', key: 'k' }
    const offline = scriptedFetch(new TypeError('fetch failed'))
    await expect(aiRequest(offline.fetch, endpoint, 'models', { timeoutMs: 1000 })).rejects.toMatchObject({
      code: 'AI_NETWORK'
    })
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    const slow = scriptedFetch(timeout)
    await expect(aiRequest(slow.fetch, endpoint, 'models', { timeoutMs: 1000 })).rejects.toMatchObject({
      code: 'AI_TIMEOUT'
    })
  })

  it('never repeats the key in an error', async () => {
    const key = 'sk-secret-value-42'
    const { fetch } = scriptedFetch(refusal(`Incorrect API key provided: ${key}.`, 401))
    const err = (await aiRequest(fetch, { baseUrl: 'https://x.test', key }, 'models', { timeoutMs: 1000 }).catch(
      (e: unknown) => e
    )) as AiError
    expect(err.code).toBe('AI_AUTH')
    expect(err.message).not.toContain(key)
    expect(err.message).toContain('[key]')
  })

  it('starts the message with the code, so the renderer can find it', () => {
    expect(new AiError('AI_AUTH', 'Invalid API Key').message).toBe('AI_AUTH: Invalid API Key')
    expect(new AiError('AI_TIMEOUT').message).toBe('AI_TIMEOUT')
  })
})

// --- model lists -------------------------------------------------------------------

const groqModels = {
  object: 'list',
  data: [
    {
      id: 'openai/gpt-oss-120b',
      object: 'model',
      active: true,
      context_window: 131072
    },
    { id: 'whisper-large-v3-turbo', object: 'model', active: true },
    {
      id: 'meta-llama/llama-4-scout-17b-16e-instruct',
      object: 'model',
      active: true
    },
    { id: 'llama-3.3-70b-versatile', object: 'model', active: true },
    { id: 'meta-llama/llama-guard-4-12b', object: 'model', active: true },
    { id: 'playai-tts', object: 'model', active: true },
    { id: 'old-model', object: 'model', active: false }
  ]
}

describe('model lists', () => {
  it('keeps only chat models and sorts them', () => {
    expect(parseModelList('groq', groqModels).map((m) => m.id)).toEqual([
      'llama-3.3-70b-versatile',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'openai/gpt-oss-120b'
    ])
    expect(isChatModel('text-embedding-3-small')).toBe(false)
    expect(isChatModel('gpt-4o-mini-transcribe')).toBe(false)
  })

  it('strips the Gemini "models/" prefix and marks Gemini as reading images', () => {
    const list = parseModelList('gemini', {
      data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-3-flash' }, { id: 'models/text-embedding-004' }]
    })
    expect(list).toEqual([
      { id: 'gemini-2.5-flash', vision: true },
      { id: 'gemini-3-flash', vision: true }
    ])
    expect(pickDefaultModel('gemini', list)).toBe('gemini-3-flash')
  })

  it('trusts OpenRouter input_modalities', () => {
    const list = parseModelList('openrouter', {
      data: [
        {
          id: 'openai/gpt-oss-120b',
          architecture: { input_modalities: ['text'] }
        },
        {
          id: 'qwen/qwen-vl-max',
          architecture: { input_modalities: ['text', 'image'] }
        }
      ]
    })
    expect(list.find((m) => m.id === 'openai/gpt-oss-120b')?.vision).toBe(false)
    expect(list.find((m) => m.id === 'qwen/qwen-vl-max')?.vision).toBe(true)
  })

  it('preselects the preferred model, else the first one', () => {
    const groq = parseModelList('groq', groqModels)
    expect(pickDefaultModel('groq', groq)).toBe('openai/gpt-oss-120b')
    expect(
      pickDefaultModel('openai', [
        { id: 'gpt-4.1-mini', vision: true },
        { id: 'gpt-5-mini', vision: true }
      ])
    ).toBe('gpt-5-mini')
    expect(pickDefaultModel('openrouter', [{ id: 'z-ai/glm', vision: null }])).toBe('z-ai/glm')
  })

  it('probes known image models first, skipping a text-only text model', () => {
    const groq = parseModelList('groq', groqModels)
    expect(visionCandidates('groq', groq, 'openai/gpt-oss-120b')).toEqual(['meta-llama/llama-4-scout-17b-16e-instruct'])
    const gemini = [
      { id: 'gemini-2.5-flash', vision: true },
      { id: 'gemini-3-flash', vision: true }
    ]
    expect(visionCandidates('gemini', gemini, 'gemini-2.5-flash')[0]).toBe('gemini-2.5-flash')
  })
})

// --- Settings "Test" ------------------------------------------------------------------

describe('testProvider', () => {
  it('lists models, makes one tiny call and finds a model that reads images', async () => {
    const { fetch, sent } = scriptedFetch({ json: groqModels }, chat('OK'), chat('Red'))
    const outcome = await testProvider(fetch, 'groq', 'gsk_x', (models) => pickDefaultModel('groq', models))
    expect(outcome.model).toBe('openai/gpt-oss-120b')
    expect(outcome.visionModel).toBe('meta-llama/llama-4-scout-17b-16e-instruct')
    expect(sent.map((s) => s.url.replace('https://api.groq.com/openai/v1/', ''))).toEqual([
      'models',
      'chat/completions',
      'chat/completions'
    ])
    expect(sent[2]!.body!['model']).toBe('meta-llama/llama-4-scout-17b-16e-instruct')
  })

  it('reports no image model when every candidate refuses the image', async () => {
    const { fetch } = scriptedFetch(
      { json: { data: [{ id: 'mystery-a' }, { id: 'mystery-b' }] } },
      chat('OK'),
      refusal('image input is not supported for this model'),
      refusal('content must be a string')
    )
    const outcome = await testProvider(fetch, 'openrouter', 'k', () => 'mystery-a')
    expect(outcome.visionModel).toBeNull()
  })

  it('counts an empty reply from a reasoning model as connected', async () => {
    const { fetch } = scriptedFetch({ json: groqModels }, chat(''), chat('Red'))
    const outcome = await testProvider(fetch, 'groq', 'k', () => 'openai/gpt-oss-120b')
    expect(outcome.model).toBe('openai/gpt-oss-120b')
  })

  it('fails with AI_AUTH on a wrong key', async () => {
    const { fetch } = scriptedFetch(refusal('Invalid API Key', 401))
    await expect(testProvider(fetch, 'groq', 'bad', () => 'x')).rejects.toMatchObject({ code: 'AI_AUTH' })
  })
})

// --- voice -------------------------------------------------------------------------------

describe('transcribe', () => {
  it('uploads the recording to Groq Whisper', async () => {
    const { fetch, sent } = scriptedFetch({
      json: { text: '  مرحبا، I would like to apply.  ' }
    })
    const text = await transcribe(fetch, 'gsk_x', new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus')
    expect(text).toBe('مرحبا، I would like to apply.')
    expect(sent[0]!.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    const form = sent[0]!.form!
    expect(form.get('model')).toBe('whisper-large-v3-turbo')
    expect((form.get('file') as File).name).toBe('recording.webm')
    expect(form.get('language')).toBeNull()
  })

  it('passes a language hint when given', async () => {
    const { fetch, sent } = scriptedFetch({ json: { text: 'hallo' } })
    await transcribe(fetch, 'k', new Uint8Array([1]), 'audio/ogg', 'de')
    expect(sent[0]!.form!.get('language')).toBe('de')
    expect((sent[0]!.form!.get('file') as File).name).toBe('recording.ogg')
  })

  it('refuses empty and oversized audio before sending', async () => {
    const { fetch, sent } = scriptedFetch()
    await expect(transcribe(fetch, 'k', new Uint8Array(), 'audio/webm')).rejects.toMatchObject({ code: 'AUDIO_EMPTY' })
    await expect(transcribe(fetch, 'k', new Uint8Array(MAX_AUDIO_BYTES + 1), 'audio/webm')).rejects.toMatchObject({
      code: 'AUDIO_TOO_LARGE'
    })
    expect(sent).toHaveLength(0)
  })

  it('names unknown recordings as webm', () => {
    expect(audioType('audio/mp4')).toEqual({ type: 'audio/mp4', ext: 'm4a' })
    expect(audioType('video/x-matroska')).toEqual({
      type: 'audio/webm',
      ext: 'webm'
    })
  })
})

// --- which provider does the text work ------------------------------------------------------

describe('text provider choice', () => {
  const keys = (set: SecretName[]): Record<SecretName, KeyStatus> =>
    Object.fromEntries(
      (['groq', 'gemini', 'openai', 'openrouter'] as const).map((n) => [n, { set: set.includes(n), masked: '' }])
    ) as Record<SecretName, KeyStatus>

  it('uses Groq unless the alternative is switched on', () => {
    const ai = {
      useAltText: false,
      altProvider: 'gemini' as const,
      altModel: ''
    }
    expect(textProvider({ ai, keys: keys(['groq', 'gemini']) })).toBe('groq')
    expect(otherTextProvider({ ai, keys: keys(['groq', 'gemini']) })).toBe('gemini')
    expect(otherTextProvider({ ai, keys: keys(['groq']) })).toBeNull()
  })

  it('never falls back to Groq on its own when the alternative has no key', () => {
    const ai = {
      useAltText: true,
      altProvider: 'openai' as const,
      altModel: ''
    }
    expect(textProvider({ ai, keys: keys(['groq']) })).toBe('openai')
    expect(otherTextProvider({ ai, keys: keys(['groq']) })).toBe('groq')
  })
})
