import type { AppState, DayLog, JournalEntry } from '../types';
import { addDays, dateKey, parseKey } from '../lib/date';

// Sample entries so the first launch has some history. Every record carries `demo: true`
// so it can be labelled in the UI and removed in one action without touching real entries.

type DemoDay = Omit<DayLog, 'date' | 'customDone' | 'demo' | 'stamps'> & { offset: number };

const DAYS: DemoDay[] = [
  { offset: -6, sleepHours: 6.5, water: 3, moveMinutes: 0, steps: 4200, meals: 1, breaths: 0 },
  // a few quiet days — the engine simply waits
  { offset: -2, sleepHours: 7.5, water: 4, moveMinutes: 0, steps: 0, meals: 2, breaths: 0 },
  // today's sample readings are a visual preview only: they earn no XP and vanish on your first entry
  { offset: 0, sleepHours: 7, water: 3, moveMinutes: 0, steps: 2600, meals: 1, breaths: 0 },
];

const ENTRIES: { offset: number; hour: number; mood: number; stress: number; note: string }[] = [
  { offset: -6, hour: 21, mood: 3, stress: 4, note: '' },
  { offset: -2, hour: 20, mood: 4, stress: 2, note: 'Back after a few hectic days. Felt good to slow down and cook a real dinner.' },
];

export function demoData(today: string = dateKey()): Pick<AppState, 'days' | 'journal'> {
  const days: Record<string, DayLog> = {};
  for (const d of DAYS) {
    const date = addDays(today, d.offset);
    days[date] = {
      date,
      sleepHours: d.sleepHours,
      water: d.water,
      moveMinutes: d.moveMinutes,
      steps: d.steps,
      meals: d.meals,
      breaths: d.breaths,
      customDone: [],
      demo: true,
    };
  }
  const journal: JournalEntry[] = ENTRIES.map((e, i) => {
    const date = addDays(today, e.offset);
    const t = parseKey(date);
    t.setHours(e.hour, 10 + i * 7);
    return { id: `demo_${i}`, ts: t.getTime(), date, mood: e.mood, stress: e.stress, note: e.note, demo: true };
  });
  return { days, journal };
}

export function hasDemo(state: AppState): boolean {
  return Object.values(state.days).some((d) => d.demo) || state.journal.some((e) => e.demo);
}
