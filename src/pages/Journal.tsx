import { useMemo, useState, type FormEvent } from 'react';
import { ScalePicker } from '../components/ui';
import { formatShort, formatTime, lastNDays, parseKey, weekdayLetter } from '../lib/date';
import { MOOD_LABELS, STRESS_LABELS } from '../lib/metrics';
import { useStore } from '../state/store';
import type { JournalEntry } from '../types';

const MAX = 1000;

export default function Journal() {
  const { state } = useStore();
  const groups = useMemo(() => {
    const byDate = new Map<string, JournalEntry[]>();
    [...state.journal].sort((a, b) => b.ts - a.ts).forEach((e) => byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]));
    return Array.from(byDate.entries());
  }, [state.journal]);

  return (
    <div className="pair">
      <div>
        <CheckinForm />
        <section className="block" aria-labelledby="hist-h">
          <div className="sec-head">
            <h2 id="hist-h">Earlier check-ins</h2>
            <span className="aside">
              {state.journal.length} {state.journal.length === 1 ? 'entry' : 'entries'}, newest first
            </span>
          </div>
          {groups.length === 0 ? (
            <div className="empty">
              <b>Nothing written yet</b>
              Your first check-in will be filed here. Choosing a mood and a stress level takes about ten seconds.
            </div>
          ) : (
            <div className="diary">
              {groups.map(([date, list]) => {
                const d = parseKey(date);
                return (
                  <div key={date} className="diary-day">
                    <div className="when">
                      {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      <small>{d.toLocaleDateString(undefined, { weekday: 'long' })}</small>
                    </div>
                    <div>
                      {list.map((e) => (
                        <EntryItem key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <div>
        <Trend />
        <p className="privacy block">
          Reflections stay in this browser’s local storage and are never sent anywhere. Mood and stress are your own readings. The engine shows them back to you; it doesn’t measure or diagnose anything.
        </p>
      </div>
    </div>
  );
}

function CheckinForm() {
  const { today, act } = useStore();
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<{ mood?: string; stress?: string; note?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errs = {};
    if (mood === null) next.mood = 'Choose how you’re feeling.';
    if (stress === null) next.stress = 'Choose a stress level.';
    if (note.length > MAX) next.note = `Keep it under ${MAX} characters.`;
    setErrs(next);
    if (Object.keys(next).length) return;
    act({ type: 'journal', date: today, mood: mood!, stress: stress!, note }, { pulse: 'equilibrium', label: note.trim().length >= 20 ? 'Check-in and reflection' : 'Check-in recorded' });
    setMood(null);
    setStress(null);
    setNote('');
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby="ci-h">
      <div className="sec-head">
        <h2 id="ci-h">How are you, today?</h2>
      </div>
      <div style={{ display: 'grid', gap: 18, maxWidth: 620 }}>
        <div className="field">
          <span className="label" id="mood-l">Mood</span>
          <ScalePicker kind="mood" value={mood} onChange={(v) => { setMood(v); setErrs((x) => ({ ...x, mood: undefined })); }} name="Mood" />
          {errs.mood && <span className="error" role="alert">{errs.mood}</span>}
        </div>
        <div className="field">
          <span className="label">Stress</span>
          <ScalePicker kind="stress" value={stress} onChange={(v) => { setStress(v); setErrs((x) => ({ ...x, stress: undefined })); }} name="Stress" />
          {errs.stress && <span className="error" role="alert">{errs.stress}</span>}
        </div>
        <div className="field">
          <label htmlFor="note">
            Reflection <span className="muted">(optional)</span>
          </label>
          <textarea id="note" className="textarea" placeholder="What’s been on your mind? What helped?" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!errs.note} aria-describedby="note-h" />
          <span id="note-h" className={errs.note || note.length > MAX ? 'error' : 'hint'}>
            {errs.note ?? <><span className="num">{note.length}</span> / {MAX}</>}
          </span>
        </div>
        <div className="inline" style={{ gap: 14 }}>
          <button className="btn primary" type="submit">
            Record check-in
          </button>
          <span className="hint">Your latest check-in today sets the pressure dial.</span>
        </div>
      </div>
    </form>
  );
}

function EntryItem({ e }: { e: JournalEntry }) {
  const { act } = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <article className="entry">
      <div className="entry-meta">
        <span className="t">{formatTime(e.ts)}</span>
        <span>
          {MOOD_LABELS[e.mood - 1]}, {STRESS_LABELS[e.stress - 1].toLowerCase()}
        </span>
        {e.demo && <span className="sample">sample</span>}
        <span className="grow" />
        {confirm ? (
          <span className="inline">
            <button className="btn sm danger" onClick={() => act({ type: 'deleteEntry', id: e.id }, { silent: true })}>
              Delete
            </button>
            <button className="btn sm quiet" onClick={() => setConfirm(false)} autoFocus>
              Keep
            </button>
          </span>
        ) : (
          <button className="btn sm quiet" onClick={() => setConfirm(true)} aria-label={`Delete the check-in from ${formatTime(e.ts)}`}>
            Delete
          </button>
        )}
      </div>
      {e.note && <p>{e.note}</p>}
    </article>
  );
}

function Trend() {
  const { state, today } = useStore();
  const days = lastNDays(7, today);
  const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
  const pts = days.map((d) => {
    const list = state.journal.filter((e) => e.date === d);
    return list.length ? { d, mood: avg(list.map((e) => e.mood)), stress: avg(list.map((e) => e.stress)) } : { d, mood: null as number | null, stress: null as number | null };
  });
  const W = 520, H = 230, L = 72, R = 16, T = 18, B = 36;
  const x = (i: number) => L + (i * (W - L - R)) / 6;
  const y = (v: number) => T + ((5 - v) * (H - T - B)) / 4;
  const path = (key: 'mood' | 'stress') => {
    let d = '';
    let pen = false;
    pts.forEach((p, i) => {
      const v = p[key];
      if (v === null) return void (pen = false);
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const any = pts.some((p) => p.mood !== null);
  return (
    <section className="trend" aria-labelledby="trend-h">
      <div className="sec-head">
        <h3 id="trend-h">Seven days of readings</h3>
      </div>
      {any ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily average mood and stress, last seven days. ${pts.map((p) => `${formatShort(p.d)}: ${p.mood === null ? 'no check-in' : `mood ${p.mood.toFixed(1)}, stress ${p.stress!.toFixed(1)}`}`).join('; ')}.`}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
              <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize={11.5} fill="var(--muted)" fontFamily="var(--mono)">
                {v}
              </text>
            </g>
          ))}
          {pts.map((p, i) => (
            <text key={p.d} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11.5} fill={p.d === today ? 'var(--parchment)' : 'var(--muted)'} fontFamily="var(--sans)">
              {weekdayLetter(p.d)} {p.d.slice(8)}
            </text>
          ))}
          <path d={path('stress')} fill="none" stroke="var(--copper)" strokeWidth={1.8} strokeDasharray="5 4" />
          <path d={path('mood')} fill="none" stroke="var(--parchment)" strokeWidth={2} />
          {pts.map((p, i) =>
            p.mood === null ? null : (
              <g key={p.d}>
                <rect x={x(i) - 4} y={y(p.stress!) - 4} width={8} height={8} fill="var(--iron)" stroke="var(--copper)" strokeWidth={1.6} />
                <circle cx={x(i)} cy={y(p.mood)} r={4.5} fill="var(--black)" stroke="var(--parchment)" strokeWidth={2} />
              </g>
            ),
          )}
        </svg>
      ) : (
        <div className="empty">
          <b>No readings this week</b>
          Record a check-in and the line starts here.
        </div>
      )}
      <div className="key">
        <span>
          <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--parchment)" strokeWidth="2" /><circle cx="11" cy="5" r="3.5" fill="var(--black)" stroke="var(--parchment)" strokeWidth="1.6" /></svg> mood, 1 heavy to 5 bright
        </span>
        <span>
          <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--copper)" strokeWidth="1.8" strokeDasharray="5 4" /><rect x="7.5" y="1.5" width="7" height="7" fill="var(--iron)" stroke="var(--copper)" strokeWidth="1.4" /></svg> stress, 1 calm to 5 overloaded
        </span>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>Daily averages of your own check-ins. Days without one are left blank.</p>
    </section>
  );
}
