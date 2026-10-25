import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { announce, prefersReducedMotion } from '../lib/a11y';
import { fetchMisconceptions, type MisconceptionMap } from '../lib/api';
import { gradeAnswer, type Verdict } from '../lib/grade';
import type { AnswerRecord, Deck, JourneySummary, Question, RunReport } from '../lib/types';
import { triggerShake, triggerSputter, triggerSteamBurst } from '../scene/effects';
import {
  CORRECT_ADVANCE_MS,
  CORRECT_PRESSURE,
  GRADED_ADVANCE_MS,
  DIFFICULTY_FALLBACK,
  difficultyForPressure,
  FINAL_BANNER_MS,
  HARD_BONUS,
  HISTORY_MAX_DECKS,
  HISTORY_PER_DECK,
  REVIEW_MAX,
  REVIEW_SLOTS,
  IDLE_SPEED,
  MAINTENANCE_DELAY_MS,
  QUESTIONS_PER_STATION,
  REQUEUE_MAX_GAP,
  REQUEUE_MIN_GAP,
  speedForPressure,
  SPUTTER_MS,
  SPUTTER_SPEED,
  START_PRESSURE,
  STATION_COUNT,
  STATION_NAMES,
  STREAK_BONUS,
  STREAK_BONUS_CAP,
  WRONG_PRESSURE_PENALTY,
} from './gameConfig';

export type Phase = 'depot' | 'loading' | 'playing' | 'maintenance' | 'station' | 'report';

/** What the Depot handed to the loading screen. */
export type DeckSource = { kind: 'sample' } | { kind: 'file'; file: File } | { kind: 'text'; text: string };

export interface Settings {
  sound: boolean;
  reduceMotion: boolean;
  /** Narrate everything and listen for spoken answers. */
  eyesFree: boolean;
}

/** A missed question waiting to come back (spec 7.4). */
interface Requeued {
  question: Question;
  /** The slot number (1-based, across the run) at which it becomes due. */
  dueSlot: number;
  /** Re-asked because it was missed on the previous journey (not this one). */
  review?: boolean;
}

/** Result of the player's pick on the current question; locks the answer buttons. */
export interface Feedback {
  /** Option id, or "short" for a free response. */
  chosenOptionId: string;
  correct: boolean;
  /** Free responses only: the grader's verdict, its one-line feedback, and what the player said. */
  verdict?: Verdict;
  graderFeedback?: string;
  response?: string;
  /** Wrong option picked: the confusion that likely led to it. */
  misconception?: string;
}

interface GameState {
  phase: Phase;
  deck: Deck | null;
  /** Not-yet-asked questions, drawn by adaptive difficulty. */
  pool: Question[];
  /** Pending requeues of missed questions. */
  queue: Requeued[];
  requeuedIds: string[];
  current: Question | null;
  currentIsRequeue: boolean;
  /** The current question was missed on the previous journey with this deck. */
  currentIsReview: boolean;
  /** Finished journeys per deck id (most recent last), persisted. */
  history: Record<string, JourneySummary[]>;
  feedback: Feedback | null;
  /** A free response is being graded; answers are locked. */
  grading: boolean;
  /** Background-fetched misconceptions for decks that don't carry their own. */
  misconceptions: MisconceptionMap;
  answered: AnswerRecord[];
  stationIndex: number;
  questionsThisStation: number;
  slotsServed: number;
  pressure: number;
  streak: number;
  bestStreak: number;
  peakPressure: number;
  /** Bumps on every correct answer so the gauge can flash its rim. */
  correctPulse: number;
  targetSpeed: number;
  actualSpeed: number;
  stopAtNextStation: boolean;
  settings: Settings;
  settingsOpen: boolean;
  questionShownAt: number;
  runStartedAt: number;

  pendingSource: DeckSource | null;
  depotError: string | null;
  /** Last finished run, persisted. */
  report: RunReport | null;
  /** Deck of the last run, persisted so "Ride again" survives a reload. */
  lastDeck: Deck | null;

  // actions
  requestDeck(source: DeckSource): void;
  failToDepot(message: string): void;
  startRun(deck: Deck): void;
  answer(optionId: string): void;
  submitFreeResponse(text: string): Promise<void>;
  dismissMaintenance(): void;
  onStationArrived(stationIndex: number): void;
  departStation(): void;
  setActualSpeed(speed: number): void;
  resetToDepot(): void;
  updateSettings(patch: Partial<Settings>): void;
  setSettingsOpen(open: boolean): void;
}

// Timers live outside the store so a new run can cancel everything from the old one.
const timers = new Set<ReturnType<typeof setTimeout>>();
function schedule(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}
function clearTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
}

