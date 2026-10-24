import { useMemo, useState, type FormEvent } from 'react';
import { Feather, Lock, Trash2 } from 'lucide-react';
import { DialGlyph, ScalePicker } from '../components/ui';
import { formatShort, formatTime, lastNDays, weekdayLetter } from '../lib/date';
import { MOOD_LABELS, STRESS_LABELS } from '../lib/metrics';
import { useStore } from '../state/store';
import type { JournalEntry } from '../types';

const MAX = 1000;

export default function Journal() {
  const { state } = useStore();
  const groups = useMemo(() => {
    const byDate = new Map<string, JournalEntry[]>();
    [...state.journal].sort((a, b) => b.ts - a.ts).forEach((e) => {
      byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    });
    return Array.from(byDate.entries());
  }, [state.journal]);

  return (
    <div className="two-col">
      <div className="stack">
        <CheckinForm />
        <section className="plate rivets" aria-labelledby="hist-h">
          <div className="plate-head">
            <div>
              <div className="eyebrow">Logbook</div>
              <h3 id="hist-h">Previous check-ins</h3>
            </div>
            <span className="small muted">{state.journal.length} {state.journal.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          {groups.length === 0 ? (
            <div className="empty">
              <Feather aria-hidden="true" />
              <b>The logbook is blank</b>
              Your first check-in will appear here. A mood and stress reading takes about ten seconds.
            </div>
          ) : (
            <div>
              {groups.map(([date, list]) => (
                <div key={date} className="day-group">
                  <h4>{formatShort(date)}</h4>
                  <div className="entries">
                    {list.map((e) => (
                      <EntryCard key={e.id} e={e} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="stack">
        <Trend />
        <section className="plate rivets">
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <Lock size={18} color="var(--brass)" style={{ flex: 'none', marginTop: 3 }} aria-hidden="true" />
            <p className="small muted">
              Reflections are private. They live only in this browser’s local storage and are never sent to any server or service. Mood and stress are your own readings. The engine reflects them back to you; it doesn’t measure or diagnose anything.
            </p>
          </div>
        </section>
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
    if (note.length > MAX) next.note = `Keep reflections under ${MAX} characters.`;
    setErrs(next);
    if (Object.keys(next).length) return;
    act({ type: 'journal', date: today, mood: mood!, stress: stress!, note }, { pulse: 'equilibrium', label: note.trim().length >= 20 ? 'Check-in with reflection' : 'Check-in recorded' });
    setMood(null);
    setStress(null);
    setNote('');
  };

  return (
    <form className="plate rivets" onSubmit={submit} noValidate aria-labelledby="ci-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Pressure check</div>
          <h2 id="ci-h">How is the engineer today?</h2>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
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
          <textarea id="note" className="textarea" placeholder="What’s been on your mind? What helped today?" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!errs.note} aria-describedby="note-h" />
          <span id="note-h" className={errs.note || note.length > MAX ? 'error' : 'hint'}>
            {errs.note ?? `${note.length}/${MAX}${note.trim().length > 0 && note.trim().length < 20 ? ' · 20+ characters earns the reflection bonus' : ''}`}
          </span>
        </div>
        <div className="row">
          <button className="btn primary" type="submit">
            <Feather /> Record check-in
          </button>
          <span className="small muted">Today’s latest check-in sets the engine’s pressure dial.</span>
        </div>
      </div>
    </form>
  );
}

function EntryCard({ e }: { e: JournalEntry }) {
  const { act } = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <article className="entry">
      <div className="entry-top">
        <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 16, height: 16, display: 'inline-block' }}><DialGlyph frac={(e.mood - 1) / 4} color="#f0c46a" /></span>
          {MOOD_LABELS[e.mood - 1]}
        </span>
        <span className="pill">Stress: {STRESS_LABELS[e.stress - 1].toLowerCase()}</span>
        {e.demo && <span className="tag demo">Demo</span>}
        <span className="grow" />
        <span className="when">{formatTime(e.ts)}</span>
        {confirm ? (
          <>
            <button className="btn sm danger" onClick={() => act({ type: 'deleteEntry', id: e.id }, { silent: true })}>
              Delete
            </button>
            <button className="btn sm ghost" onClick={() => setConfirm(false)} autoFocus>
              Keep
            </button>
          </>
        ) : (
          <button className="btn sm icon ghost" onClick={() => setConfirm(true)} aria-label={`Delete check-in from ${formatTime(e.ts)}`}>
            <Trash2 />
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
  const pts = days.map((d) => {
    const list = state.journal.filter((e) => e.date === d);
    if (!list.length) return { d, mood: null as number | null, stress: null as number | null };
    return { d, mood: avg(list.map((e) => e.mood)), stress: avg(list.map((e) => e.stress)) };
  });
  const W = 520;
  const H = 210;
  const L = 74;
  const R = 14;
  const T = 14;
  const B = 34;
  const x = (i: number) => L + (i * (W - L - R)) / 6;
  const y = (v: number) => T + ((5 - v) * (H - T - B)) / 4;
  const path = (key: 'mood' | 'stress') => {
    let d = '';
    let pen = false;
    pts.forEach((p, i) => {
      const v = p[key];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const any = pts.some((p) => p.mood !== null);
  return (
    <section className="plate rivets trend" aria-labelledby="trend-h">
      <div className="plate-head">
        <div>
          <div className="eyebrow">Seven-day trend</div>
          <h3 id="trend-h">Mood &amp; stress</h3>
        </div>
        <div className="legend">
          <span><i style={{ background: '#f0c46a' }} />Mood</span>
          <span><i style={{ background: '#d0664a' }} />Stress</span>
        </div>
      </div>
      {any ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily average mood and stress over the last seven days. ${pts.map((p) => `${formatShort(p.d)}: ${p.mood === null ? 'no check-in' : `mood ${p.mood.toFixed(1)}, stress ${p.stress!.toFixed(1)}`}`).join('; ')}.`}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(201,154,75,0.13)" strokeDasharray={v === 3 ? '0' : '3 5'} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#a3937a" fontFamily="IBM Plex Sans, sans-serif">
                {v === 5 ? 'high' : v === 1 ? 'low' : v === 3 ? 'mid' : ''}
              </text>
            </g>
          ))}
          {pts.map((p, i) => (
            <text key={p.d} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill={p.d === today ? '#ecc777' : '#a3937a'} fontFamily="IBM Plex Sans, sans-serif">
              {weekdayLetter(p.d)} {p.d.slice(8)}
            </text>
          ))}
          <path d={path('stress')} fill="none" stroke="#d0664a" strokeWidth={2.2} strokeLinejoin="round" />
          <path d={path('mood')} fill="none" stroke="#f0c46a" strokeWidth={2.6} strokeLinejoin="round" />
          {pts.map((p, i) =>
            p.mood === null ? (
              <circle key={p.d} cx={x(i)} cy={y(3)} r={2.5} fill="none" stroke="rgba(163,147,122,0.5)" />
            ) : (
              <g key={p.d}>
                <circle cx={x(i)} cy={y(p.stress!)} r={4} fill="#1b1511" stroke="#d0664a" strokeWidth={2} />
                <circle cx={x(i)} cy={y(p.mood)} r={4.5} fill="#1b1511" stroke="#f0c46a" strokeWidth={2.2} />
              </g>
            ),
          )}
        </svg>
      ) : (
        <div className="empty">
          <b>No readings this week</b>
          Record a check-in and your trend line will start here.
        </div>
      )}
      <p className="small muted" style={{ marginTop: 6 }}>Daily averages of your own check-ins. Hollow dots are days without one.</p>
    </section>
  );
}

const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
