import { COSMETICS, type CosmeticItem, type Requirement } from '../data/catalog';
import type { AppState, DayLog } from '../types';
import { addDays, dateKey, dayDiff } from './date';
import { entriesFor } from './metrics';

// ─── Experience rules ───────────────────────────────────────────────────────
// XP is a pure function of what is logged, with per-day caps. Repeated clicking
// can't inflate it past the cap, and undoing an entry removes the XP it gave.
export const XP_RULES = [
  { key: 'water', label: 'Glass of water', each: 5, cap: 50, note: '5 XP per glass, up to 10 glasses a day' },
  { key: 'sleep', label: 'Sleep recorded', each: 20, cap: 20, note: '20 XP once per day — any amount of rest counts' },
  { key: 'move', label: 'Exercise or steps', each: 1, cap: 40, note: '1 XP per exercise minute or per 200 steps, whichever is higher, up to 40 a day' },
  { key: 'meals', label: 'Nourishing meal', each: 10, cap: 30, note: '10 XP per meal, up to 3 a day' },
  { key: 'breaths', label: 'Breathing break', each: 10, cap: 30, note: '10 XP per break, up to 3 a day' },
  { key: 'checkin', label: 'Mood & stress check-in', each: 15, cap: 15, note: '15 XP once per day' },
  { key: 'reflection', label: 'Written reflection', each: 10, cap: 10, note: '+10 XP once per day for a reflection of 20+ characters' },
  { key: 'custom', label: 'Your own habits', each: 10, cap: 80, note: '10 XP per custom habit completed' },
  { key: 'service', label: 'Full service bonus', each: 25, cap: 25, note: '+25 XP when every maintenance task is touched in one day' },
  { key: 'recovery', label: 'Welcome-back bonus', each: 20, cap: 20, note: '+20 XP the first day you return after 2+ days away' },
  { key: 'achievement', label: 'Commendation', each: 25, cap: Infinity, note: '+25 XP for each achievement earned' },
] as const;

export type XpKey = (typeof XP_RULES)[number]['key'];

export function isActive(day: DayLog | undefined, journalCount: number): boolean {
  if (!day) return journalCount > 0;
  return (
    journalCount > 0 ||
    day.water > 0 ||
    day.sleepHours !== null ||
    day.moveMinutes > 0 ||
    day.steps > 0 ||
    day.meals > 0 ||
    day.breaths > 0 ||
    day.customDone.length > 0
  );
}

export function activeDates(state: AppState): string[] {
  const set = new Set<string>();
  for (const [k, d] of Object.entries(state.days)) {
    if (isActive(d, 0)) set.add(k);
  }
  for (const e of state.journal) set.add(e.date);
  return Array.from(set).sort();
}

export function dayXp(state: AppState, date: string, prevActive: string | null, today?: string): Partial<Record<XpKey, number>> {
  const raw = state.days[date];
  // today's sample readings are a preview only and never earn XP
  const d = raw?.demo && date === today ? undefined : raw;
  const entries = entriesFor(state.journal, date);
  const out: Partial<Record<XpKey, number>> = {};
  if (!isActive(d, entries.length)) return out;
  const ign = new Set(state.settings.ignored);
  if (d) {
    out.water = Math.min(50, d.water * 5);
    out.sleep = d.sleepHours !== null ? 20 : 0;
    out.move = Math.min(40, Math.max(d.moveMinutes, Math.floor(d.steps / 200)));
    out.meals = Math.min(30, d.meals * 10);
    out.breaths = Math.min(30, d.breaths * 10);
    out.custom = Math.min(80, d.customDone.length * 10);
  }
  out.checkin = entries.length ? 15 : 0;
  out.reflection = entries.some((e) => e.note.trim().length >= 20) ? 10 : 0;
  const touched = {
    cooling: ign.has('cooling') || (d?.water ?? 0) > 0,
    rest: ign.has('rest') || (d?.sleepHours ?? null) !== null,
    motion: ign.has('motion') || (d?.moveMinutes ?? 0) > 0 || (d?.steps ?? 0) > 0,
    fuel: ign.has('fuel') || (d?.meals ?? 0) > 0,
    eq: ign.has('equilibrium') || ((d?.breaths ?? 0) > 0 && entries.length > 0),
  };
  out.service = Object.values(touched).every(Boolean) ? 25 : 0;
  out.recovery = prevActive && dayDiff(prevActive, date) >= 3 ? 20 : 0; // 2+ full days away
  return out;
}

