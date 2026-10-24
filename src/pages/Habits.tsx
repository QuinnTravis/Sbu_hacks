import { useMemo, useState, type FormEvent } from 'react';
import { Check, Database, RotateCcw, Trash2 } from 'lucide-react';
import { Bar, INDICATOR_ICONS, Switch } from '../components/ui';
import { DEFAULT_TARGETS, INDICATORS, TARGET_LIMITS } from '../data/catalog';
import { hasDemo } from '../data/demo';
import { formatShort, lastNDays, weekdayLetter } from '../lib/date';
import { entriesFor, readings } from '../lib/metrics';
import { XP_RULES } from '../lib/progression';
import { useStore } from '../state/store';
import type { IndicatorId, MotionPref, Targets } from '../types';

const TARGET_FOR: Record<keyof Targets, IndicatorId> = {
  sleepHours: 'rest',
  waterGlasses: 'cooling',
  moveMinutes: 'motion',
  meals: 'fuel',
  breaths: 'equilibrium',
};

export default function Habits() {
  const { state, today } = useStore();
  const rs = readings(state, today);
  return (
    <div className="stack">
      <div className="two-col">
        <div className="stack">
          <section className="plate rivets" aria-labelledby="today-h">
            <div className="plate-head">
              <div>
                <div className="eyebrow">Today</div>
                <h2 id="today-h">Today’s habits</h2>
              </div>
              <a className="small muted" href="#/engine">Log entries in the Engine Room →</a>
            </div>
            <div className="indicators">
              {rs.map((r) => {
                const I = INDICATOR_ICONS[r.id];
                const done = (r.value ?? 0) >= 0.999;
                return (
                  <div key={r.id} className={`ind${r.ignored ? ' ignored' : ''}`} style={{ cursor: 'default' }}>
                    <span className="ico"><I aria-hidden="true" /></span>
                    <span>
                      <span className="name">
                        {INDICATORS[r.id].habit} <span className="sub">{r.label}</span>
                      </span>
                      <Bar value={r.value ?? 0} ind={r.id} label={`${r.label} progress`} />
                    </span>
                    <span className="val">
                      {r.ignored ? 'Not tracked' : r.current}
                      <br />
                      <small>{r.ignored ? '' : done ? 'complete' : r.value === null ? 'awaiting entry' : 'in progress'}</small>
                    </span>
                  </div>
                );
              })}
              {state.customHabits.map((h) => {
                const on = state.days[today]?.customDone.includes(h.id) ?? false;
                return (
                  <div key={h.id} className="ind" style={{ cursor: 'default' }}>
                    <span className="ico">{on ? <Check aria-hidden="true" /> : <span aria-hidden="true">·</span>}</span>
                    <span className="name">{h.label} <span className="sub">your habit</span></span>
                    <span className="val">{on ? 'done' : 'not yet'}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <Ledger />
          <Rules />
        </div>

        <div className="stack">
          <TargetsForm key={JSON.stringify(state.settings.targets)} />
          <Preferences />
          <DataControls />
        </div>
      </div>
    </div>
  );
}

function Ledger() {
  const { state, today } = useStore();
  const days = lastNDays(7, today);
  const t = state.settings.targets;
  const rows: { label: string; cell: (d: string) => number | null }[] = [
    { label: 'Sleep', cell: (k) => (state.days[k]?.sleepHours != null ? Math.min(1, (state.days[k]!.sleepHours ?? 0) / t.sleepHours) : null) },
    { label: 'Water', cell: (k) => frac(state.days[k]?.water, t.waterGlasses) },
    { label: 'Movement', cell: (k) => frac(state.days[k]?.moveMinutes, t.moveMinutes) },
    { label: 'Meals', cell: (k) => frac(state.days[k]?.meals, t.meals) },
    { label: 'Breathing', cell: (k) => frac(state.days[k]?.breaths, t.breaths) },
    { label: 'Check-in', cell: (k) => (entriesFor(state.journal, k).length ? 1 : null) },
    ...state.customHabits.map((h) => ({ label: h.label, cell: (k: string) => (state.days[k]?.customDone.includes(h.id) ? 1 : null) })),
  ];
  return (
    <section className="plate rivets" aria-labelledby="ledger-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Recent progress</div>
          <h3 id="ledger-h">Maintenance log, last 7 days</h3>
        </div>
        <span className="small muted">Gaps are just quiet days.</span>
      </div>
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Habit</th>
              {days.map((d) => (
                <th key={d} scope="col" className={d === today ? 'today' : ''} title={formatShort(d)}>
                  {weekdayLetter(d)}
                  <br />
                  <span className="mono" style={{ fontSize: 10 }}>{d.slice(8)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {days.map((d) => {
                  const v = r.cell(d);
                  const demo = state.days[d]?.demo || entriesFor(state.journal, d).some((e) => e.demo);
                  const cls = v === null || v === 0 ? '' : v >= 0.999 ? 'full' : 'part';
                  return (
                    <td key={d}>
                      <span className={`cell ${cls}${demo && v ? ' demo' : ''}`} title={`${r.label}, ${formatShort(d)}: ${v === null || v === 0 ? 'nothing logged' : v >= 0.999 ? 'target met' : 'partly'}${demo ? ' (sample data)' : ''}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><span className="ledger"><span className="cell full" style={{ width: 12, height: 12, verticalAlign: -1 }} /></span>&nbsp; target met</span>
        <span><span className="ledger"><span className="cell part" style={{ width: 12, height: 12, verticalAlign: -1 }} /></span>&nbsp; partly</span>
        <span><span className="ledger"><span className="cell demo" style={{ width: 12, height: 12, verticalAlign: -1 }} /></span>&nbsp; sample data</span>
      </div>
    </section>
  );
}

const frac = (v: number | undefined, t: number) => (v ? Math.min(1, v / t) : null);

function TargetsForm() {
  const { state, act, notify } = useStore();
  const keys = Object.keys(TARGET_LIMITS) as (keyof Targets)[];
  const [vals, setVals] = useState<Record<keyof Targets, string>>(() => Object.fromEntries(keys.map((k) => [k, String(state.settings.targets[k])])) as Record<keyof Targets, string>);
  const [errs, setErrs] = useState<Partial<Record<keyof Targets, string>>>({});
  const dirty = keys.some((k) => Number(vals[k]) !== state.settings.targets[k]);

  const validate = (k: keyof Targets, raw: string): string | null => {
    const lim = TARGET_LIMITS[k];
    if (raw.trim() === '') return 'Required';
    const n = Number(raw);
    if (!Number.isFinite(n)) return 'Enter a number';
    if (n < lim.min || n > lim.max) return `Between ${lim.min} and ${lim.max}`;
    if (Math.abs(n / lim.step - Math.round(n / lim.step)) > 1e-9) return lim.step === 1 ? 'Whole numbers only' : `Steps of ${lim.step}`;
    return null;
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof Targets, string>> = {};
    for (const k of keys) {
      const err = validate(k, vals[k]);
      if (err) next[k] = err;
    }
    setErrs(next);
    if (Object.keys(next).length) return;
    act({ type: 'targets', targets: Object.fromEntries(keys.map((k) => [k, Number(vals[k])])) as unknown as Targets }, { silent: true });
    notify({ kind: 'info', title: 'Targets saved', body: 'The engine has been recalibrated to your new targets.' });
  };

  return (
    <form className="plate rivets" onSubmit={save} noValidate aria-labelledby="targets-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Calibration</div>
          <h3 id="targets-h">Daily targets</h3>
        </div>
      </div>
      <p className="small muted" style={{ marginBottom: 14 }}>
        These defaults are general starting points, not recommendations for you specifically. Set what suits your body, schedule and advice from your own clinician, or switch an indicator off entirely.
      </p>
      <div className="targets-grid">
        {keys.map((k) => {
          const lim = TARGET_LIMITS[k];
          const ind = TARGET_FOR[k];
          const off = state.settings.ignored.includes(ind);
          return (
            <div key={k} className={`target-card${off ? ' off' : ''}`}>
              <div className="field">
                <label htmlFor={`t-${k}`}>
                  {lim.label} <span className="muted">({lim.unit})</span>
                </label>
                <input
                  id={`t-${k}`}
                  className="input"
                  inputMode="decimal"
                  value={vals[k]}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  onBlur={(e) => setErrs((x) => ({ ...x, [k]: validate(k, e.target.value) ?? undefined }))}
                  aria-invalid={!!errs[k]}
                  aria-describedby={`t-${k}-h`}
                />
                <span id={`t-${k}-h`} className={errs[k] ? 'error' : 'hint'}>
                  {errs[k] ?? `${lim.min}–${lim.max} · default ${DEFAULT_TARGETS[k]}`}
                </span>
              </div>
              {k !== 'breaths' && <Switch checked={!off} onChange={() => act({ type: 'toggleIgnore', id: ind }, { silent: true })} label={off ? `${INDICATORS[ind].name} not tracked` : `Track ${INDICATORS[ind].name}`} />}
            </div>
          );
        })}
        <div className="target-card">
          <div className="field">
            <span className="label">Mood &amp; stress</span>
            <span className="hint">Self-reported check-ins. No target, just a reading.</span>
          </div>
          <Switch
            checked={!state.settings.ignored.includes('equilibrium')}
            onChange={() => act({ type: 'toggleIgnore', id: 'equilibrium' }, { silent: true })}
            label={state.settings.ignored.includes('equilibrium') ? 'Equilibrium not tracked' : 'Track Equilibrium'}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" type="submit" disabled={!dirty}>
          Save targets
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            setVals(Object.fromEntries(keys.map((k) => [k, String(DEFAULT_TARGETS[k])])) as Record<keyof Targets, string>);
            setErrs({});
          }}
        >
          <RotateCcw /> Defaults
        </button>
      </div>
    </form>
  );
}

function Preferences() {
  const { state, act } = useStore();
  const opts: { v: MotionPref; l: string }[] = [
    { v: 'system', l: 'Match system' },
    { v: 'reduced', l: 'Reduced' },
    { v: 'full', l: 'Full' },
  ];
  return (
    <section className="plate rivets" aria-labelledby="pref-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Preferences</div>
          <h3 id="pref-h">Animation</h3>
        </div>
      </div>
      <div className="chip-row" role="radiogroup" aria-label="Animation level">
        {opts.map((o) => (
          <button key={o.v} className="chip" role="radio" aria-checked={state.settings.motion === o.v} aria-pressed={state.settings.motion === o.v} onClick={() => act({ type: 'motion', pref: o.v }, { silent: true })}>
            {o.l}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Reduced stills the pistons, steam and gauges, and shows the engine as a technical drawing at rest.
      </p>
    </section>
  );
}

function Rules() {
  return (
    <section className="plate rivets" aria-labelledby="rules-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Transparent rules</div>
          <h3 id="rules-h">How experience is earned</h3>
        </div>
      </div>
      <div className="rules">
        {XP_RULES.map((r) => (
          <div key={r.key}>
            <b>{r.label}</b>
            <span>{r.note}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        XP is worked out from what is logged, with daily caps, so repeated clicking can’t inflate it. Undoing an entry removes its XP. Missed days never cost you anything.
      </p>
    </section>
  );
}

function DataControls() {
  const { state, today, act, notify } = useStore();
  const [confirm, setConfirm] = useState(false);
  const demo = hasDemo(state);
  const counts = useMemo(
    () => ({
      days: Object.values(state.days).filter((d) => !d.demo).length,
      entries: state.journal.filter((e) => !e.demo).length,
    }),
    [state],
  );
  return (
    <section className="plate rivets" aria-labelledby="data-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Data &amp; demo</div>
          <h3 id="data-h">Your data stays in this browser</h3>
        </div>
      </div>
      <p className="small muted">
        Everything, journal reflections included, is stored only in this browser’s local storage. Nothing is sent anywhere. You have {counts.days} {counts.days === 1 ? 'day' : 'days'} of your own entries and {counts.entries} journal{' '}
        {counts.entries === 1 ? 'entry' : 'entries'}.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        {demo ? (
          <button className="btn" onClick={() => { act({ type: 'clearDemo' }); notify({ kind: 'info', title: 'Sample data cleared', body: 'Only your own entries remain.' }); }}>
            <Database /> Clear sample data
          </button>
        ) : (
          <button className="btn" onClick={() => { act({ type: 'loadDemo', today }); notify({ kind: 'info', title: 'Sample data loaded', body: 'Sample days are marked DEMO and never overwrite your own entries.' }); }}>
            <Database /> Load sample data
          </button>
        )}
        <button className="btn danger" onClick={() => setConfirm(true)}>
          <Trash2 /> Reset everything
        </button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog" aria-labelledby="reset-q" style={{ marginTop: 12 }}>
          <b id="reset-q">Erase all entries, journal reflections, targets and workshop choices?</b>
          <span className="small muted">This can’t be undone.</span>
          <div className="row">
            <button
              className="btn danger"
              autoFocus
              onClick={() => {
                act({ type: 'reset' });
                setConfirm(false);
                notify({ kind: 'info', title: 'Engine reset', body: 'A clean, cold engine. Light it whenever you’re ready.' });
              }}
            >
              Yes, reset
            </button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Keep my data
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

