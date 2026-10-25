import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { buildMaterial, extractPdfPages, ExtractError, textAsPages, type Material } from '../lib/extract.js';
import { generateJson, LlmError } from '../lib/llm.js';
import { buildRetryContent, buildUserContent, SYSTEM_PROMPT } from '../lib/prompt.js';
import { DeckQualityError, geminiResponseSchema, RawDeckSchema, sanitizeDeck, type Deck } from '../lib/schema.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const GENERATION_BUDGET_MS = 40_000;

/** Error codes the client maps to its microcopy (spec section 12). */
export type ApiErrorCode = 'unsupported_type' | 'too_large' | 'no_text' | 'too_short' | 'bad_request' | 'generation_failed';

export function sendError(res: Response, status: number, error: ApiErrorCode, message: string) {
  res.status(status).json({ error, message });
}

export class GenerationError extends Error {}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function describeFailure(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
  }
  if (err instanceof SyntaxError) return `Response was not valid JSON (${err.message})`;
  if (err instanceof DeckQualityError) return err.message;
  return String(err);
}

/** One LLM call for the whole deck, zod-validated, with one retry that includes the validation error. */
export async function generateDeck(material: Material): Promise<Deck> {
  const deadline = Date.now() + GENERATION_BUDGET_MS;
  let lastFailure = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = attempt === 0 ? buildUserContent(material.text) : buildRetryContent(material.text, lastFailure);
    const raw = await generateJson(SYSTEM_PROMPT, content, { responseSchema: geminiResponseSchema, deadline });
    try {
      const parsed = RawDeckSchema.parse(JSON.parse(stripFences(raw)));
      return sanitizeDeck(parsed, material.validPages);
    } catch (err) {
      lastFailure = describeFailure(err);
      console.warn(`[generate] attempt ${attempt + 1} rejected: ${lastFailure}`);
    }
  }
  throw new GenerationError(lastFailure);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

function acceptUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, 'too_large', "That's a heavy load. Keep files under 10 MB.");
    }
    if (err) return next(err);
    next();
  });
}

function fileKind(file: Express.Multer.File): 'pdf' | 'txt' | null {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') return 'pdf';
  if (name.endsWith('.txt') || file.mimetype === 'text/plain') return 'txt';
  return null;
}

export const generateRouter = Router();

generateRouter.post('/generate', acceptUpload, async (req, res) => {
  let material: Material;
  try {
    if (req.file) {
      const kind = fileKind(req.file);
      if (!kind) return sendError(res, 415, 'unsupported_type', "That cargo won't fit. Try a PDF or TXT file.");
      const pages = kind === 'pdf' ? await extractPdfPages(req.file.buffer) : textAsPages(req.file.buffer.toString('utf8'));
      material = buildMaterial(pages);
    } else if (typeof req.body?.text === 'string') {
      material = buildMaterial(textAsPages(req.body.text));
    } else {
      return sendError(res, 400, 'bad_request', 'Send a PDF or TXT file, or some pasted text.');
    }
  } catch (err) {
    if (err instanceof ExtractError && err.code === 'no_text') {
      return sendError(res, 400, 'no_text', "We couldn't read any text in this PDF (it may be scanned). Try pasting your notes instead.");
    }
    if (err instanceof ExtractError && err.code === 'too_short') {
      return sendError(res, 400, 'too_short', 'Add a little more material so we can write good questions (200+ characters).');
    }
    console.warn('[generate] extraction failed:', err);
    return sendError(res, 400, 'no_text', "We couldn't read that file. Try pasting your notes instead.");
  }

  try {
    const deck = await generateDeck(material);
    console.log(`[generate] "${deck.title}": ${deck.questions.length} questions`);
    res.json(deck);
  } catch (err) {
    if (err instanceof LlmError) console.warn(`[generate] LLM ${err.kind}: ${err.message}`);
    else if (!(err instanceof GenerationError)) console.error('[generate] unexpected failure:', err);
    sendError(res, 502, 'generation_failed', 'The boiler stalled. Retry, or ride on a sample deck.');
  }
});
