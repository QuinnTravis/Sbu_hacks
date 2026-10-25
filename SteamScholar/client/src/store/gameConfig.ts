import type { Difficulty } from '../lib/types';

export const STATION_NAMES = ['Ashford Junction', 'Copperhill Pass', 'Ironbridge Terminal'] as const;
export const STATION_COUNT = STATION_NAMES.length;

const params = new URLSearchParams(window.location.search);
/** `?demo=1`: 2 questions per station so a full run takes under a minute. */
export const DEMO_MODE = params.get('demo') === '1';
/** `?debug=1`: temporary correct/wrong buttons over the scene. */
export const DEBUG_MODE = params.get('debug') === '1';
export const QUESTIONS_PER_STATION = DEMO_MODE ? 2 : 4;

// Pressure and speed (spec 7.2)
export const START_PRESSURE = 20;
export const MIN_CRUISE_SPEED = 15;
export const SPEED_PER_PRESSURE = 0.75;
export const IDLE_SPEED = 15;
export const CORRECT_PRESSURE = 12;
export const STREAK_BONUS = 2;
export const STREAK_BONUS_CAP = 5;
export const HARD_BONUS = 6;
export const WRONG_PRESSURE_PENALTY = 30;
export const SPUTTER_SPEED = 8;
export const SPUTTER_MS = 1_500;

// Adaptive difficulty (spec 7.3)
export const MEDIUM_FROM_PRESSURE = 35;
export const HARD_FROM_PRESSURE = 70;
export const DIFFICULTY_FALLBACK: Record<Difficulty, Difficulty[]> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};

// Requeue (spec 7.4): a missed question comes back as the 3rd or 4th question after it.
export const REQUEUE_MIN_GAP = 3;
export const REQUEUE_MAX_GAP = 4;

// Pacing (spec 6.3, 6.4)
export const CORRECT_ADVANCE_MS = 1_200;
/** After a graded free response, leave time to read the grader's sentence. */
export const GRADED_ADVANCE_MS = 3_200;
export const MAINTENANCE_DELAY_MS = 600;
export const FINAL_BANNER_MS = 2_500;
export const SAMPLE_MIN_LOADING_MS = 2_500;
export const GENERATION_TIMEOUT_MS = 45_000;

// Learning across journeys: re-ask up to this many of last journey's misses, early in the run.
export const REVIEW_MAX = 3;
export const REVIEW_SLOTS = [1, 3, 5];
export const HISTORY_PER_DECK = 5;
export const HISTORY_MAX_DECKS = 10;

/** Weak-concept threshold for the "Revisit" tag (spec 6.6). */
export const REVISIT_BELOW = 70;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const speedForPressure = (pressure: number) =>
  clamp(MIN_CRUISE_SPEED + pressure * SPEED_PER_PRESSURE, 0, 100);

export function difficultyForPressure(pressure: number): Difficulty {
  if (pressure >= HARD_FROM_PRESSURE) return 'hard';
  if (pressure >= MEDIUM_FROM_PRESSURE) return 'medium';
  return 'easy';
}
