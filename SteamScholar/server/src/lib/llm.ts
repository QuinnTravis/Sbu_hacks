/**
 * Provider-agnostic LLM wrapper. Only Gemini is implemented; add a Groq branch
 * (OpenAI-compatible chat completions with response_format json_object) if Gemini rate-limits.
 */

export type LlmErrorKind = 'config' | 'rate_limited' | 'unavailable' | 'timeout' | 'bad_response';

export class LlmError extends Error {
  constructor(
    public kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface GenerateOptions {
  /** Provider-specific JSON schema for native structured output. */
  responseSchema?: object;
  /** Absolute deadline (ms since epoch) shared across retries. */
  deadline?: number;
}

const RETRY_STATUSES = new Set([429, 503]);
const RETRY_DELAY_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 40_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateJson(
  systemPrompt: string,
  userContent: string,
  options: GenerateOptions = {},
): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? 'gemini';
  switch (provider) {
    case 'gemini':
      return geminiGenerate(systemPrompt, userContent, options);
    default:
      throw new LlmError('config', `Unknown LLM_PROVIDER "${provider}"`);
  }
}

async function geminiGenerate(systemPrompt: string, userContent: string, options: GenerateOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError('config', 'GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const deadline = options.deadline ?? Date.now() + DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
    },
  });

  // One retry on 429/503 after 2s, never a tight loop.
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new LlmError('timeout', 'Generation deadline reached');

    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: AbortSignal.timeout(remaining),
        },
      );
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new LlmError('timeout', 'Gemini request timed out');
      }
      throw new LlmError('unavailable', `Gemini request failed: ${String(err)}`);
    }

    if (RETRY_STATUSES.has(res.status)) {
      if (attempt === 0 && deadline - Date.now() > RETRY_DELAY_MS + 5_000) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new LlmError(res.status === 429 ? 'rate_limited' : 'unavailable', `Gemini returned ${res.status}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new LlmError('bad_response', `Gemini returned ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
    if (!text) {
      throw new LlmError('bad_response', `Gemini returned no text (finishReason ${json.candidates?.[0]?.finishReason})`);
    }
    return text;
  }
  throw new LlmError('unavailable', 'Gemini unavailable after retry');
}
