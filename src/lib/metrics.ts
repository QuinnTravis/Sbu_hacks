import { INDICATORS, INDICATOR_ORDER } from '../data/catalog';
import type { AppState, DayLog, IndicatorId, IndicatorReading, JournalEntry, Targets } from '../types';
import { emptyDay } from './storage';

export const MOOD_LABELS = ['Heavy', 'Low', 'Even', 'Good', 'Bright'];
export const STRESS_LABELS = ['Calm', 'Settled', 'Busy', 'Strained', 'Overloaded'];

export function getDay(state: AppState, date: string): DayLog {
  return state.days[date] ?? emptyDay(date);
}

export function entriesFor(journal: JournalEntry[], date: string): JournalEntry[] {
  return journal.filter((e) => e.date === date);
}

export function latestEntry(journal: JournalEntry[], date: string): JournalEntry | null {
  const list = entriesFor(journal, date);
  return list.length ? list.reduce((a, b) => (b.ts >= a.ts ? b : a)) : null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Equilibrium reading from self-reported mood & stress, nudged upward by breathing breaks. */
export function equilibriumValue(entry: JournalEntry | null, breaths: number, targets: Targets): number | null {
  const bonus = Math.min(breaths, targets.breaths) * (0.2 / Math.max(1, targets.breaths));
  if (!entry) return breaths > 0 ? clamp01(0.5 + bonus) : null;
  const base = 0.5 * ((entry.mood - 1) / 4) + 0.5 * ((5 - entry.stress) / 4);
  return clamp01(base * 0.85 + 0.05 + bonus);
}

export function readings(state: AppState, date: string): IndicatorReading[] {
  const d = getDay(state, date);
  const t = state.settings.targets;
  const entry = latestEntry(state.journal, date);
  const ign = new Set(state.settings.ignored);

  const r: Record<IndicatorId, Omit<IndicatorReading, 'id' | 'ignored' | 'label'>> = {
    rest: {
      value: d.sleepHours === null ? null : clamp01(d.sleepHours / t.sleepHours),
      current: d.sleepHours === null ? 'Not logged' : `${fmtNum(d.sleepHours)} h`,
      target: `${fmtNum(t.sleepHours)} h`,
    },
    cooling: {
      value: d.water === 0 ? 0 : clamp01(d.water / t.waterGlasses),
      current: `${d.water} ${d.water === 1 ? 'glass' : 'glasses'}`,
      target: `${t.waterGlasses}`,
    },
    motion: {
      value: clamp01(d.moveMinutes / t.moveMinutes),
      current: `${d.moveMinutes} min`,
      target: `${t.moveMinutes} min`,
    },
    fuel: {
      value: clamp01(d.meals / t.meals),
      current: `${d.meals} ${d.meals === 1 ? 'meal' : 'meals'}`,
      target: `${t.meals}`,
    },
    equilibrium: {
      value: equilibriumValue(entry, d.breaths, t),
      current: entry ? `${MOOD_LABELS[entry.mood - 1]} · ${STRESS_LABELS[entry.stress - 1].toLowerCase()}` : d.breaths ? `${d.breaths} breath ${d.breaths === 1 ? 'break' : 'breaks'}` : 'No check-in',
      target: null,
    },
  };

  return INDICATOR_ORDER.map((id) => ({
    id,
    label: INDICATORS[id].name,
    ignored: ign.has(id),
    ...r[id],
    value: ign.has(id) ? null : r[id].value,
  }));
}

export interface EngineCondition {
  overall: number; // 0..1
  state: 'cold' | 'idle' | 'steady' | 'full';
  label: string;
  values: Record<IndicatorId, number>; // effective 0..1 values used for visuals (ignored → neutral)
  logged: Record<IndicatorId, boolean>;
  ignored: Record<IndicatorId, boolean>;
  stress: number | null; // 1..5 if checked in
}

export const STATE_LABELS: Record<EngineCondition['state'], string> = {
  cold: 'Cold Start',
  idle: 'Idling',
  steady: 'Steady Running',
  full: 'Full Steam',
};

export function engineCondition(state: AppState, date: string): EngineCondition {
  const rs = readings(state, date);
  const values = {} as Record<IndicatorId, number>;
  const logged = {} as Record<IndicatorId, boolean>;
  const ignored = {} as Record<IndicatorId, boolean>;
  let sum = 0;
  let n = 0;
  for (const r of rs) {
    ignored[r.id] = r.ignored;
    logged[r.id] = r.value !== null;
    // Ignored indicators run at a neutral, healthy idle so they never drag the engine down.
    values[r.id] = r.ignored ? 0.7 : r.value ?? 0.12;
    if (!r.ignored) {
      sum += r.value ?? 0.12;
      n++;
    }
  }
  const overall = n ? sum / n : 0.7;
  const st: EngineCondition['state'] = overall < 0.25 ? 'cold' : overall < 0.55 ? 'idle' : overall < 0.85 ? 'steady' : 'full';
  const entry = latestEntry(state.journal, date);
  return { overall, state: st, label: STATE_LABELS[st], values, logged, ignored, stress: entry ? entry.stress : null };
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
