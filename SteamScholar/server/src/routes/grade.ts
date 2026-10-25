import { Router } from 'express';
import { z } from 'zod';
import { generateJson, LlmError } from '../lib/llm.js';

/**
 * POST /api/grade: grade a free-response answer (typed or spoken) against the reference answer
 * from the player's notes. The client falls back to a local word-overlap check if this fails.
 */

const GRADE_TIMEOUT_MS = 12_000;

const GradeRequest = z.object({
  prompt: z.string().min(1).max(600),
  reference: z.string().min(1).max(400),
  explanation: z.string().max(800).optional(),
  response: z.string().min(1).max(600),
});

const GradeResult = z.object({
  verdict: z.enum(['correct', 'partial', 'incorrect']),
  feedback: z.string().min(1).max(300),
});
export type Grade = z.infer<typeof GradeResult>;

const SYSTEM_PROMPT = `You grade a student's short answer to a study question, using the reference answer from their own notes.
- The answer may be a speech-to-text transcript: ignore filler words, missing punctuation and misheard homophones.
- Accept paraphrases and synonyms. Never require the reference's exact wording.
- "correct": captures the key idea of the reference. "partial": on the right track but misses or confuses an essential part. "incorrect": wrong, unrelated, or empty ("I don't know").
- "feedback": one encouraging sentence under 25 words, addressed to the student as "you", naming what was right or what was missing. Do not start with "Correct" or "Incorrect".
Output only JSON.`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['correct', 'partial', 'incorrect'] },
    feedback: { type: 'STRING' },
  },
  required: ['verdict', 'feedback'],
};

export const gradeRouter = Router();

gradeRouter.post('/grade', async (req, res) => {
  const parsed = GradeRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request', message: 'Missing question, reference or response.' });
  const { prompt, reference, explanation, response } = parsed.data;

  const content = [
    `Question: ${prompt}`,
    `Reference answer: ${reference}`,
    explanation ? `Background from the notes: ${explanation}` : '',
    `Student's answer: ${response}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await generateJson(SYSTEM_PROMPT, content, { responseSchema, deadline: Date.now() + GRADE_TIMEOUT_MS });
    res.json(GradeResult.parse(JSON.parse(raw)));
  } catch (err) {
    console.warn('[grade] failed:', err instanceof LlmError ? `${err.kind}: ${err.message}` : (err as Error).message);
    res.status(503).json({ error: 'grade_unavailable', message: 'Grading unavailable.' });
  }
});
