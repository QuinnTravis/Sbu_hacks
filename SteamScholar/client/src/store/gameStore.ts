import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { announce, prefersReducedMotion } from '../lib/a11y';
import type { AnswerRecord, Deck, Question, RunReport } from '../lib/types';
import { triggerShake, triggerSputter, triggerSteamBurst } from '../scene/effects';
import {
  CORRECT_ADVANCE_MS,
  CORRECT_PRESSURE,
  DIFFICULTY_FALLBACK,
  difficultyForPressure,
  FINAL_BANNER_MS,
  HARD_BONUS,
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
}

/** A missed question waiting to come back (spec 7.4). */
interface Requeued {
  question: Question;
  /** The slot number (1-based, across the run) at which it becomes due. */
  dueSlot: number;
}

/** Result of the player's pick on the current question; locks the answer buttons. */
export interface Feedback {
  chosenOptionId: string;
  correct: boolean;
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
  feedback: Feedback | null;
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
function drawQuestion(s: GameState): Pick<GameState, 'current' | 'currentIsRequeue' | 'pool' | 'queue'> {
  const nextSlot = s.slotsServed + 1;
  const dueIdx = s.queue.findIndex((r) => r.dueSlot <= nextSlot);
  if (dueIdx >= 0) {
    return {
      current: s.queue[dueIdx].question,
      currentIsRequeue: true,
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
    return { current: pick, currentIsRequeue: false, pool: s.pool.filter((q) => q !== pick), queue: s.queue };
  }

  // Pool exhausted: pull a pending requeue early, or as a last resort recycle the deck.
  if (s.queue.length > 0) {
    return { current: s.queue[0].question, currentIsRequeue: true, pool: s.pool, queue: s.queue.slice(1) };
  }
  const recycled = shuffled((s.deck?.questions ?? []).filter((q) => q.id !== s.current?.id));
  return { current: recycled[0] ?? s.current, currentIsRequeue: false, pool: recycled.slice(1), queue: [] };
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
        correctText: q.options.find((o) => o.id === q.correctOptionId)?.text ?? '',
        sourceLabel: q.source.label,
      },
    ];
  });

  return {
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

const runDefaults = {
  pool: [] as Question[],
  queue: [] as Requeued[],
  requeuedIds: [] as string[],
  current: null,
  currentIsRequeue: false,
  feedback: null,
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

      return {
        phase: 'depot',
        deck: null,
        ...runDefaults,
        correctPulse: 0,
        targetSpeed: IDLE_SPEED,
        actualSpeed: 0,
        settings: { sound: true, reduceMotion: prefersReducedMotion() },
        settingsOpen: false,
        questionShownAt: 0,
        runStartedAt: 0,
        pendingSource: null,
        depotError: null,
        report: null,
        lastDeck: null,

        requestDeck(source) {
          set({ pendingSource: source, depotError: null, phase: 'loading' });
        },

        failToDepot(message) {
          set({ phase: 'depot', depotError: message, pendingSource: null });
        },

        startRun(deck) {
          clearTimers();
          sputterUntil = 0;
          set({
            ...runDefaults,
            phase: 'playing',
            deck,
            lastDeck: deck,
            pool: [...deck.questions],
            targetSpeed: speedForPressure(START_PRESSURE),
            runStartedAt: Date.now(),
            pendingSource: null,
            depotError: null,
          });
          advance();
        },

        answer(optionId) {
          const s = get();
          const q = s.current;
          if (s.phase !== 'playing' || !q || s.feedback) return;
          const correct = optionId === q.correctOptionId;

          const record: AnswerRecord = {
            questionId: q.id,
            concept: q.concept,
            correct,
            ms: Math.round(performance.now() - s.questionShownAt),
            pressureAtAnswer: Math.round(s.pressure),
            stationIndex: s.stationIndex,
            requeue: s.currentIsRequeue,
          };
          const common = {
            feedback: { chosenOptionId: optionId, correct },
            answered: [...s.answered, record],
            questionsThisStation: s.questionsThisStation + 1,
          };

          if (correct) {
            const streak = s.streak + 1;
            const gain = CORRECT_PRESSURE + Math.min(streak, STREAK_BONUS_CAP) * STREAK_BONUS + (q.difficulty === 'hard' ? HARD_BONUS : 0);
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
            announce('Correct');
            schedule(advance, CORRECT_ADVANCE_MS);
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
            set({ report });
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
          set({ settings: { ...get().settings, ...patch } });
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
      partialize: (s) => ({ settings: s.settings, report: s.report, lastDeck: s.lastDeck }),
    },
  ),
);
