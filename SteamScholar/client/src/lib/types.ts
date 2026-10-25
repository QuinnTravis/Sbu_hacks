export type { Deck, Difficulty, Option, Question } from '../../../server/src/lib/schema';

export interface AnswerRecord {
  questionId: string;
  concept: string;
  correct: boolean;
  ms: number;
  pressureAtAnswer: number;
  stationIndex: number;
  requeue: boolean;
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
}
