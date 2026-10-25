import { Router } from 'express';
import { z } from 'zod';
import { generateJson, LlmError } from '../lib/llm.js';

/**
 * POST /api/misconceptions: for each wrong option, the confusion that leads someone to pick it.
 * Runs in the background after a deck is generated (a separate call keeps deck generation fast).
 */

const TIMEOUT_MS = 30_000;
const MAX_CHARS = 140;

const Request = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().min(1),
        correctOptionId: z.string().min(1),
        options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2).max(4),
      }),
    )
    .min(1)
    .max(40),
});

const Result = z.object({
  items: z.array(z.object({ questionId: z.string(), optionId: z.string(), misconception: z.string() })),
});

const SYSTEM_PROMPT = `For each wrong option of each quiz question, name the misconception that would lead a student to choose it.
- Under 15 words, e.g. "Mixing up a stack's LIFO order with a queue's FIFO".
- Specific to the subject, never generic ("Not reading carefully").
- Only wrong options: never the option whose id equals correctOptionId.
Output only JSON.`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { questionId: { type: 'STRING' }, optionId: { type: 'STRING' }, misconception: { type: 'STRING' } },
        required: ['questionId', 'optionId', 'misconception'],
      },
    },
  },
  required: ['items'],
};

export const misconceptionsRouter = Router();

misconceptionsRouter.post('/misconceptions', async (req, res) => {
  const parsed = Request.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request', message: 'Expected a list of questions.' });
  const questions = parsed.data.questions;

  try {
    const raw = await generateJson(SYSTEM_PROMPT, JSON.stringify(questions), { responseSchema, deadline: Date.now() + TIMEOUT_MS });
    const { items } = Result.parse(JSON.parse(raw));
    // Keep only real wrong options; answer as { questionId: { optionId: misconception } }.
    const byId = new Map(questions.map((q) => [q.id, q]));
    const out: Record<string, Record<string, string>> = {};
    for (const { questionId, optionId, misconception } of items) {
      const q = byId.get(questionId);
      const text = misconception.trim();
      if (!q || optionId === q.correctOptionId || !q.options.some((o) => o.id === optionId) || !text || text.length > MAX_CHARS) continue;
      (out[questionId] ??= {})[optionId] = text;
    }
    res.json(out);
  } catch (err) {
    console.warn('[misconceptions] failed:', err instanceof LlmError ? `${err.kind}: ${err.message}` : (err as Error).message);
    res.status(503).json({ error: 'misconceptions_unavailable', message: 'Misconceptions unavailable.' });
  }
});
