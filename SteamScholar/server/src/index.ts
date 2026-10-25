import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { DeckSchema } from './lib/schema.js';
import { generateRouter, MAX_UPLOAD_BYTES, sendError } from './routes/generate.js';

const SAMPLE_DECK_PATH = new URL('../sample/sampleDeck.json', import.meta.url);
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

const app = express();
app.use(express.json({ limit: MAX_UPLOAD_BYTES }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: process.env.LLM_PROVIDER ?? 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Works with no API key and no network: the deck is a committed file.
app.get('/api/sample', async (_req, res, next) => {
  try {
    const deck = DeckSchema.parse(JSON.parse(await readFile(SAMPLE_DECK_PATH, 'utf8')));
    res.json(deck);
  } catch (err) {
    next(err);
  }
});

app.use('/api', generateRouter);

app.use('/api', (_req, res) => sendError(res, 404, 'bad_request', 'Unknown endpoint.'));

// `npm start` after `npm run build` serves the built client too.
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile('index.html', { root: CLIENT_DIST }));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return sendError(res, 400, 'bad_request', 'That request was malformed.');
  }
  console.error('[server] unhandled error:', err);
  sendError(res, 500, 'generation_failed', 'The boiler stalled. Retry, or ride on a sample deck.');
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`SteamScholar server on http://localhost:${port}`);
  if (!process.env.GEMINI_API_KEY) console.log('GEMINI_API_KEY not set: only the sample deck will work.');
});
