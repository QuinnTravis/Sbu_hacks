// Dev/preview-server endpoint: GET /api/events?date=YYYY-MM-DD.
// Asks Gemini, grounded with Google Search, what is happening today at the
// venues in src/engine/venues.ts, so the browser never sees the API key.
// Without GEMINI_API_KEY it answers with an empty list and an error string,
// and the app falls back to the keyless MLB schedule.

import type { Connect, Plugin } from 'vite';
import { VENUES, type DetectedEvent, type DetectorResponse } from './src/engine/venues.ts';

const CACHE_MS = 30 * 60 * 1000;
const SIZES = new Set(['small', 'medium', 'large']);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function prompt(date: string) {
  const venues = VENUES.map((v) => `- ${v.id}: ${v.name} (${v.hosts})`).join('\n');
  return `Today is ${date} in New York. Search for events happening on ${date} at these venues:
${venues}

Include games, concerts, tournaments, festivals and anything else that draws a crowd big enough to load nearby subway and LIRR trains. Only include events you found a source for that are scheduled on ${date}. Skip postponed or cancelled events.

Reply with JSON only, no prose, in this shape:
{"events":[{"title":"Mets vs. Braves","venueId":"citi-field","start":"19:10","end":"22:10","size":"large","sourceUrl":"https://..."}]}

venueId must be one of: ${VENUES.map((v) => v.id).join(', ')}.
start and end are 24-hour HH:MM New York time; end may be null if unknown.
size: "large" for 20,000+ people, "medium" for 5,000–20,000, "small" below that.
If nothing is on, reply {"events":[]}.`;
}

export function parseDetectorText(text: string): DetectedEvent[] {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const raw = JSON.parse(json) as { events?: unknown[] };
  const ids = new Set(VENUES.map((v) => v.id));
  return (raw.events ?? []).flatMap((e) => {
    const ev = e as Partial<DetectedEvent>;
    if (typeof ev.title !== 'string' || !ids.has(ev.venueId ?? '') || !HHMM.test(ev.start ?? '')) return [];
    return [{
      title: ev.title.slice(0, 120),
      venueId: ev.venueId!,
      start: ev.start!,
      end: typeof ev.end === 'string' && HHMM.test(ev.end) ? ev.end : null,
      size: SIZES.has(ev.size ?? '') ? ev.size! : 'medium',
      sourceUrl: typeof ev.sourceUrl === 'string' && ev.sourceUrl.startsWith('https://') ? ev.sourceUrl : null,
    }];
  });
}

async function askGemini(apiKey: string, model: string, date: string): Promise<DetectedEvent[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt(date) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return parseDetectorText(text);
}

export function eventDetector(env: Record<string, string>): Plugin {
  const cache = new Map<string, { at: number; body: DetectorResponse }>();
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/events') return next();
    const date = url.searchParams.get('date') ?? '';
    const send = (body: DetectorResponse) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send({ events: [], error: 'bad date' });
    if (!env.GEMINI_API_KEY) return send({ events: [], error: 'GEMINI_API_KEY not set' });
    const hit = cache.get(date);
    if (hit && Date.now() - hit.at < CACHE_MS) return send(hit.body);
    askGemini(env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-2.5-flash', date)
      .then((events) => {
        const body = { events };
        cache.set(date, { at: Date.now(), body });
        send(body);
      })
      .catch((e: Error) => send({ events: [], error: e.message }));
  };
  return {
    name: 'transitflow-event-detector',
    configureServer: (server) => { server.middlewares.use(handler); },
    configurePreviewServer: (server) => { server.middlewares.use(handler); },
  };
}
