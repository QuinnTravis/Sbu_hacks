import type { Question } from './types';
import { overlapScore } from './voiceMatch';

export type Verdict = 'correct' | 'partial' | 'incorrect';
export interface Grade {
  verdict: Verdict;
  feedback: string;
  /** True when Gemini was unreachable and the local word-overlap check decided. */
  offline?: boolean;
}

const GRADE_TIMEOUT_MS = 13_000;

/** Offline fallback: content-word overlap with the reference answer. Lenient, never blocks play. */
export function localGrade(response: string, reference: string): Grade {
  const score = overlapScore(response, reference);
  if (score >= 0.5) return { verdict: 'correct', feedback: 'You covered the key idea from your notes.', offline: true };
  if (score >= 0.25) return { verdict: 'partial', feedback: "You're on the right track; compare your answer with the one from your notes.", offline: true };
  return { verdict: 'incorrect', feedback: 'Compare your answer with the one from your notes.', offline: true };
}

/** Grade a free-response answer with Gemini via /api/grade, falling back to localGrade. */
export async function gradeAnswer(q: Question, response: string): Promise<Grade> {
  const reference = q.answer ?? '';
  try {
    const res = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: q.prompt, reference, explanation: q.explanation, response }),
      signal: AbortSignal.timeout(GRADE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`grade ${res.status}`);
    return (await res.json()) as Grade;
  } catch {
    return localGrade(response, reference);
  }
}