// ─── Levels ─────────────────────────────────────────────────────────────────
// Level L requires sum_{k=1}^{L-1} (100 + 50(k-1)) XP: 0, 100, 250, 450, 700, 1000, 1350...
export function xpForLevel(level: number): number {
  let total = 0;
  for (let k = 1; k < level; k++) total += 100 + 50 * (k - 1);
  return total;
}

export function levelFor(xp: number): { level: number; into: number; span: number; next: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - base, span: next - base, next };
}

export const LEVEL_TITLES = ['Apprentice Stoker', 'Journeyman Fitter', 'Boilermaker', 'Gauge Keeper', 'Master Mechanic', 'Chief Engineer', 'Steam Laureate', 'Grand Artificer'];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1];

// ─── Streaks — counted gently: today isn't "missed" until it's over ───────────
export function streaks(dates: string[], today: string = dateKey()) {
  const set = new Set(dates);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) => set.has(d)).length;
  return { current, best, last7, todayActive: set.has(today) };
}

// ─── Achievements ───────────────────────────────────────────────────────────
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  goal: number;
  progress: (c: Ctx) => number;
}

interface Ctx {
  state: AppState;
  dates: string[];
  bestStreak: number;
  level: number;
}

const daysWhere = (s: AppState, f: (d: DayLog) => boolean) => Object.values(s.days).filter(f).length;

function bestWindow(dates: string[], window: number): number {
  let best = 0;
  for (let i = 0; i < dates.length; i++) {
    let j = i;
    while (j + 1 < dates.length && dayDiff(dates[i], dates[j + 1]) < window) j++;
    best = Math.max(best, j - i + 1);
  }
  return best;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_spark', name: 'First Spark', description: 'Record your first habit of any kind.', goal: 1, progress: (c) => Math.min(1, c.dates.length) },
  {
    id: 'full_service',
    name: 'Full Service',
    description: 'Touch every maintenance task in a single day.',
    goal: 1,
    progress: (c) => (c.dates.some((d) => (dayXp(c.state, d, null).service ?? 0) > 0) ? 1 : 0),
  },
  {
    id: 'cooling_engineer',
    name: 'Cooling Engineer',
    description: 'Reach your water target on 3 different days.',
    goal: 3,
    progress: (c) => daysWhere(c.state, (d) => d.water >= c.state.settings.targets.waterGlasses),
  },
  { id: 'night_shift', name: 'Night Shift Crew', description: 'Record your sleep on 5 days. Rest is maintenance, too.', goal: 5, progress: (c) => daysWhere(c.state, (d) => d.sleepHours !== null) },
  {
    id: 'piston_power',
    name: 'Piston Power',
    description: 'Meet your exercise or step target on 3 days.',
    goal: 3,
    progress: (c) => daysWhere(c.state, (d) => d.moveMinutes >= c.state.settings.targets.moveMinutes || d.steps >= c.state.settings.targets.steps),
  },
  { id: 'steady_hand', name: 'Steady Hand', description: 'Complete 3 mood & stress check-ins.', goal: 3, progress: (c) => c.state.journal.length },
  { id: 'release_valve', name: 'Release Valve', description: 'Take 5 breathing breaks in total.', goal: 5, progress: (c) => Object.values(c.state.days).reduce((a, d) => a + d.breaths, 0) },
  {
    id: 'back_at_throttle',
    name: 'Back at the Throttle',
    description: 'Return after two or more days away. Coming back is the skill that matters.',
    goal: 1,
    progress: (c) => (c.dates.some((d, i) => i > 0 && dayDiff(c.dates[i - 1], d) >= 3) ? 1 : 0),
  },
  { id: 'steady_rhythm', name: 'Steady Rhythm', description: 'Tend the engine three days in a row.', goal: 3, progress: (c) => c.bestStreak },
  { id: 'good_week', name: 'Consistency over Perfection', description: 'Tend the engine on any 5 days within a 7-day stretch.', goal: 5, progress: (c) => bestWindow(c.dates, 7) },
  { id: 'tinkerer', name: 'Tinkerer', description: 'Add a habit of your own to the maintenance list.', goal: 1, progress: (c) => Math.min(1, c.state.customHabits.length) },
  { id: 'master_mechanic', name: 'Master Mechanic', description: 'Reach level 5.', goal: 5, progress: (c) => c.level },
];

