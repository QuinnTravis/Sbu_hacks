import { z } from 'zod';

// ---------------------------------------------------------------------------
// Final deck schema: the contract shared with the client (see client/src/lib/types.ts)
// ---------------------------------------------------------------------------

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const QuestionTypeSchema = z.enum(['mcq', 'tf']);

export const OptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  difficulty: DifficultySchema,
  concept: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(OptionSchema).min(2).max(4),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(1),
  source: z.object({
    page: z.number().int().positive().nullable(),
    label: z.string().min(1),
  }),
});

export const DeckSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  concepts: z.array(z.string().min(1)).min(1),
  questions: z.array(QuestionSchema).min(1),
});

export type Difficulty = z.infer<typeof DifficultySchema>;
export type Option = z.infer<typeof OptionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Deck = z.infer<typeof DeckSchema>;

// ---------------------------------------------------------------------------
// Raw LLM output: validated loosely at the top level, then per question
// ---------------------------------------------------------------------------

export const RawDeckSchema = z.object({
  title: z.string().min(1),
  concepts: z.array(z.string().min(1)).min(3).max(10),
  questions: z.array(z.unknown()).min(1),
});

const RawQuestionSchema = z.object({
  type: QuestionTypeSchema,
  difficulty: DifficultySchema,
  concept: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(1),
  source: z
    .object({
      page: z.number().nullable().optional(),
      label: z.string().optional(),
    })
    .optional(),
});

/** Gemini `responseSchema` (OpenAPI subset) mirroring RawDeckSchema. */
export const geminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    concepts: { type: 'ARRAY', items: { type: 'STRING' } },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['mcq', 'tf'] },
          difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
          concept: { type: 'STRING' },
          prompt: { type: 'STRING' },
          options: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { id: { type: 'STRING' }, text: { type: 'STRING' } },
              required: ['id', 'text'],
            },
          },
          correctOptionId: { type: 'STRING' },
          explanation: { type: 'STRING' },
          source: {
            type: 'OBJECT',
            properties: {
              page: { type: 'INTEGER', nullable: true },
              label: { type: 'STRING' },
            },
            required: ['label'],
          },
        },
        required: ['type', 'difficulty', 'concept', 'prompt', 'options', 'correctOptionId', 'explanation', 'source'],
      },
    },
  },
  required: ['title', 'concepts', 'questions'],
} as const;

// ---------------------------------------------------------------------------
// Post-validation guardrails (spec 8.4)
// ---------------------------------------------------------------------------

export const MIN_VALID_QUESTIONS = 15;
export const MIN_PER_DIFFICULTY = 3;
const MCQ_IDS = ['a', 'b', 'c', 'd'];

export class DeckQualityError extends Error {}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Punctuation-insensitive key, for matching concepts and deduping prompts. */
function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sourceFor(page: number | null | undefined, validPages: Set<number>): Question['source'] {
  if (typeof page === 'number' && Number.isInteger(page) && validPages.has(page)) {
    return { page, label: `Page ${page}` };
  }
  return { page: null, label: 'Your notes' };
}

/** Turn one raw question into a clean Question, or null if it breaks a guardrail. */
function sanitizeQuestion(
  raw: unknown,
  concepts: Map<string, string>,
  validPages: Set<number>,
): Omit<Question, 'id'> | null {
  const parsed = RawQuestionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const q = parsed.data;

  const concept = concepts.get(normalizeKey(q.concept));
  if (!concept) return null;

  const correct = q.options.find((o) => o.id === q.correctOptionId);
  if (!correct) return null;

  let options: Option[];
  let correctOptionId: string;

  if (q.type === 'mcq') {
    if (q.options.length !== 4) return null;
    // Symbols matter in options ("n+1" vs "n-1"), so compare on case and whitespace only.
    const texts = new Set(q.options.map((o) => o.text.trim().toLowerCase().replace(/\s+/g, ' ')));
    if (texts.size !== 4) return null;
    // Shuffle so the correct position is unbiased, then relabel a-d by position.
    const shuffled = shuffle(q.options);
    options = shuffled.map((o, i) => ({ id: MCQ_IDS[i], text: o.text.trim() }));
    correctOptionId = MCQ_IDS[shuffled.indexOf(correct)];
  } else {
    if (q.options.length !== 2) return null;
    const truth = normalizeKey(correct.text);
    if (truth !== 'true' && truth !== 'false') return null;
    options = [
      { id: 'true', text: 'True' },
      { id: 'false', text: 'False' },
    ];
    correctOptionId = truth;
  }

  return {
    type: q.type,
    difficulty: q.difficulty,
    concept,
    prompt: q.prompt.trim(),
    options,
    correctOptionId,
    explanation: q.explanation.trim(),
    source: sourceFor(q.source?.page, validPages),
  };
}

/**
 * Apply the spec 8.4 guardrails: drop invalid questions, dedupe prompts, null bad pages,
 * shuffle options. Throws DeckQualityError if too few valid questions survive.
 */
export function sanitizeDeck(raw: z.infer<typeof RawDeckSchema>, validPages: Set<number>): Deck {
  const concepts = new Map<string, string>();
  for (const c of raw.concepts) {
    const name = c.trim();
    if (name && !concepts.has(normalizeKey(name))) concepts.set(normalizeKey(name), name);
  }

  const seenPrompts = new Set<string>();
  const questions: Question[] = [];
  for (const rawQ of raw.questions) {
    const q = sanitizeQuestion(rawQ, concepts, validPages);
    if (!q) continue;
    const key = normalizeKey(q.prompt);
    if (seenPrompts.has(key)) continue;
    seenPrompts.add(key);
    questions.push({ id: `q${questions.length + 1}`, ...q });
  }

  if (questions.length < MIN_VALID_QUESTIONS) {
    throw new DeckQualityError(
      `Only ${questions.length} questions were valid; at least ${MIN_VALID_QUESTIONS} are required.`,
    );
  }
  for (const d of DifficultySchema.options) {
    const n = questions.filter((q) => q.difficulty === d).length;
    if (n < MIN_PER_DIFFICULTY) {
      throw new DeckQualityError(`Only ${n} valid "${d}" questions; at least ${MIN_PER_DIFFICULTY} are required.`);
    }
  }

  const usedConcepts = [...concepts.values()].filter((c) => questions.some((q) => q.concept === c));

  return DeckSchema.parse({
    id: crypto.randomUUID(),
    title: raw.title.trim(),
    concepts: usedConcepts,
    questions,
  });
}
