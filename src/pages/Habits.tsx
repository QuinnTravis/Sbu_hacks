import { useMemo, useState, type FormEvent } from 'react';
import { Switch } from '../components/ui';
import { REFS } from '../components/engine/Engine';
import { DEFAULT_TARGETS, INDICATORS, TARGET_LIMITS } from '../data/catalog';
import { hasDemo } from '../data/demo';
import { formatShort, lastNDays, weekdayLetter } from '../lib/date';
import { entriesFor, latestEntry, readings } from '../lib/metrics';
import { XP_RULES } from '../lib/progression';
import { useStore } from '../state/store';
import type { IndicatorId, MotionPref, Targets } from '../types';

const TARGET_FOR: Record<keyof Targets, IndicatorId> = {
  sleepHours: 'rest',
  waterGlasses: 'cooling',
  moveMinutes: 'motion',
  steps: 'motion',
  meals: 'fuel',
  breaths: 'equilibrium',
};

export default function Habits() {
  const { state } = useStore();
  return (
    <div className="pair">
      <div>
        <Today />
        <div className="block">
          <Ledger />
        </div>
        <div className="block">
          <Rules />
        </div>
      </div>
      <div>
        <TargetsForm key={JSON.stringify(state.settings.targets)} />
        <div className="block">
          <Preferences />
        </div>
        <div className="block">
          <DataControls />
        </div>
      </div>
    </div>
  );
}