let sputterUntil = 0;
const sputtering = () => performance.now() < sputterUntil;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick the next question: a due requeue first, else adaptive difficulty from the pool. */
function drawQuestion(s: GameState): Pick<GameState, 'current' | 'currentIsRequeue' | 'currentIsReview' | 'pool' | 'queue'> {
  const nextSlot = s.slotsServed + 1;
  const dueIdx = s.queue.findIndex((r) => r.dueSlot <= nextSlot);
  if (dueIdx >= 0) {
    return {
      current: s.queue[dueIdx].question,
      currentIsRequeue: !s.queue[dueIdx].review,
      currentIsReview: Boolean(s.queue[dueIdx].review),
      pool: s.pool,
      queue: s.queue.filter((_, i) => i !== dueIdx),
    };
  }

  const lastConcept = s.current?.concept;
  for (const difficulty of DIFFICULTY_FALLBACK[difficultyForPressure(s.pressure)]) {
    const candidates = s.pool.filter((q) => q.difficulty === difficulty);
    if (candidates.length === 0) continue;
    // Prefer a different concept than the last question for variety.
    const varied = candidates.filter((q) => q.concept !== lastConcept);
    const pick = shuffled(varied.length > 0 ? varied : candidates)[0];
    return { current: pick, currentIsRequeue: false, currentIsReview: false, pool: s.pool.filter((q) => q !== pick), queue: s.queue };
  }

  // Pool exhausted: pull a pending requeue early, or as a last resort recycle the deck.
  if (s.queue.length > 0) {
    const next = s.queue[0];
    return { current: next.question, currentIsRequeue: !next.review, currentIsReview: Boolean(next.review), pool: s.pool, queue: s.queue.slice(1) };
  }
  const recycled = shuffled((s.deck?.questions ?? []).filter((q) => q.id !== s.current?.id));
  return { current: recycled[0] ?? s.current, currentIsRequeue: false, currentIsReview: false, pool: recycled.slice(1), queue: [] };
}

export function buildReport(s: GameState): RunReport {
  const deck = s.deck!;
  const total = s.answered.length;
  const correct = s.answered.filter((a) => a.correct).length;
  const byId = new Map(deck.questions.map((q) => [q.id, q]));

  const concepts = deck.concepts
    .map((concept) => {
      const records = s.answered.filter((a) => a.concept === concept);
      const right = records.filter((a) => a.correct).length;
      return {
        concept,
        attempts: records.length,
        correct: right,
        accuracy: records.length ? Math.round((right / records.length) * 100) : 0,
      };
    })
    .filter((c) => c.attempts > 0);

  const missedIds = [...new Set(s.answered.filter((a) => !a.correct).map((a) => a.questionId))];
  const missed = missedIds.flatMap((id) => {
    const q = byId.get(id);
    if (!q) return [];
    return [
      {
        questionId: id,
        concept: q.concept,
        prompt: q.prompt,
        correctText: q.type === 'short' ? (q.answer ?? '') : (q.options.find((o) => o.id === q.correctOptionId)?.text ?? ''),
        sourceLabel: q.source.label,
        misconceptions: [
          ...new Set(s.answered.filter((a) => a.questionId === id && !a.correct && a.misconception).map((a) => a.misconception!)),
        ],
      },
    ];
  });

  return {
    previous: s.history[deck.id]?.at(-1),
    reviewed: s.answered.filter((a) => a.review).length,
    reviewedCorrect: s.answered.filter((a) => a.review && a.correct).length,
    deckId: deck.id,
    deckTitle: deck.title,
    finishedAt: Date.now(),
    totalAnswers: total,
    correctAnswers: correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    bestStreak: s.bestStreak,
    totalMs: Date.now() - s.runStartedAt,
    peakPressure: Math.round(s.peakPressure),
    concepts,
    missed,
  };
}

/** Append a finished journey to the per-deck history, capped per deck and in total decks. */
function recordJourney(history: Record<string, JourneySummary[]>, report: RunReport, answered: AnswerRecord[]) {
  const summary: JourneySummary = {
    finishedAt: report.finishedAt,
    accuracy: report.accuracy,
    concepts: Object.fromEntries(report.concepts.map((c) => [c.concept, c.accuracy])),
    // Missed and never recovered this run (a requeue answered right counts as recovered).
    missedIds: [...new Set(answered.filter((a) => !a.correct).map((a) => a.questionId))].filter(
      (id) => !answered.some((a) => a.questionId === id && a.correct),
    ),
  };
  const next = { ...history, [report.deckId]: [...(history[report.deckId] ?? []), summary].slice(-HISTORY_PER_DECK) };
  const decks = Object.keys(next).sort((a, b) => (next[b].at(-1)?.finishedAt ?? 0) - (next[a].at(-1)?.finishedAt ?? 0));
  return Object.fromEntries(decks.slice(0, HISTORY_MAX_DECKS).map((id) => [id, next[id]]));
}

