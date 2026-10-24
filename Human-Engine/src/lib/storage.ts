import { COSMETICS, DEFAULT_EQUIPPED, DEFAULT_SETTINGS, TARGET_LIMITS } from '../data/catalog';
import type { AppState, CustomHabit, DayLog, Equipped, IndicatorId, JournalEntry, MotionPref, Settings, Targets } from '../types';
import { isValidKey } from './date';

export const STORAGE_KEY = 'human-engine:v1';

export function emptyDay(date: string): DayLog {
  return { date, sleepHours: null, water: 0, moveMinutes: 0, steps: 0, meals: 0, breaths: 0, customDone: [] };
}

export function freshState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, targets: { ...DEFAULT_SETTINGS.targets }, ignored: [] },
    days: {},
    customHabits: [],
    journal: [],
    equipped: { ...DEFAULT_EQUIPPED },
    seeded: false,
  };
}

// ─── Sanitisers: every field is coerced so a malformed save can never crash the app ───

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, min: number, max: number, fallback: number, step?: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  let c = Math.min(max, Math.max(min, n));
  if (step) c = Math.round(c / step) * step;
  return c;
}

const str = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.slice(0, max) : fallback);

const INDICATOR_IDS: IndicatorId[] = ['rest', 'cooling', 'motion', 'fuel', 'equilibrium'];

function sanitizeTargets(v: unknown): Targets {
  const src = isObj(v) ? v : {};
  const out = { ...DEFAULT_SETTINGS.targets };
  (Object.keys(TARGET_LIMITS) as (keyof Targets)[]).forEach((k) => {
    const lim = TARGET_LIMITS[k];
    out[k] = num(src[k], lim.min, lim.max, DEFAULT_SETTINGS.targets[k], lim.step);
  });
  return out;
}

function sanitizeSettings(v: unknown): Settings {
  const src = isObj(v) ? v : {};
  const motion: MotionPref = src.motion === 'reduced' || src.motion === 'full' ? src.motion : 'system';
  const ignored = Array.isArray(src.ignored)
    ? Array.from(new Set(src.ignored.filter((x): x is IndicatorId => INDICATOR_IDS.includes(x as IndicatorId))))
    : [];
  return { targets: sanitizeTargets(src.targets), ignored, motion };
}

function sanitizeDay(key: string, v: unknown, habitIds: Set<string>): DayLog | null {
  if (!isValidKey(key) || !isObj(v)) return null;
  const sleepRaw = v.sleepHours;
  const day: DayLog = {
    date: key,
    sleepHours: sleepRaw === null || sleepRaw === undefined ? null : num(sleepRaw, 0, 16, 0, 0.25),
    water: num(v.water, 0, 40, 0, 1),
    moveMinutes: num(v.moveMinutes, 0, 600, 0, 1),
    steps: num(v.steps, 0, 100000, 0, 1),
    meals: num(v.meals, 0, 8, 0, 1),
    breaths: num(v.breaths, 0, 12, 0, 1),
    customDone: Array.isArray(v.customDone)
      ? Array.from(new Set(v.customDone.filter((x): x is string => typeof x === 'string' && habitIds.has(x))))
      : [],
  };
  if (isObj(v.stamps)) {
    const stamps: DayLog['stamps'] = {};
    for (const k of ['water', 'sleep', 'move', 'steps', 'meals', 'breaths', 'custom'] as const) {
      const t = v.stamps[k];
      if (typeof t === 'number' && Number.isFinite(t) && t > 0) stamps[k] = t;
    }
    day.stamps = stamps;
  }
  if (v.demo === true) day.demo = true;
  return day;
}

function sanitizeHabit(v: unknown): CustomHabit | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const label = str(v.label, 40).trim();
  if (!id || !label) return null;
  return { id, label, createdAt: num(v.createdAt, 0, 8.64e15, Date.now()) };
}

function sanitizeEntry(v: unknown): JournalEntry | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const date = str(v.date, 10);
  if (!id || !isValidKey(date)) return null;
  const e: JournalEntry = {
    id,
    date,
    ts: num(v.ts, 0, 8.64e15, Date.now()),
    mood: num(v.mood, 1, 5, 3, 1),
    stress: num(v.stress, 1, 5, 3, 1),
    note: str(v.note, 1000),
  };
  if (v.demo === true) e.demo = true;
  return e;
}

function sanitizeEquipped(v: unknown): Equipped {
  const src = isObj(v) ? v : {};
  const valid = (slot: keyof Equipped) => {
    const id = src[slot];
    return COSMETICS.some((c) => c.slot === slot && c.id === id) ? (id as string) : DEFAULT_EQUIPPED[slot];
  };
  return { finish: valid('finish'), gauge: valid('gauge'), steam: valid('steam') };
}

export function sanitizeState(raw: unknown): AppState {
  const base = freshState();
  if (!isObj(raw)) return base;
  const customHabits = Array.isArray(raw.customHabits)
    ? (raw.customHabits.map(sanitizeHabit).filter(Boolean) as CustomHabit[]).slice(0, 8)
    : [];
  const habitIds = new Set(customHabits.map((h) => h.id));
  const days: Record<string, DayLog> = {};
  if (isObj(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      const d = sanitizeDay(k, v, habitIds);
      if (d) days[k] = d;
    }
  }
  const journal = Array.isArray(raw.journal)
    ? (raw.journal.map(sanitizeEntry).filter(Boolean) as JournalEntry[]).sort((a, b) => a.ts - b.ts).slice(-500)
    : [];
  return {
    version: 1,
    settings: sanitizeSettings(raw.settings),
    days,
    customHabits,
    journal,
    equipped: sanitizeEquipped(raw.equipped),
    seeded: raw.seeded === true,
  };
}

export interface LoadResult {
  state: AppState;
  notice: string | null;
  firstLaunch: boolean;
}

export function loadState(): LoadResult {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { state: freshState(), notice: 'Browser storage is unavailable, so entries will last only for this visit.', firstLaunch: true };
  }
  if (raw === null) return { state: freshState(), notice: null, firstLaunch: true };
  try {
    return { state: sanitizeState(JSON.parse(raw)), notice: null, firstLaunch: false };
  } catch {
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
    return {
      state: freshState(),
      notice: 'Your saved data could not be read, so the engine was rebuilt fresh. A backup copy of the old data was kept in this browser.',
      firstLaunch: false,
    };
  }
}

export function saveState(state: AppState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
