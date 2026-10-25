import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';

/**
 * Narration for eyes-free mode: GET /api/tts?text=... returns MP3 from ElevenLabs.
 * Clips are cached on disk by (voice, model, text), so rehearsing the same deck costs no credits.
 * Any failure answers 503 and the client falls back to the browser's built-in speech.
 */

const MAX_TEXT_CHARS = 900;
const REQUEST_TIMEOUT_MS = 15_000;
// "George": warm, mature British narrator, a fit for a Victorian conductor.
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
// Flash: ElevenLabs' lowest-latency model.
const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
const CACHE_DIR = fileURLToPath(new URL('../../.cache/tts/', import.meta.url));

let warnedAboutPermission = false;

export const ttsRouter = Router();

ttsRouter.get('/tts', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  if (!text || text.length > MAX_TEXT_CHARS) {
    return res.status(400).json({ error: 'bad_request', message: 'Narration text missing or too long.' });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'tts_unavailable', message: 'ELEVENLABS_API_KEY is not set.' });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_TTS_MODEL || DEFAULT_MODEL_ID;
  const hash = createHash('sha1').update(`${voiceId}\n${modelId}\n${text}`).digest('hex');
  const cached = `${CACHE_DIR}${hash}.mp3`;

  // Only successful audio is cacheable; errors must not stick in the browser cache.
  const audioHeaders = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' };
  if (existsSync(cached)) return createReadStream(cached).pipe(res.set(audioHeaders));

  let upstream: Response;
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: modelId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[tts] request failed:', (err as Error).message);
    return res.status(503).json({ error: 'tts_unavailable', message: 'Narration service unreachable.' });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    if (upstream.status === 401 && detail.includes('text_to_speech')) {
      if (!warnedAboutPermission) {
        console.warn('[tts] ElevenLabs key lacks the text_to_speech permission; using browser speech instead.');
        warnedAboutPermission = true;
      }
    } else {
      console.warn(`[tts] ElevenLabs ${upstream.status}: ${detail.slice(0, 200)}`);
    }
    return res.status(503).json({ error: 'tts_unavailable', message: 'Narration unavailable.' });
  }

  // Stream to the player and the cache at the same time; only keep complete files.
  res.set(audioHeaders);
  mkdirSync(CACHE_DIR, { recursive: true });
  const partial = `${cached}.${process.pid}.part`;
  const file = createWriteStream(partial);
  try {
    for await (const chunk of Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)) {
      res.write(chunk);
      file.write(chunk);
    }
    file.end(() => renameSync(partial, cached));
    res.end();
  } catch (err) {
    console.warn('[tts] stream interrupted:', (err as Error).message);
    file.destroy();
    rmSync(partial, { force: true });
    res.end();
  }
});
