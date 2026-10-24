import { INDICATORS } from '../data/catalog';
import type { AppState, IndicatorId, IndicatorReading } from '../types';
import { dayPart, type DayPart } from './date';
import { engineCondition, fmtNum, getDay, latestEntry, readings } from './metrics';

export interface Report {
  headline: string;
  lines: string[];
  focus: IndicatorId | null;
  suggestion: string | null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

const pick = <T,>(arr: T[], seed: number, salt = 0): T => arr[(seed + salt * 7919) % arr.length];

const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/** A gentle, concrete next step for one indicator. */
function nudge(id: IndicatorId, s: AppState, date: string, part: DayPart, seed: number): string {
  const d = getDay(s, date);
  const t = s.settings.targets;
  switch (id) {
    case 'cooling': {
      const left = Math.max(0, t.waterGlasses - d.water);
      if (d.water === 0) return pick(['The coolant tower is dry. One glass of water would get it circulating again.', 'No coolant logged yet. A glass of water is the easiest first step today.'], seed);
      if (left === 1) return 'One more glass of water would bring the cooling system to today’s target.';
      return pick([
        `Your cooling system is running low. ${plural(Math.min(left, 2), 'glass', 'glasses')} of water would bring you closer to today’s ${t.waterGlasses}-glass target.`,
        `The coolant tower sits at ${d.water} of ${t.waterGlasses}. Another glass or two will steady the temperature.`,
      ], seed);
    }
    case 'rest':
      if (d.sleepHours === null) return pick(['The maintenance crew is waiting for orders. Record last night’s sleep so it can start repairs.', 'Rest hasn’t been logged yet. Record last night’s sleep to start the repair cycle.'], seed);
      return part === 'evening' || part === 'night'
        ? 'Rest reserves are a little light today. An unhurried wind-down tonight counts as maintenance, too.'
        : 'Rest reserves are a little light today. Running at a gentler pace is a perfectly good setting.';
    case 'motion': {
      if (part === 'night') return 'The pistons are resting for the night. Tomorrow’s first steps will start them up again.';
      if (d.moveMinutes === 0 && d.steps === 0)
        return pick([`The pistons are still. A 10-minute walk, or about 1,000 steps, would set the flywheel turning.`, `No exercise or steps logged yet. Ten easy minutes of any kind will start the pistons.`], seed);
      // describe whichever route is closer to its target
      const minFrac = d.moveMinutes / t.moveMinutes;
      const stepFrac = d.steps / t.steps;
      if (stepFrac >= minFrac) {
        const left = Math.max(0, Math.ceil((t.steps - d.steps) / 100) * 100);
        return `The flywheel is turning. About ${left.toLocaleString()} more steps would bring it up to your target speed.`;
      }
      const left = Math.max(0, t.moveMinutes - d.moveMinutes);
      return `The flywheel is turning. About ${left} more ${left === 1 ? 'minute' : 'minutes'} of exercise would bring it up to your target speed.`;
    }
    case 'fuel':
      if (d.meals === 0) return pick(['The firebox is waiting for coal. Mark a nourishing meal when you have one.', 'No fuel logged yet. When you sit down to a proper meal, mark it here.'], seed);
      return `The firebox has ${plural(d.meals, 'meal', 'meals')} of fuel. One more nourishing meal will keep the boiler glowing.`;
    case 'equilibrium': {
      const e = latestEntry(s.journal, date);
      if (!e) return 'The pressure regulator has no reading. A quick mood and stress check-in calibrates the main dial.';
      if (e.stress >= 4) return 'Pressure is running high. A one-minute breathing break opens the release valve. No fixing required, just a pause.';
      return 'A short breathing break would let off a little steam and settle the main dial.';
    }
  }
}

export function buildReport(state: AppState, date: string, now: Date = new Date()): Report {
  const rs = readings(state, date);
  const cond = engineCondition(state, date);
  const part = dayPart(now);
  const tracked = rs.filter((r) => !r.ignored);
  const sig = `${date}|${tracked.map((r) => `${r.id}:${r.value === null ? 'n' : r.value.toFixed(2)}`).join(',')}`;
  const seed = hash(sig);

  const logged = tracked.filter((r) => r.value !== null && r.value > 0);
  if (tracked.length === 0) {
    return {
      headline: 'All indicators are set to ignore.',
      lines: ['The engine idles in neutral. Re-enable any indicator on the Habits page whenever you like.'],
      focus: null,
      suggestion: null,
    };
  }

  if (logged.length === 0) {
    const opening: Record<DayPart, string> = {
      morning: 'Good morning. The boiler is cold and ready for its first coal.',
      afternoon: 'Good afternoon. The engine is waiting quietly for today’s first entry.',
      evening: 'Good evening. The engine hasn’t been tended today, and that’s alright.',
      night: 'Late watch. Nothing logged today, and that’s alright.',
    };
    return {
      headline: opening[part],
      lines: ['Any single task lights the boiler: a glass of water, last night’s sleep, or a quick check-in.'],
      focus: 'cooling',
      suggestion: nudge(state.settings.ignored.includes('rest') ? 'cooling' : 'rest', state, date, part, seed),
    };
  }

  // the indicator most in need — skip motion late at night
  const candidates = tracked
    .filter((r) => !(r.id === 'motion' && part === 'night'))
    .filter((r) => !(r.id === 'equilibrium' && !!latestEntry(state.journal, date) && getDay(state, date).breaths >= state.settings.targets.breaths))
    .map((r) => ({ r, v: r.value ?? -0.01 }))
    .sort((a, b) => a.v - b.v);
  const weakest = candidates[0]?.r;
  const strongest = [...logged].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  // Equilibrium has no "target" — a check-in plus the day's breathing breaks counts as done.
  const dd = getDay(state, date);
  const eqDone = !!latestEntry(state.journal, date) && dd.breaths >= state.settings.targets.breaths;
  const complete = tracked.filter((r) => (r.id === 'equilibrium' ? eqDone : (r.value ?? 0) >= 0.999));

  const headlines: Record<typeof cond.state, string[]> = {
    cold: ['The engine is warming up.', 'First coals are in. The boiler is warming.'],
    idle: ['The engine is idling and ready for more.', 'A steady idle. The works are turning over.'],
    steady: ['The engine is running steadily.', 'Good, even pressure across the works.'],
    full: ['Full steam. Every system is humming.', 'The engine is running at full steam.'],
  };
  const lines: string[] = [];

  if (strongest && (strongest.value ?? 0) >= 0.6) lines.push(praise(strongest, seed));
  if (complete.length >= 2 && complete.length < tracked.length) {
    const names = complete.map((r) => INDICATORS[r.id].name);
    const list = names.length === 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    lines.push(`${list} ${names.length === 2 ? 'are' : 'are all'} at target today.`);
  }

  const done = complete.length === tracked.length;
  let suggestion: string | null = null;
  let focus: IndicatorId | null = null;
  if (done) {
    lines.push(pick(['Every gauge reads at target. There is nothing left to fix today, so enjoy the hum.', 'All systems are at target. A fine day’s engineering.'], seed));
  } else if (weakest) {
    focus = weakest.id;
    suggestion = nudge(weakest.id, state, date, part, seed);
  }

  return { headline: pick(headlines[cond.state], seed), lines: lines.slice(0, 2), focus, suggestion };
}

function praise(r: IndicatorReading, seed: number): string {
  const options: Record<IndicatorId, string[]> = {
    rest: ['The governor spins true. Logged rest has the repair crew in good form.', 'Rest is well recorded, and the maintenance crew has the machine in good repair.'],
    cooling: ['The coolant tower is well topped up and the works are running cool.', 'Cooling is in good order. The pipes are running clear.'],
    motion: ['The pistons are pumping. Your movement has the flywheel spinning nicely.', 'Plenty of motion today. The flywheel has real momentum.'],
    fuel: ['The firebox is glowing on good fuel.', 'The boiler is well fed and the firelight is steady.'],
    equilibrium: ['The pressure dial sits in a comfortable band.', 'Pressure is balanced. The regulator is content.'],
  };
  return pick(options[r.id], seed, 3);
}