// ─── Full progression snapshot ──────────────────────────────────────────────
export interface Progress {
  xp: number;
  level: number;
  into: number;
  span: number;
  title: string;
  earned: Set<string>;
  achievementProgress: Record<string, number>;
  streak: { current: number; best: number; last7: number; todayActive: boolean };
  todayXp: Partial<Record<XpKey, number>>;
  todayTotal: number;
  unlocked: Set<string>;
}

export function computeProgress(state: AppState, today: string = dateKey()): Progress {
  const dates = activeDates(state);
  let base = 0;
  let todayXp: Partial<Record<XpKey, number>> = {};
  dates.forEach((d, i) => {
    const x = dayXp(state, d, i > 0 ? dates[i - 1] : null, today);
    if (d === today) todayXp = x;
    base += Object.values(x).reduce((a, b) => a + (b ?? 0), 0);
  });
  const st = streaks(dates, today);
  const earned = new Set<string>();
  const achievementProgress: Record<string, number> = {};
  // Pass 1: everything except level-based achievements
  const pre = levelFor(base).level;
  let ctx: Ctx = { state, dates, bestStreak: st.best, level: pre };
  for (const a of ACHIEVEMENTS) {
    if (a.id === 'master_mechanic') continue;
    const p = a.progress(ctx);
    achievementProgress[a.id] = Math.min(p, a.goal);
    if (p >= a.goal) earned.add(a.id);
  }
  let xp = base + earned.size * 25;
  // Pass 2: level-based achievement
  ctx = { ...ctx, level: levelFor(xp).level };
  const mm = ACHIEVEMENTS.find((a) => a.id === 'master_mechanic')!;
  achievementProgress[mm.id] = Math.min(mm.progress(ctx), mm.goal);
  if (mm.progress(ctx) >= mm.goal) {
    earned.add(mm.id);
    xp += 25;
  }
  const lv = levelFor(xp);
  const unlocked = new Set(COSMETICS.filter((c) => meets(c.requirement, lv.level, earned)).map((c) => c.id));
  const todayTotal = Object.values(todayXp).reduce((a, b) => a + (b ?? 0), 0);
  return { xp, level: lv.level, into: lv.into, span: lv.span, title: levelTitle(lv.level), earned, achievementProgress, streak: st, todayXp, todayTotal, unlocked };
}

export function meets(r: Requirement, level: number, earned: Set<string>): boolean {
  if (r.kind === 'none') return true;
  if (r.kind === 'level') return level >= r.level;
  return earned.has(r.id);
}

export function requirementText(item: CosmeticItem): string {
  const r = item.requirement;
  if (r.kind === 'none') return 'Standard issue';
  if (r.kind === 'level') return `Reach level ${r.level}`;
  const a = ACHIEVEMENTS.find((x) => x.id === r.id);
  return `Earn “${a?.name ?? r.id}”`;
}
