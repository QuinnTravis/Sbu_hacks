import { useState, type FormEvent, type ReactNode } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatTime } from '../lib/date';
import { fmtNum, getDay, latestEntry, MOOD_LABELS, STRESS_LABELS } from '../lib/metrics';
import { useStore } from '../state/store';
import type { StampKey } from '../types';
import BreathingModal from './BreathingModal';
import { ScalePicker, Tick } from './ui';

function Row({ refId, id, task, sub, reading, children }: { refId: string; id?: string; task: string; sub?: ReactNode; reading: ReactNode; children: ReactNode }) {
  return (
    <div className="log-row" id={id} tabIndex={id ? -1 : undefined}>
      <span className="ref">{refId}</span>
      <div className="task">
        {task}
        {sub && <small>{sub}</small>}
      </div>
      <div className="reading">{reading}</div>
      <div className="acts">{children}</div>
    </div>
  );
}

/** The daily maintenance logbook: one ruled line per task, written on paper. */
export default function Logbook() {
  const { state, today, act, reducedMotion } = useStore();
  const d = getDay(state, today);
  const t = state.settings.targets;
  const ign = new Set(state.settings.ignored);
  const entry = latestEntry(state.journal, today);
  const sample = !!d.demo;

  const [sleepIn, setSleepIn] = useState('');
  const [moveIn, setMoveIn] = useState('');
  const [stepsIn, setStepsIn] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [habit, setHabit] = useState('');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [breathing, setBreathing] = useState(false);
  const err = (k: string, m?: string) => setErrs((e) => ({ ...e, [k]: m }));

  const stampLine = (k: StampKey) => {
    const ts = !sample ? d.stamps?.[k] : undefined;
    return ts ? <small>last at {formatTime(ts)}</small> : null;
  };
  const met = (ok: boolean) => (ok ? <small className="met">target met</small> : null);

  const submitSleep = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(sleepIn);
    if (sleepIn.trim() === '' || !Number.isFinite(n)) return err('sleep', 'Enter hours as a number, for example 7.5.');
    if (n < 0 || n > 16) return err('sleep', 'Enter between 0 and 16 hours.');
    err('sleep');
    setSleepIn('');
    act({ type: 'sleep', date: today, hours: n }, { pulse: 'repair', label: 'Rest recorded' });
  };
  const submitMove = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(moveIn);
    if (moveIn.trim() === '' || !Number.isInteger(n)) return err('move', 'Enter whole minutes.');
    if (n < 1 || n > 300) return err('move', 'Enter between 1 and 300 minutes.');
    err('move');
    setMoveIn('');
    act({ type: 'move', date: today, delta: n }, { pulse: 'motion', label: `${n} minutes of exercise` });
  };
  const submitSteps = (e: FormEvent) => {
    e.preventDefault();
    const clean = stepsIn.replace(/[,\s]/g, '');
    const n = Number(clean);
    if (clean === '' || !Number.isInteger(n)) return err('steps', 'Enter today’s total as a whole number.');
    if (n < 0 || n > 100000) return err('steps', 'Enter between 0 and 100,000 steps.');
    err('steps');
    setStepsIn('');
    act({ type: 'steps', date: today, steps: n }, { pulse: 'motion', label: `${n.toLocaleString()} steps` });
  };
  const submitCheckin = () => {
    if (mood === null || stress === null) return err('check', 'Choose a mood and a stress level.');
    err('check');
    act({ type: 'journal', date: today, mood, stress, note: '' }, { pulse: 'equilibrium', label: 'Check-in recorded' });
    setMood(null);
    setStress(null);
  };
  const submitHabit = (e: FormEvent) => {
    e.preventDefault();
    const label = habit.trim();
    if (!label) return err('habit', 'Give the habit a short name.');
    if (label.length > 40) return err('habit', 'Keep it to 40 characters.');
    if (state.customHabits.length >= 8) return err('habit', 'You can keep up to 8 habits of your own. Remove one to add another.');
    if (state.customHabits.some((h) => h.label.toLowerCase() === label.toLowerCase())) return err('habit', 'That habit is already in the log.');
    err('habit');
    setHabit('');
    act({ type: 'addHabit', label }, { label: 'Habit added' });
  };

  const off = (k: string) => (ign.has(k as never) ? ' · not tracked' : '');

  return (
    <section className="logbook" aria-labelledby="log-title">
      <div className="sec-head">
        <h2 id="log-title">Daily maintenance</h2>
        <span className="aside">
          {sample ? (
            <>
              Today shows <span className="sample">sample</span> readings until you record your own. Your first entry replaces them.
            </>
          ) : (
            'Everything here is self-reported. The minus buttons undo an entry.'
          )}
        </span>
      </div>

      <div>
        <Row refId="A" task="Sleep" sub={`last night${off('rest')}`} reading={<>{d.sleepHours === null ? 'not recorded' : `${fmtNum(d.sleepHours)} h of ${fmtNum(t.sleepHours)}`}{stampLine('sleep')}</>}>
          <div className="chips" role="group" aria-label="Hours slept">
            {[6, 7, 7.5, 8, 9].map((h) => (
              <button key={h} className="chip" aria-pressed={!sample && d.sleepHours === h} onClick={() => act({ type: 'sleep', date: today, hours: h }, { pulse: 'repair', label: 'Rest recorded' })}>
                {h} h
              </button>
            ))}
          </div>
          <form className="inline" onSubmit={submitSleep} noValidate>
            <label className="sr-only" htmlFor="sleep-in">
              Other amount, in hours
            </label>
            <input id="sleep-in" className="input" inputMode="decimal" placeholder="Other, e.g. 6.75" value={sleepIn} onChange={(e) => setSleepIn(e.target.value)} aria-invalid={!!errs.sleep} aria-describedby={errs.sleep ? 'sleep-err' : undefined} />
            <button className="btn sm" type="submit">
              Record
            </button>
            {d.sleepHours !== null && !sample && (
              <button className="btn sm quiet" type="button" onClick={() => act({ type: 'sleep', date: today, hours: null })}>
                Clear
              </button>
            )}
          </form>
          {errs.sleep && <span className="error" id="sleep-err" role="alert">{errs.sleep}</span>}
        </Row>

        <Row refId="B" id="row-cooling" task="Water" sub={`glasses${off('cooling')}`} reading={<>{d.water} of {t.waterGlasses}{met(d.water >= t.waterGlasses)}{stampLine('water')}</>}>
          <button className="btn primary" onClick={() => act({ type: 'water', date: today, delta: 1 }, { pulse: 'cooling', label: 'Glass of water' })} disabled={d.water >= 40}>
            <Plus /> Add a glass
          </button>
          <button className="btn icon quiet" onClick={() => act({ type: 'water', date: today, delta: -1 }, { pulse: 'cooling' })} disabled={d.water === 0 || sample} aria-label="Remove a glass">
            <Minus />
          </button>
        </Row>

        <Row refId="C" task="Exercise" sub={`minutes of any kind${off('motion')}`} reading={<>{d.moveMinutes} of {t.moveMinutes} min{met(d.moveMinutes >= t.moveMinutes)}{stampLine('move')}</>}>
          <div className="chips" role="group" aria-label="Add exercise minutes">
            {[10, 20, 30].map((m) => (
              <button key={m} className="chip" onClick={() => act({ type: 'move', date: today, delta: m }, { pulse: 'motion', label: `${m} minutes of exercise` })}>
                +{m}
              </button>
            ))}
            <button className="chip" onClick={() => act({ type: 'move', date: today, delta: -10 }, { pulse: 'motion' })} disabled={d.moveMinutes === 0 || sample} aria-label="Remove 10 minutes">
              −10
            </button>
          </div>
          <form className="inline" onSubmit={submitMove} noValidate>
            <label className="sr-only" htmlFor="move-in">
              Workout length in minutes
            </label>
            <input id="move-in" className="input" inputMode="numeric" placeholder="Minutes" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} aria-invalid={!!errs.move} aria-describedby={errs.move ? 'move-err' : undefined} />
            <button className="btn sm" type="submit">
              Add workout
            </button>
          </form>
          {errs.move && <span className="error" id="move-err" role="alert">{errs.move}</span>}
        </Row>

        <Row refId="C" task="Steps" sub="or today’s total from a pedometer" reading={<>{d.steps.toLocaleString()} of {t.steps.toLocaleString()}{met(d.steps >= t.steps)}{stampLine('steps')}</>}>
          <form className="inline" onSubmit={submitSteps} noValidate>
            <label className="sr-only" htmlFor="steps-in">
              Today’s step count
            </label>
            <input id="steps-in" className="input" inputMode="numeric" placeholder="e.g. 6,400" value={stepsIn} onChange={(e) => setStepsIn(e.target.value)} aria-invalid={!!errs.steps} aria-describedby="steps-h" />
            <button className="btn sm" type="submit">
              Set total
            </button>
          </form>
          <span className={errs.steps ? 'error' : 'hint'} id="steps-h" role={errs.steps ? 'alert' : undefined}>
            {errs.steps ?? 'Exercise or steps: whichever is further along drives the flywheel.'}
          </span>
        </Row>

        <Row refId="D" id="row-fuel" task="Nourishing meal" sub={`you decide what counts${off('fuel')}`} reading={<>{d.meals} of {t.meals}{met(d.meals >= t.meals)}{stampLine('meals')}</>}>
          <button className="btn primary" onClick={() => act({ type: 'meal', date: today, delta: 1 }, { pulse: 'fuel', label: 'Nourishing meal' })} disabled={d.meals >= 8}>
            <Plus /> Mark a meal
          </button>
          <button className="btn icon quiet" onClick={() => act({ type: 'meal', date: today, delta: -1 }, { pulse: 'fuel' })} disabled={d.meals === 0 || sample} aria-label="Remove a meal">
            <Minus />
          </button>
        </Row>

        <Row refId="E" task="Breathing break" sub="about one minute" reading={<>{d.breaths} of {t.breaths}{met(d.breaths >= t.breaths)}{stampLine('breaths')}</>}>
          <button className="btn primary" onClick={() => setBreathing(true)}>
            Begin a break
          </button>
          <button className="btn sm" onClick={() => act({ type: 'breath', date: today, delta: 1 }, { pulse: 'vent', label: 'Breathing break' })} disabled={d.breaths >= 12}>
            Log one I took
          </button>
          <button className="btn icon quiet" onClick={() => act({ type: 'breath', date: today, delta: -1 })} disabled={d.breaths === 0 || sample} aria-label="Remove a breathing break">
            <Minus />
          </button>
        </Row>

        <Row
          refId="E"
          id="row-equilibrium"
          task="Mood and stress"
          sub={`a quick check-in${off('equilibrium')}`}
          reading={
            entry ? (
              <>
                {MOOD_LABELS[entry.mood - 1]}, {STRESS_LABELS[entry.stress - 1].toLowerCase()}
                <small>last at {formatTime(entry.ts)}</small>
              </>
            ) : (
              'no check-in'
            )
          }
        >
          <div className="stack">
            <ScalePicker kind="mood" value={mood} onChange={setMood} name="Mood" />
            <ScalePicker kind="stress" value={stress} onChange={setStress} name="Stress" />
            <div className="inline">
              <button className="btn sm" onClick={submitCheckin}>
                Record check-in
              </button>
              <a className="hint" href="#/journal">
                Add a written reflection in the Journal
              </a>
            </div>
            {errs.check && <span className="error" role="alert">{errs.check}</span>}
          </div>
        </Row>

        {state.customHabits.map((h) => {
          const on = d.customDone.includes(h.id);
          return (
            <div key={h.id} className="log-row">
              <span className="ref">·</span>
              <div className={`custom-line${on ? ' done' : ''}`}>
                <Tick checked={on} label={`Mark “${h.label}” ${on ? 'not done' : 'done'}`} onChange={() => act({ type: 'toggleCustom', date: today, id: h.id }, { label: h.label })} />
                <span className="lbl task" style={{ fontWeight: 600 }}>{h.label}</span>
              </div>
              <div className="reading">
                {on ? 'done' : 'not yet'}
                {on && stampLine('custom')}
              </div>
              <div className="acts">
                <button className="btn sm quiet" onClick={() => act({ type: 'removeHabit', id: h.id }, { silent: true })} aria-label={`Remove “${h.label}” from the log`}>
                  <Trash2 /> Remove
                </button>
              </div>
            </div>
          );
        })}

        <div className="log-row">
          <span className="ref">+</span>
          <div className="task">
            A habit of your own
            <small>{state.customHabits.length ? `${state.customHabits.length} of 8 added` : 'for example, stretch after lectures'}</small>
          </div>
          <div className="reading" />
          <div className="acts">
            <form className="inline" onSubmit={submitHabit} noValidate style={{ width: '100%' }}>
              <label className="sr-only" htmlFor="habit-in">
                New habit
              </label>
              <input id="habit-in" className="input" style={{ flex: 1, minWidth: 160, width: 'auto' }} placeholder="Name the habit" maxLength={60} value={habit} onChange={(e) => setHabit(e.target.value)} aria-invalid={!!errs.habit} aria-describedby={errs.habit ? 'habit-err' : undefined} />
              <button className="btn sm" type="submit">
                Add to log
              </button>
            </form>
            {errs.habit && <span className="error" id="habit-err" role="alert">{errs.habit}</span>}
          </div>
        </div>
      </div>

      {breathing && (
        <BreathingModal
          reducedMotion={reducedMotion}
          onClose={() => setBreathing(false)}
          onComplete={() => {
            setBreathing(false);
            act({ type: 'breath', date: today, delta: 1 }, { pulse: 'vent', label: 'Breathing break' });
          }}
        />
      )}
    </section>
  );
}