function Today() {
  const { state, today } = useStore();
  const rs = readings(state, today);
  const day = state.days[today];
  return (
    <section aria-labelledby="today-h">
      <div className="sec-head">
        <h2 id="today-h">Today</h2>
        <a className="aside push" href="#/engine">
          Record entries in the Engine Room
        </a>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Habit</th>
              <th scope="col">Recorded</th>
              <th scope="col" className="r">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rs.map((r) => {
              const done = r.id === 'equilibrium' ? !!latestEntry(state.journal, today) && (day?.breaths ?? 0) >= state.settings.targets.breaths : (r.value ?? 0) >= 0.999;
              return (
                <tr key={r.id} className={r.ignored ? 'off' : ''}>
                  <td className="num muted">{REFS[r.id]}</td>
                  <td>{INDICATORS[r.id].habit}</td>
                  <td className="num">{r.ignored ? '—' : r.current}</td>
                  <td className="r muted">{r.ignored ? 'not tracked' : done ? 'complete' : r.value === null || r.value === 0 ? 'not yet' : 'under way'}</td>
                </tr>
              );
            })}
            {state.customHabits.map((h) => (
              <tr key={h.id}>
                <td className="num muted">·</td>
                <td>{h.label}</td>
                <td className="num">{day?.customDone.includes(h.id) ? 'done' : '—'}</td>
                <td className="r muted">{day?.customDone.includes(h.id) ? 'complete' : 'not yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Ledger() {
  const { state, today } = useStore();
  const days = lastNDays(7, today);
  const t = state.settings.targets;
  const f = (v: number | undefined, tg: number) => (v ? Math.min(1, v / tg) : null);
  const rows: { label: string; cell: (k: string) => number | null }[] = [
    { label: 'Sleep', cell: (k) => (state.days[k]?.sleepHours != null ? Math.min(1, (state.days[k]!.sleepHours ?? 0) / t.sleepHours) : null) },
    { label: 'Water', cell: (k) => f(state.days[k]?.water, t.waterGlasses) },
    { label: 'Exercise or steps', cell: (k) => { const d = state.days[k]; return d && (d.moveMinutes || d.steps) ? Math.min(1, Math.max(d.moveMinutes / t.moveMinutes, d.steps / t.steps)) : null; } },
    { label: 'Meals', cell: (k) => f(state.days[k]?.meals, t.meals) },
    { label: 'Breathing', cell: (k) => f(state.days[k]?.breaths, t.breaths) },
    { label: 'Check-in', cell: (k) => (entriesFor(state.journal, k).length ? 1 : null) },
    ...state.customHabits.map((h) => ({ label: h.label, cell: (k: string) => (state.days[k]?.customDone.includes(h.id) ? 1 : null) })),
  ];
  return (
    <section aria-labelledby="ledger-h">
      <div className="sec-head">
        <h3 id="ledger-h">The last seven days</h3>
        <span className="aside">Blank days are just quiet days.</span>
      </div>
      <div className="table-wrap">
        <table className="tbl ledger">
          <thead>
            <tr>
              <th scope="col">Habit</th>
              {days.map((d) => (
                <th key={d} scope="col" className={`d${d === today ? ' today' : ''}`} title={formatShort(d)}>
                  {weekdayLetter(d)} <span className="num">{d.slice(8)}</span>
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
                  const sample = state.days[d]?.demo || entriesFor(state.journal, d).some((e) => e.demo);
                  const cls = v === null || v === 0 ? '' : v >= 0.999 ? 'full' : 'half';
                  const what = v === null || v === 0 ? 'nothing recorded' : v >= 0.999 ? 'target met' : 'part way';
                  return (
                    <td key={d} className="c">
                      <span className={`mark ${cls}${sample && v ? ' smp' : ''}`} role="img" aria-label={`${r.label}, ${formatShort(d)}: ${what}${sample && v ? ', sample entry' : ''}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="key">
        <span><span className="mark full" /> target met</span>
        <span><span className="mark half" /> part way</span>
        <span><span className="mark full smp" /> sample entry</span>
      </div>
    </section>
  );
}

function TargetsForm() {
  const { state, act, notify } = useStore();
  const keys = Object.keys(TARGET_LIMITS) as (keyof Targets)[];
  const [vals, setVals] = useState<Record<keyof Targets, string>>(() => Object.fromEntries(keys.map((k) => [k, String(state.settings.targets[k])])) as Record<keyof Targets, string>);
  const [errs, setErrs] = useState<Partial<Record<keyof Targets, string>>>({});
  const dirty = keys.some((k) => Number(vals[k]) !== state.settings.targets[k]);

  const validate = (k: keyof Targets, raw: string): string | undefined => {
    const lim = TARGET_LIMITS[k];
    const clean = raw.replace(/,/g, '').trim();
    if (clean === '') return 'Required';
    const n = Number(clean);
    if (!Number.isFinite(n)) return 'Enter a number';
    if (n < lim.min || n > lim.max) return `Between ${lim.min.toLocaleString()} and ${lim.max.toLocaleString()}`;
    if (Math.abs(n / lim.step - Math.round(n / lim.step)) > 1e-9) return lim.step === 1 ? 'Whole numbers only' : `In steps of ${lim.step}`;
    return undefined;
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof Targets, string>> = {};
    keys.forEach((k) => {
      const m = validate(k, vals[k]);
      if (m) next[k] = m;
    });
    setErrs(next);
    if (Object.keys(next).length) return;
    act({ type: 'targets', targets: Object.fromEntries(keys.map((k) => [k, Number(vals[k].replace(/,/g, ''))])) as unknown as Targets }, { silent: true });
    notify({ kind: 'info', title: 'Targets saved', body: 'The engine is recalibrated.' });
  };

  const tracked = (id: IndicatorId) => !state.settings.ignored.includes(id);
  const toggle = (id: IndicatorId) => act({ type: 'toggleIgnore', id }, { silent: true });

  return (
    <form onSubmit={save} noValidate aria-labelledby="targets-h">
      <div className="sec-head">
        <h2 id="targets-h">Calibration</h2>
      </div>
      <p className="lede">
        The defaults are general starting points, not advice for you in particular. Set what suits your body and schedule, and any guidance you’ve had from your own clinician. You can also switch an instrument off. An instrument that’s off idles
        neutrally and never counts against the engine.
      </p>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Habit</th>
              <th scope="col">Daily target</th>
              <th scope="col">Default</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const lim = TARGET_LIMITS[k];
              const ind = TARGET_FOR[k];
              return (
                <tr key={k} className={tracked(ind) ? '' : 'off'}>
                  <td>
                    <label htmlFor={`t-${k}`}>{lim.label}</label>
                    {k === 'steps' && <div className="hint">either one fills Motion</div>}
                  </td>
                  <td>
                    <span className="inline" style={{ flexWrap: 'nowrap' }}>
                      <input
                        id={`t-${k}`}
                        className="input num"
                        inputMode="decimal"
                        value={vals[k]}
                        onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                        onBlur={(e) => setErrs((x) => ({ ...x, [k]: validate(k, e.target.value) }))}
                        aria-invalid={!!errs[k]}
                        aria-describedby={errs[k] ? `t-${k}-e` : undefined}
                      />
                      <span className="muted small">{lim.unit}</span>
                    </span>
                    {errs[k] && (
                      <div className="error" id={`t-${k}-e`}>
                        {errs[k]}
                      </div>
                    )}
                  </td>
                  <td className="num muted">{DEFAULT_TARGETS[k].toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="inline" style={{ marginTop: 14, gap: 10 }}>
        <button className="btn primary" type="submit" disabled={!dirty}>
          Save targets
        </button>
        <button
          className="btn quiet"
          type="button"
          onClick={() => {
            setVals(Object.fromEntries(keys.map((k) => [k, String(DEFAULT_TARGETS[k])])) as Record<keyof Targets, string>);
            setErrs({});
          }}
        >
          Restore defaults
        </button>
      </div>

      <h3 style={{ fontSize: 18, margin: '28px 0 10px' }}>Instruments in use</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {(['rest', 'cooling', 'motion', 'fuel', 'equilibrium'] as IndicatorId[]).map((id) => (
          <Switch key={id} checked={tracked(id)} onChange={() => toggle(id)} label={`${REFS[id]} · ${INDICATORS[id].name}, ${INDICATORS[id].habit.toLowerCase()}`} />
        ))}
      </div>
    </form>
  );
}

function Preferences() {
  const { state, act } = useStore();
  const opts: { v: MotionPref; l: string }[] = [
    { v: 'system', l: 'Match system' },
    { v: 'reduced', l: 'Still' },
    { v: 'full', l: 'Running' },
  ];
  return (
    <section aria-labelledby="pref-h">
      <div className="sec-head">
        <h3 id="pref-h">Animation</h3>
      </div>
      <div className="seg three" role="radiogroup" aria-label="Animation">
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={state.settings.motion === o.v} onClick={() => act({ type: 'motion', pref: o.v }, { silent: true })} style={{ padding: '8px 4px' }}>
            {o.l}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Still shows the engine as a drawing at rest: no moving parts, steam or needle tremor.
      </p>
    </section>
  );
}

function Rules() {
  return (
    <section aria-labelledby="rules-h">
      <div className="sec-head">
        <h3 id="rules-h">How experience is earned</h3>
      </div>
      <table className="rules">
        <tbody>
          {XP_RULES.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 10, maxWidth: '64ch' }}>
        Experience is worked out from what is recorded, with daily caps, so repeated clicking can’t inflate it. Undoing an entry takes its experience back. Missed days never cost anything.
      </p>
    </section>
  );
}

function DataControls() {
  const { state, today, act, notify } = useStore();
  const [confirm, setConfirm] = useState(false);
  const demo = hasDemo(state);
  const counts = useMemo(
    () => ({ days: Object.values(state.days).filter((d) => !d.demo).length, entries: state.journal.filter((e) => !e.demo).length }),
    [state],
  );
  return (
    <section aria-labelledby="data-h">
      <div className="sec-head">
        <h3 id="data-h">Your records</h3>
      </div>
      <p className="lede" style={{ marginBottom: 12 }}>
        Everything, reflections included, is kept in this browser’s local storage and nowhere else. You have <span className="num">{counts.days}</span> {counts.days === 1 ? 'day' : 'days'} of your own entries and{' '}
        <span className="num">{counts.entries}</span> journal {counts.entries === 1 ? 'entry' : 'entries'}.
      </p>
      <div className="inline" style={{ gap: 10 }}>
        {demo ? (
          <button className="btn" onClick={() => { act({ type: 'clearDemo' }); notify({ kind: 'info', title: 'Sample entries removed' }); }}>
            Remove sample entries
          </button>
        ) : (
          <button className="btn" onClick={() => { act({ type: 'loadDemo', today }); notify({ kind: 'info', title: 'Sample entries added', body: 'They never overwrite your own.' }); }}>
            Add sample entries
          </button>
        )}
        <button className="btn danger" onClick={() => setConfirm(true)}>
          Erase everything
        </button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog" aria-labelledby="reset-q">
          <span id="reset-q">Erase every entry, reflection, target and workshop choice? This can’t be undone.</span>
          <div className="inline" style={{ gap: 10 }}>
            <button
              className="btn danger"
              autoFocus
              onClick={() => {
                act({ type: 'reset' });
                setConfirm(false);
                notify({ kind: 'info', title: 'Records erased', body: 'A clean, cold engine.' });
              }}
            >
              Erase
            </button>
            <button className="btn quiet" onClick={() => setConfirm(false)}>
              Keep my records
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
