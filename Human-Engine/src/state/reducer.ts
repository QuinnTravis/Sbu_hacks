import { demoData } from '../data/demo';
import { emptyDay, freshState, uid } from '../lib/storage';
import type { AppState, CosmeticSlot, DayLog, IndicatorId, MotionPref, StampKey, Targets } from '../types';

export type Action =
  | { type: 'water'; date: string; delta: number }
  | { type: 'sleep'; date: string; hours: number | null }
  | { type: 'move'; date: string; delta: number }
  | { type: 'steps'; date: string; steps: number }
  | { type: 'meal'; date: string; delta: number }
  | { type: 'breath'; date: string; delta: number }
  | { type: 'toggleCustom'; date: string; id: string }
  | { type: 'addHabit'; label: string }
  | { type: 'removeHabit'; id: string }
  | { type: 'journal'; date: string; mood: number; stress: number; note: string }
  | { type: 'deleteEntry'; id: string }
  | { type: 'targets'; targets: Targets }
  | { type: 'toggleIgnore'; id: IndicatorId }
  | { type: 'motion'; pref: MotionPref }
  | { type: 'equip'; slot: CosmeticSlot; id: string }
  | { type: 'loadDemo'; today: string }
  | { type: 'clearDemo' }
  | { type: 'reset' }
  | { type: 'markSeeded' };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Apply a change to one day. A day still holding sample readings is wiped first, so real entries never mix with demo ones. */
function withDay(state: AppState, date: string, fn: (d: DayLog) => DayLog): AppState {
  const current = state.days[date];
  const base = !current || current.demo ? emptyDay(date) : current;
  const next = fn({ ...base, customDone: [...base.customDone] });
  return { ...state, days: { ...state.days, [date]: next } };
}

/** Record when a habit was last logged. Clearing an entry removes its stamp. */
function stamp(d: DayLog, key: StampKey, clear = false): DayLog {
  const stamps = { ...(d.stamps ?? {}) };
  if (clear) delete stamps[key];
  else stamps[key] = Date.now();
  return { ...d, stamps };
}

export function isDemoDay(state: AppState, date: string): boolean {
  return state.days[date]?.demo === true;
}

export function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'water':
      return withDay(state, a.date, (d) => stamp({ ...d, water: clamp(d.water + a.delta, 0, 40) }, 'water'));
    case 'sleep':
      return withDay(state, a.date, (d) => stamp({ ...d, sleepHours: a.hours === null ? null : clamp(Math.round(a.hours * 4) / 4, 0, 16) }, 'sleep', a.hours === null));
    case 'move':
      return withDay(state, a.date, (d) => stamp({ ...d, moveMinutes: clamp(Math.round(d.moveMinutes + a.delta), 0, 600) }, 'move'));
    case 'steps':
      return withDay(state, a.date, (d) => stamp({ ...d, steps: clamp(Math.round(a.steps), 0, 100000) }, 'steps', a.steps <= 0));
    case 'meal':
      return withDay(state, a.date, (d) => stamp({ ...d, meals: clamp(d.meals + a.delta, 0, 8) }, 'meals'));
    case 'breath':
      return withDay(state, a.date, (d) => stamp({ ...d, breaths: clamp(d.breaths + a.delta, 0, 12) }, 'breaths'));
    case 'toggleCustom':
      if (!state.customHabits.some((h) => h.id === a.id)) return state;
      return withDay(state, a.date, (d) =>
        stamp({ ...d, customDone: d.customDone.includes(a.id) ? d.customDone.filter((x) => x !== a.id) : [...d.customDone, a.id] }, 'custom'),
      );
    case 'addHabit': {
      const label = a.label.trim().slice(0, 40);
      if (!label || state.customHabits.length >= 8) return state;
      if (state.customHabits.some((h) => h.label.toLowerCase() === label.toLowerCase())) return state;
      return { ...state, customHabits: [...state.customHabits, { id: uid('habit'), label, createdAt: Date.now() }] };
    }
    case 'removeHabit': {
      const days: Record<string, DayLog> = {};
      for (const [k, d] of Object.entries(state.days)) days[k] = { ...d, customDone: d.customDone.filter((x) => x !== a.id) };
      return { ...state, days, customHabits: state.customHabits.filter((h) => h.id !== a.id) };
    }
    case 'journal': {
      // a real check-in today also clears any leftover sample readings for today
      const s = isDemoDay(state, a.date) ? withDay(state, a.date, (d) => d) : state;
      return {
        ...s,
        journal: [
          ...s.journal,
          { id: uid('entry'), ts: Date.now(), date: a.date, mood: clamp(a.mood, 1, 5), stress: clamp(a.stress, 1, 5), note: a.note.trim().slice(0, 1000) },
        ],
      };
    }
    case 'deleteEntry':
      return { ...state, journal: state.journal.filter((e) => e.id !== a.id) };
    case 'targets':
      return { ...state, settings: { ...state.settings, targets: a.targets } };
    case 'toggleIgnore': {
      const ign = state.settings.ignored;
      return { ...state, settings: { ...state.settings, ignored: ign.includes(a.id) ? ign.filter((x) => x !== a.id) : [...ign, a.id] } };
    }
    case 'motion':
      return { ...state, settings: { ...state.settings, motion: a.pref } };
    case 'equip':
      return { ...state, equipped: { ...state.equipped, [a.slot]: a.id } };
    case 'loadDemo': {
      const demo = demoData(a.today);
      const days = { ...state.days };
      // never overwrite a day that already holds real entries
      for (const [k, d] of Object.entries(demo.days)) {
        const existing = days[k];
        const hasReal = existing && !existing.demo && (existing.water || existing.meals || existing.moveMinutes || existing.steps || existing.breaths || existing.sleepHours !== null || existing.customDone.length);
        if (!hasReal) days[k] = d;
      }
      const journal = [...state.journal.filter((e) => !e.demo), ...demo.journal].sort((x, y) => x.ts - y.ts);
      return { ...state, days, journal, seeded: true };
    }
    case 'clearDemo': {
      const days: Record<string, DayLog> = {};
      for (const [k, d] of Object.entries(state.days)) if (!d.demo) days[k] = d;
      return { ...state, days, journal: state.journal.filter((e) => !e.demo) };
    }
    case 'reset':
      return { ...freshState(), seeded: true };
    case 'markSeeded':
      return { ...state, seeded: true };
  }
}
