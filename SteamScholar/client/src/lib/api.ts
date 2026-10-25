import type { DeckSource } from '../store/gameStore';
import type { Deck } from './types';

/** Client copy for every error the Depot or loading screen can show (spec section 12). */
export const ERROR_COPY = {
  unsupported_type: "That cargo won't fit. Try a PDF or TXT file.",
  too_large: "That's a heavy load. Keep files under 10 MB.",
  no_text: "We couldn't read any text in this PDF (it may be scanned). Try pasting your notes instead.",
  too_short: 'Add a little more material so we can write good questions (200+ characters).',
  bad_request: 'Something was off with that upload. Try a PDF or TXT file, or paste your notes.',
  generation_failed: 'The boiler stalled. Retry, or ride on a sample deck.',
  network: 'We lost the signal. Check your connection and retry.',
} as const;

export type ErrorCode = keyof typeof ERROR_COPY;

/** Errors about the material itself send the player back to the Depot. */
export const DEPOT_ERRORS: ReadonlySet<ErrorCode> = new Set(['unsupported_type', 'too_large', 'no_text', 'too_short', 'bad_request']);

export class ApiError extends Error {
  constructor(public code: ErrorCode) {
    super(ERROR_COPY[code]);
  }
}

async function request(url: string, init: RequestInit): Promise<Deck> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('network');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const code = body?.error && body.error in ERROR_COPY ? (body.error as ErrorCode) : 'generation_failed';
    throw new ApiError(res.status === 504 ? 'network' : code);
  }
  return (await res.json()) as Deck;
}

export async function generateDeck(source: Exclude<DeckSource, { kind: 'sample' }>, signal: AbortSignal): Promise<Deck> {
  if (source.kind === 'file') {
    const form = new FormData();
    form.append('file', source.file);
    return request('/api/generate', { method: 'POST', body: form, signal });
  }
  return request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: source.text }),
    signal,
  });
}

/** The cached sample deck. Falls back to a bundled copy if the server can't be reached. */
export async function fetchSampleDeck(signal: AbortSignal): Promise<{ deck: Deck; bundled: boolean }> {
  try {
    return { deck: await request('/api/sample', { signal }), bundled: false };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const bundled = await import('../../../server/sample/sampleDeck.json');
    return { deck: bundled.default as Deck, bundled: true };
  }
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_TEXT_CHARS = 200;

/** Client-side check before upload; returns an error code or null. */
export function validateFile(file: File): ErrorCode | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.txt')) return 'unsupported_type';
  if (file.size > MAX_UPLOAD_BYTES) return 'too_large';
  return null;
}
