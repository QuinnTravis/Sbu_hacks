import { useState, type FormEvent } from 'react';
import { Check, Droplets, Footprints, Gauge, Minus, Moon, Plus, Trash2, UtensilsCrossed, Wind, Wrench } from 'lucide-react';
import { getDay, latestEntry, MOOD_LABELS, STRESS_LABELS, fmtNum } from '../lib/metrics';
import { useStore } from '../state/store';
import BreathingModal from './BreathingModal';
import { ScalePicker, Toggle } from './ui';

export default function Checklist() {
  const { state, today, act, reducedMotion } = useStore();
  const d = getDay(state, today);
  const t = state.settings.targets;
  const ign = new Set(state.settings.ignored);
  const entry = latestEntry(state.journal, today);

  const [sleepInput, setSleepInput] = useState('');
  const [sleepErr, setSleepErr] = useState<string | null>(null);
  const [moveInput, setMoveInput] = useState('');
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [breathing, setBreathing] = useState(false);
  const [habitLabel, setHabitLabel] = useState('');
  const [habitErr, setHabitErr] = useState<string | null>(null);

  const done = {
    water: d.water >= t.waterGlasses,
    sleep: d.sleepHours !== null,
    move: d.moveMinutes >= t.moveMinutes,
    meals: d.meals >= t.meals,
    breath: d.breaths >= t.breaths,
    mood: entry !== null,
  };
  const tended = [d.water > 0, done.sleep, d.moveMinutes > 0, d.meals > 0, d.breaths > 0, done.mood].filter(Boolean).length;

  const submitSleep = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(sleepInput);
    if (sleepInput.trim() === '' || !Number.isFinite(n)) return setSleepErr('Enter hours, e.g. 7.5');
    if (n < 0 || n > 16) return setSleepErr('Between 0 and 16 hours, please');
    setSleepErr(null);
    setSleepInput('');
    act({ type: 'sleep', date: today, hours: n }, { pulse: 'repair', label: 'Rest recorded' });
  };

  const submitMove = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(moveInput);
    if (moveInput.trim() === '' || !Number.isInteger(n)) return setMoveErr('Whole minutes, please');
    if (n < 1 || n > 300) return setMoveErr('Between 1 and 300 minutes');
    setMoveErr(null);
    setMoveInput('');
    act({ type: 'move', date: today, delta: n }, { pulse: 'motion', label: `${n} minutes of movement` });
  };

  const submitCheckin = () => {
    if (mood === null || stress === null) return setCheckErr('Choose both a mood and a stress level.');
    setCheckErr(null);
    act({ type: 'journal', date: today, mood, stress, note: '' }, { pulse: 'equilibrium', label: 'Check-in recorded' });
    setMood(null);
    setStress(null);
  };

  const submitHabit = (e: FormEvent) => {
    e.preventDefault();
    const label = habitLabel.trim();
    if (!label) return setHabitErr('Give the habit a short name.');
    if (label.length > 40) return setHabitErr('Keep it to 40 characters.');
    if (state.customHabits.length >= 8) return setHabitErr('Up to 8 custom habits. Remove one to add another.');
    if (state.customHabits.some((h) => h.label.toLowerCase() === label.toLowerCase())) return setHabitErr('That habit is already on the list.');
    setHabitErr(null);
    setHabitLabel('');
    act({ type: 'addHabit', label }, { label: 'New habit added' });
  };

  const NotTracked = ({ id }: { id: string }) => (ign.has(id as never) ? <span className="tag self">Not tracked</span> : null);

  return (
    <section className="plate rivets" aria-labelledby="maint-title">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Daily maintenance</div>
          <h2 id="maint-title">Tend the engine</h2>
        </div>
        <span className="muted small">
          {tended} of 6 tasks touched today · every entry is self-reported
        </span>
      </div>

      <div className="checklist">
        {/* Water */}
        <div className={`task${done.water ? ' done' : ''}`}>
          <div className="task-top">
            <div className="ico"><Droplets /></div>
            <div>
              <div className="t">Log a glass of water</div>
              <div className="s">{d.water} of {t.waterGlasses} glasses · Cooling</div>
            </div>
            {done.water && <Check className="check" aria-label="Target reached" />}
            <NotTracked id="cooling" />
          </div>
          <div className="task-actions">
            <button className="btn primary" onClick={() => act({ type: 'water', date: today, delta: 1 }, { pulse: 'cooling', label: 'Glass of water' })} disabled={d.water >= 40}>
              <Plus /> Add a glass
            </button>
            <button className="btn sm icon ghost" onClick={() => act({ type: 'water', date: today, delta: -1 }, { pulse: 'cooling' })} disabled={d.water === 0} aria-label="Remove a glass">
              <Minus />
            </button>
          </div>
        </div>

        {/* Sleep */}
        <div className={`task${done.sleep ? ' done' : ''}`}>
          <div className="task-top">
            <div className="ico"><Moon /></div>
            <div>
              <div className="t">Record last night’s sleep</div>
              <div className="s">{d.sleepHours === null ? 'Not recorded yet' : `${fmtNum(d.sleepHours)} hours recorded`} · Rest</div>
            </div>
            {done.sleep && <Check className="check" aria-label="Recorded" />}
            <NotTracked id="rest" />
          </div>
          <div className="chip-row" role="group" aria-label="Quick sleep amounts">
            {[6, 7, 7.5, 8, 9].map((h) => (
              <button key={h} className="chip" aria-pressed={d.sleepHours === h} onClick={() => act({ type: 'sleep', date: today, hours: h }, { pulse: 'repair', label: 'Rest recorded' })}>
                {h}h
              </button>
            ))}
          </div>
          <form className="inline-form" onSubmit={submitSleep} noValidate>
            <label className="sr-only" htmlFor="sleep-in">Hours slept</label>
            <input id="sleep-in" className="input" inputMode="decimal" placeholder="Other, e.g. 6.75" value={sleepInput} onChange={(e) => setSleepInput(e.target.value)} aria-invalid={!!sleepErr} aria-describedby={sleepErr ? 'sleep-err' : undefined} />
            <button className="btn sm" type="submit">Record</button>
            {d.sleepHours !== null && (
              <button className="btn sm ghost" type="button" onClick={() => act({ type: 'sleep', date: today, hours: null })}>Clear</button>
            )}
          </form>
          {sleepErr && <div className="error" id="sleep-err" role="alert">{sleepErr}</div>}
        </div>

        {/* Movement */}
        <div className={`task${done.move ? ' done' : ''}`}>
          <div className="task-top">
            <div className="ico"><Footprints /></div>
            <div>
              <div className="t">Record movement</div>
              <div className="s">{d.moveMinutes} of {t.moveMinutes} minutes · Motion</div>
            </div>
            {done.move && <Check className="check" aria-label="Target reached" />}
            <NotTracked id="motion" />
          </div>
          <div className="chip-row" role="group" aria-label="Add movement minutes">
            {[10, 20, 30].map((m) => (
              <button key={m} className="chip" onClick={() => act({ type: 'move', date: today, delta: m }, { pulse: 'motion', label: `${m} minutes of movement` })}>
                +{m} min
              </button>
            ))}
            <button className="chip" onClick={() => act({ type: 'move', date: today, delta: -10 }, { pulse: 'motion' })} disabled={d.moveMinutes === 0} aria-label="Remove 10 minutes">
              −10
            </button>
          </div>
          <form className="inline-form" onSubmit={submitMove} noValidate>
            <label className="sr-only" htmlFor="move-in">Minutes of movement</label>
            <input id="move-in" className="input" inputMode="numeric" placeholder="Minutes" value={moveInput} onChange={(e) => setMoveInput(e.target.value)} aria-invalid={!!moveErr} aria-describedby={moveErr ? 'move-err' : undefined} />
            <button className="btn sm" type="submit">Add workout</button>
          </form>
          {moveErr && <div className="error" id="move-err" role="alert">{moveErr}</div>}
        </div>

        {/* Meals */}
        <div className={`task${done.meals ? ' done' : ''}`}>
          <div className="task-top">
            <div className="ico"><UtensilsCrossed /></div>
            <div>
              <div className="t">Mark a nourishing meal</div>
              <div className="s">{d.meals} of {t.meals} meals · Fuel</div>
            </div>
            {done.meals && <Check className="check" aria-label="Target reached" />}
            <NotTracked id="fuel" />
          </div>
          <div className="task-actions">
            <button className="btn primary" onClick={() => act({ type: 'meal', date: today, delta: 1 }, { pulse: 'fuel', label: 'Nourishing meal' })} disabled={d.meals >= 8}>
              <Plus /> Mark a meal
            </button>
            <button className="btn sm icon ghost" onClick={() => act({ type: 'meal', date: today, delta: -1 }, { pulse: 'fuel' })} disabled={d.meals === 0} aria-label="Remove a meal">
              <Minus />
            </button>
          </div>
          <div className="hint">You decide what “nourishing” means for you.</div>
        </div>

        {/* Breathing */}
        <div className={`task${done.breath ? ' done' : ''}`}>
          <div className="task-top">
            <div className="ico"><Wind /></div>
            <div>
              <div className="t">Take a short breathing break</div>
              <div className="s">{d.breaths} of {t.breaths} breaks · Equilibrium</div>
            </div>
            {done.breath && <Check className="check" aria-label="Target reached" />}
          </div>
          <div className="task-actions">
            <button className="btn primary" onClick={() => setBreathing(true)}>
              <Wind /> Start a 1-minute break
            </button>
            <button className="btn sm ghost" onClick={() => act({ type: 'breath', date: today, delta: 1 }, { pulse: 'vent', label: 'Breathing break' })} disabled={d.breaths >= 12}>
              Log one
            </button>
            <button className="btn sm icon ghost" onClick={() => act({ type: 'breath', date: today, delta: -1 })} disabled={d.breaths === 0} aria-label="Remove a breathing break">
              <Minus />
            </button>
          </div>
        </div>

        {/* Mood & stress */}
        <div className={`task wide${done.mood ? ' done' : ''}`}>
          <div className="task-top">
            <div className="ico"><Gauge /></div>
            <div>
              <div className="t">Record mood &amp; stress</div>
              <div className="s">
                {entry ? `Latest: ${MOOD_LABELS[entry.mood - 1]}, ${STRESS_LABELS[entry.stress - 1].toLowerCase()}` : 'No check-in yet today'} · Equilibrium
              </div>
            </div>
            {done.mood && <Check className="check" aria-label="Checked in" />}
            <NotTracked id="equilibrium" />
          </div>
          <ScalePicker kind="mood" value={mood} onChange={setMood} name="Mood" />
          <ScalePicker kind="stress" value={stress} onChange={setStress} name="Stress" />
          <div className="task-actions">
            <button className="btn" onClick={submitCheckin}>
              Record check-in
            </button>
            <a className="small muted" href="#/journal">Add a reflection →</a>
          </div>
          {checkErr && <div className="error" role="alert">{checkErr}</div>}
        </div>

        {/* Custom habits */}
        <div className="task custom">
          <div className="task-top">
            <div className="ico"><Wrench /></div>
            <div>
              <div className="t">Your own habits</div>
              <div className="s">Add the small routines that keep <em>your</em> engine running · +10 XP each</div>
            </div>
          </div>
          {state.customHabits.length > 0 ? (
            <div className="custom-list">
              {state.customHabits.map((h) => {
                const on = d.customDone.includes(h.id);
                return (
                  <div key={h.id} className={`custom-item${on ? ' done' : ''}`}>
                    <Toggle checked={on} label={`Mark “${h.label}” ${on ? 'not done' : 'done'}`} onChange={() => act({ type: 'toggleCustom', date: today, id: h.id }, { pulse: on ? undefined : 'custom', label: h.label })} />
                    <span className="lbl">{h.label}</span>
                    <button className="btn sm icon ghost" onClick={() => act({ type: 'removeHabit', id: h.id }, { silent: true })} aria-label={`Remove habit “${h.label}”`}>
                      <Trash2 />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hint">No custom habits yet. Try “Stretch after lectures” or “Step outside for daylight”.</div>
          )}
          <form className="inline-form" onSubmit={submitHabit} noValidate>
            <label className="sr-only" htmlFor="habit-in">New habit name</label>
            <input id="habit-in" className="input" style={{ flex: 1, minWidth: 180, width: 'auto' }} placeholder="Add your own habit…" maxLength={60} value={habitLabel} onChange={(e) => setHabitLabel(e.target.value)} aria-invalid={!!habitErr} aria-describedby={habitErr ? 'habit-err' : undefined} />
            <button className="btn" type="submit">
              <Plus /> Add habit
            </button>
          </form>
          {habitErr && <div className="error" id="habit-err" role="alert">{habitErr}</div>}
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
