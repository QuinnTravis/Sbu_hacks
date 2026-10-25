import type { Question } from './types';

export type VoiceIntent =
  | { kind: 'answer'; optionId: string }
  | { kind: 'repeat' }
  | { kind: 'continue' }
  /** Free-response questions: the transcript itself is the answer. */
  | { kind: 'free'; text: string }
  | { kind: 'unknown' };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Recognizers often hear homophones: "to"/"too" for two, "for" for four, "won" for one.
const POSITION_WORDS: Record<string, number> = {
  '1': 0, one: 0, won: 0, first: 0,
  '2': 1, two: 1, to: 1, too: 1, second: 1,
  '3': 2, three: 2, tree: 2, third: 2,
  '4': 3, four: 3, for: 3, fore: 3, fourth: 3,
};
const LETTER_WORDS: Record<string, number> = { a: 0, b: 1, be: 1, bee: 1, c: 2, see: 2, sea: 2, d: 3, dee: 3 };
const LEAD_INS = /^(?:i think |i say |i'?ll go with |my answer is |it'?s |it is |the answer is |answer |option |number |letter |choice )+/;

const REPEAT = /\b(repeat|again|say that again|what was that|pardon)\b/;
const CONTINUE = /\b(continue|next|depart|go|ready|okay|ok|back on track|all aboard|move on|keep going)\b/;
const NEGATED_TRUE = /\b(not true|isn'?t true|is not true|untrue)\b/;
const TRUE_WORDS = /^(true|yes|yeah|yep|correct|right|that'?s true|it'?s true)$/;
const FALSE_WORDS = /^(false|no|nope|wrong|incorrect|that'?s false|it'?s false)$/;

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'or', 'is', 'it', 'its', 'that', 'by', 'for', 'with', 'one', 'i', 'think']);
const contentTokens = (s: string) => normalize(s).split(' ').filter((t) => t && !STOPWORDS.has(t));

/** Which position does a short utterance like "two", "option b" or "the second one" name? */
function positionFrom(phrase: string, optionCount: number): number | null {
  const stripped = phrase.replace(LEAD_INS, '').replace(/^the /, '').replace(/ one$/, '').trim();
  if (stripped in POSITION_WORDS && POSITION_WORDS[stripped] < optionCount) return POSITION_WORDS[stripped];
  // The whole utterance must be the letter, so the article "a" inside a sentence never counts.
  if (stripped in LETTER_WORDS && LETTER_WORDS[stripped] < optionCount) return LETTER_WORDS[stripped];
  return null;
}

/** F1 overlap of content words between what was said and a target text (0..1). */
export function overlapScore(said: string, target: string): number {
  const heard = new Set(contentTokens(said));
  const tokens = new Set(contentTokens(target));
  const hits = [...tokens].filter((t) => heard.has(t)).length;
  if (!hits) return 0;
  const precision = hits / heard.size;
  const recall = hits / tokens.size;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Match against option text with an F1 score over content words, so "last in first out" picks
 * LIFO over FIFO (shared words count, but so do extra words the option lacks).
 */
function optionByText(said: string, q: Question): string | null {
  if (contentTokens(said).length === 0) return null;
  const scored = q.options.map((o) => ({ id: o.id, score: overlapScore(said, o.text) })).sort((x, y) => y.score - x.score);
  const [best, runnerUp] = scored;
  return best.score >= 0.5 && best.score - (runnerUp?.score ?? 0) >= 0.15 ? best.id : null;
}

/**
 * Interpret speech-recognition alternatives (most likely first) for the current game moment.
 * `awaiting` is "answer" while a question is open, "continue" on Maintenance Stop / station.
 */
export function interpret(transcripts: string[], q: Question | null, awaiting: 'answer' | 'continue'): VoiceIntent {
  const phrases = transcripts.map(normalize).filter(Boolean);
  if (phrases.some((p) => REPEAT.test(p))) return { kind: 'repeat' };
  if (awaiting === 'continue') return phrases.some((p) => CONTINUE.test(p)) ? { kind: 'continue' } : { kind: 'unknown' };
  if (!q) return { kind: 'unknown' };
  if (q.type === 'short') return transcripts[0]?.trim() ? { kind: 'free', text: transcripts[0].trim() } : { kind: 'unknown' };

  for (const phrase of phrases) {
    if (q.type === 'tf') {
      const pick = NEGATED_TRUE.test(phrase) || FALSE_WORDS.test(phrase) ? 'false' : TRUE_WORDS.test(phrase) ? 'true' : null;
      const fromPosition = positionFrom(phrase, 2);
      const id = pick ?? (fromPosition !== null ? q.options[fromPosition].id : null);
      if (id) return { kind: 'answer', optionId: q.options.find((o) => o.id === id)?.id ?? id };
      continue;
    }
    const position = positionFrom(phrase, q.options.length);
    if (position !== null) return { kind: 'answer', optionId: q.options[position].id };
    const byText = optionByText(phrase, q);
    if (byText) return { kind: 'answer', optionId: byText };
  }
  return { kind: 'unknown' };
}