const runDefaults = {
  pool: [] as Question[],
  queue: [] as Requeued[],
  requeuedIds: [] as string[],
  current: null,
  currentIsRequeue: false,
  currentIsReview: false,
  feedback: null,
  grading: false,
  misconceptions: {} as MisconceptionMap,
  answered: [] as AnswerRecord[],
  stationIndex: 0,
  questionsThisStation: 0,
  slotsServed: 0,
  pressure: START_PRESSURE,
  streak: 0,
  bestStreak: 0,
  peakPressure: START_PRESSURE,
  stopAtNextStation: false,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      /** Serve the next question, or ask the scene to stop if this station's quota is met. */
      const advance = () => {
        const s = get();
        if (s.phase !== 'playing') return;
        if (s.questionsThisStation >= QUESTIONS_PER_STATION) {
          set({ stopAtNextStation: true, current: null, feedback: null });
          return;
        }
        set({ ...drawQuestion(s), feedback: null, slotsServed: s.slotsServed + 1, questionShownAt: performance.now() });
      };

      /** Apply a judged answer (clicked, spoken, or graded free response) to pressure, speed and pacing. */
      const resolve = (correct: boolean, feedback: Feedback) => {
        const s = get();
        const q = s.current!;
        if (!correct) {
          feedback = {
            ...feedback,
            misconception:
              q.type === 'short'
                ? feedback.graderFeedback
                : (q.options.find((o) => o.id === feedback.chosenOptionId)?.misconception ??
                  s.misconceptions[q.id]?.[feedback.chosenOptionId]),
          };
        }
        const record: AnswerRecord = {
          questionId: q.id,
          concept: q.concept,
          correct,
          misconception: feedback.misconception,
          ms: Math.round(performance.now() - s.questionShownAt),
          pressureAtAnswer: Math.round(s.pressure),
          stationIndex: s.stationIndex,
          requeue: s.currentIsRequeue,
          review: s.currentIsReview,
        };
        const common = {
          feedback,
          answered: [...s.answered, record],
          questionsThisStation: s.questionsThisStation + 1,
        };

        if (correct) {
          const streak = s.streak + 1;
          // A "partly right" free response earns half the usual pressure.
          const full = CORRECT_PRESSURE + Math.min(streak, STREAK_BONUS_CAP) * STREAK_BONUS + (q.difficulty === 'hard' ? HARD_BONUS : 0);
          const gain = feedback.verdict === 'partial' ? Math.round(full / 2) : full;
          const pressure = Math.min(100, s.pressure + gain);
          set({
            ...common,
            streak,
            bestStreak: Math.max(s.bestStreak, streak),
            pressure,
            peakPressure: Math.max(s.peakPressure, pressure),
            correctPulse: s.correctPulse + 1,
            targetSpeed: sputtering() ? s.targetSpeed : speedForPressure(pressure),
          });
          triggerSteamBurst();
          announce(feedback.verdict === 'partial' ? `Partly right. ${feedback.graderFeedback ?? ''}` : 'Correct');
          // Give the grader's sentence time to be read before moving on.
          schedule(advance, feedback.graderFeedback ? GRADED_ADVANCE_MS : CORRECT_ADVANCE_MS);
          return;
        }

        const pressure = Math.max(0, s.pressure - WRONG_PRESSURE_PENALTY);
        const requeue = !s.requeuedIds.includes(q.id);
        const gap = REQUEUE_MIN_GAP + Math.floor(Math.random() * (REQUEUE_MAX_GAP - REQUEUE_MIN_GAP + 1));
        set({
          ...common,
          streak: 0,
          pressure,
          targetSpeed: SPUTTER_SPEED,
          queue: requeue ? [...s.queue, { question: q, dueSlot: s.slotsServed + gap }] : s.queue,
          requeuedIds: requeue ? [...s.requeuedIds, q.id] : s.requeuedIds,
        });
        sputterUntil = performance.now() + SPUTTER_MS;
        schedule(() => set({ targetSpeed: speedForPressure(get().pressure) }), SPUTTER_MS);
        triggerSputter();
        triggerShake();
        announce('Not quite, see the explanation');
        schedule(() => {
          if (get().phase === 'playing') set({ phase: 'maintenance' });
        }, MAINTENANCE_DELAY_MS);
      };

      return {
        phase: 'depot',
        deck: null,
        ...runDefaults,
        correctPulse: 0,
        targetSpeed: IDLE_SPEED,
        actualSpeed: 0,
        settings: { sound: true, reduceMotion: prefersReducedMotion(), eyesFree: false },
        settingsOpen: false,
        questionShownAt: 0,
        runStartedAt: 0,
        pendingSource: null,
        depotError: null,
        report: null,
        lastDeck: null,
        history: {},

        requestDeck(source) {
          set({ pendingSource: source, depotError: null, phase: 'loading' });
        },

        failToDepot(message) {
          set({ phase: 'depot', depotError: message, pendingSource: null });
        },

        startRun(deck) {
          clearTimers();
          sputterUntil = 0;
          // Spaced retrieval: last journey's misses on this deck come back first (slots 1, 3, 5).
          const lastJourney = get().history[deck.id]?.at(-1);
          const reviewIds = new Set((lastJourney?.missedIds ?? []).slice(0, REVIEW_MAX));
          const review = deck.questions.filter((q) => reviewIds.has(q.id));
          set({
            ...runDefaults,
            phase: 'playing',
            deck,
            lastDeck: deck,
            pool: deck.questions.filter((q) => !reviewIds.has(q.id)),
            queue: review.map((question, i) => ({ question, dueSlot: REVIEW_SLOTS[i], review: true })),
            targetSpeed: speedForPressure(START_PRESSURE),
            runStartedAt: Date.now(),
            pendingSource: null,
            depotError: null,
          });
          advance();
          void fetchMisconceptions(deck).then((misconceptions) => {
            if (get().deck === deck) set({ misconceptions });
          });
        },

        answer(optionId) {
          const s = get();
          const q = s.current;
          if (s.phase !== 'playing' || !q || s.feedback || s.grading || q.type === 'short') return;
          resolve(optionId === q.correctOptionId, { chosenOptionId: optionId, correct: optionId === q.correctOptionId });
        },

        async submitFreeResponse(text) {
          const s = get();
          const q = s.current;
          const response = text.trim();
          if (s.phase !== 'playing' || !q || q.type !== 'short' || s.feedback || s.grading || !response) return;
          set({ grading: true });
          announce('Checking your answer');
          const grade = await gradeAnswer(q, response);
          // The run may have moved on (reset, new deck) while grading was in flight.
          const now = get();
          set({ grading: false });
          if (now.current !== q || now.phase !== 'playing' || now.feedback) return;
          const correct = grade.verdict !== 'incorrect';
          resolve(correct, { chosenOptionId: 'short', correct, verdict: grade.verdict, graderFeedback: grade.feedback, response });
        },

        dismissMaintenance() {
          if (get().phase !== 'maintenance') return;
          set({ phase: 'playing' });
          advance();
        },

        onStationArrived(stationIndex) {
          const s = get();
          if (!s.stopAtNextStation || s.phase !== 'playing' || stationIndex !== s.stationIndex) return;
          set({ phase: 'station' });
          announce(`Arrived at ${STATION_NAMES[stationIndex]}`);
          if (stationIndex === STATION_COUNT - 1) {
            const report = buildReport(s);
            set({ report, history: recordJourney(s.history, report, s.answered) });
            schedule(() => {
              if (get().phase === 'station') set({ phase: 'report' });
            }, FINAL_BANNER_MS);
          }
        },

        departStation() {
          const s = get();
          if (s.phase !== 'station' || s.stationIndex >= STATION_COUNT - 1) return;
          set({
            phase: 'playing',
            stationIndex: s.stationIndex + 1,
            questionsThisStation: 0,
            stopAtNextStation: false,
            targetSpeed: speedForPressure(s.pressure),
          });
          advance();
        },

        setActualSpeed(speed) {
          set({ actualSpeed: speed });
        },

        resetToDepot() {
          clearTimers();
          set({ ...runDefaults, phase: 'depot', deck: null, targetSpeed: IDLE_SPEED, pendingSource: null });
        },

        updateSettings(patch) {
          // Eyes-free mode is all audio, so it switches sound back on.
          const sound = patch.eyesFree ? true : undefined;
          set({ settings: { ...get().settings, ...patch, ...(sound ? { sound } : {}) } });
        },

        setSettingsOpen(open) {
          set({ settingsOpen: open });
        },
      };
    },
    {
      name: 'steamscholar',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings, report: s.report, lastDeck: s.lastDeck, history: s.history }),
      // Settings saved before eyes-free mode existed lack the flag; keep the defaults underneath.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return { ...current, ...p, settings: { ...current.settings, ...p.settings } };
      },
    },
  ),
);
