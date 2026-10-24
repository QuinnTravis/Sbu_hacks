// ─── Core domain types for Human Engine ─────────────────────────────────────

export type IndicatorId = 'rest' | 'cooling' | 'motion' | 'fuel' | 'equilibrium';

export type MotionPref = 'system' | 'reduced' | 'full';

export interface Targets {
  /** hours of sleep */
  sleepHours: number;
  /** glasses of water */
  waterGlasses: number;
  /** minutes of exercise */
  moveMinutes: number;
  /** steps walked (either this or exercise minutes can fill the Motion indicator) */
  steps: number;
  /** nourishing meals */
  meals: number;
  /** short breathing breaks */
  breaths: number;
}

export interface Settings {
  targets: Targets;
  /** Indicators the user has chosen to ignore — they run neutral and never count against the engine. */
  ignored: IndicatorId[];
  motion: MotionPref;
}

/** One calendar day of manually entered habit data. */
export interface DayLog {
  date: string; // YYYY-MM-DD (local)
  sleepHours: number | null;
  water: number;
  moveMinutes: number;
  steps: number;
  meals: number;
  breaths: number;
  customDone: string[]; // ids of custom habits completed
  /** when each habit was last recorded (epoch ms) — only real entries get stamps */
  stamps?: Partial<Record<StampKey, number>>;
  demo?: boolean;
}

export type StampKey = 'water' | 'sleep' | 'move' | 'steps' | 'meals' | 'breaths' | 'custom';

export interface CustomHabit {
  id: string;
  label: string;
  createdAt: number;
}

export interface JournalEntry {
  id: string;
  ts: number;
  date: string; // YYYY-MM-DD local
  mood: number; // 1..5 (self-reported)
  stress: number; // 1..5 (self-reported)
  note: string;
  demo?: boolean;
}

export type CosmeticSlot = 'finish' | 'gauge' | 'steam';

export interface Equipped {
  finish: string;
  gauge: string;
  steam: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  days: Record<string, DayLog>;
  customHabits: CustomHabit[];
  journal: JournalEntry[];
  equipped: Equipped;
  /** set once the first-launch sample data has been offered */
  seeded: boolean;
}

/** Per-indicator reading: 0..1 or null if not logged / ignored. */
export interface IndicatorReading {
  id: IndicatorId;
  value: number | null;
  ignored: boolean;
  label: string;
  current: string;
  target: string | null;
}
