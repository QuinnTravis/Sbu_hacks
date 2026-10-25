export type { Deck, Difficulty, Option, Question } from '../../../server/src/lib/schema';

export interface AnswerRecord {
  questionId: string;
  concept: string;
  correct: boolean;
  ms: number;
  pressureAtAnswer: number;
  stationIndex: number;
  requeue: boolean;
  /** Re-asked from the previous journey's misses. */
  review?: boolean;
  /** Wrong answers: the likely confusion behind the pick (or the grader's note for free responses). */
  misconception?: string;
}

export interface ConceptResult {
  concept: string;
  attempts: number;
  correct: number;
  /** 0-100 */
  accuracy: number;
}

export interface MissedQuestion {
  questionId: string;
  concept: string;
  prompt: string;
  correctText: string;
  sourceLabel: string;
  /** Distinct mix-ups the player showed on this question. */
  misconceptions: string[];
}

/** Compact record of a finished journey, kept per deck to drive review and progress. */
export interface JourneySummary {
  finishedAt: number;
  /** 0-100 */
  accuracy: number;
  /** concept -> accuracy 0-100 */
  concepts: Record<string, number>;
  missedIds: string[];
}

export interface RunReport {
  deckId: string;
  deckTitle: string;
  finishedAt: number;
  totalAnswers: number;
  correctAnswers: number;
  /** 0-100 */
  accuracy: number;
  bestStreak: number;
  totalMs: number;
  peakPressure: number;
  concepts: ConceptResult[];
  missed: MissedQuestion[];
  /** The previous journey on this deck, for progress deltas. */
  previous?: JourneySummary;
  /** How many questions this run re-asked from the previous journey, and how many came back right. */
  reviewed?: number;
  reviewedCorrect?: number;
}
