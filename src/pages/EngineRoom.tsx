import { useMemo, useState } from 'react';
import Engine, { REFS } from '../components/engine/Engine';
import Logbook from '../components/Checklist';
import { Scale } from '../components/ui';
import { COSMETICS, INDICATORS } from '../data/catalog';
import { formatTime } from '../lib/date';
import { fmtNum, getDay, latestEntry, readings, MOOD_LABELS, STRESS_LABELS } from '../lib/metrics';
import { activeDates } from '../lib/progression';
import { buildReport } from '../lib/report';
import { useStore } from '../state/store';
import type { AppState, IndicatorId } from '../types';

/** The short reading printed beside each part on the drawing. */
function callouts(state: AppState, today: string): Record<IndicatorId, string> {
  const d = getDay(state, today);
  const t = state.settings.targets;
  const ign = new Set(state.settings.ignored);
  const e = latestEntry(state.journal, today);
  const motion =
    d.steps === 0 && d.moveMinutes === 0
      ? 'no movement yet'
      : d.steps / t.steps >= d.moveMinutes / t.moveMinutes
        ? `${d.steps.toLocaleString()} of ${t.steps.toLocaleString()} steps`
        : `${d.moveMinutes} of ${t.moveMinutes} min`;
  const out: Record<IndicatorId, string> = {
    rest: d.sleepHours === null ? 'sleep not recorded' : `${fmtNum(d.sleepHours)} of ${fmtNum(t.sleepHours)} h`,
    cooling: `${d.water} of ${t.waterGlasses} glasses`,
    motion,
    fuel: `${d.meals} of ${t.meals} meals`,
    equilibrium: e ? `${MOOD_LABELS[e.mood - 1]}, ${STRESS_LABELS[e.stress - 1].toLowerCase()}` : 'no check-in',
  };
  (Object.keys(out) as IndicatorId[]).forEach((k) => ign.has(k) && (out[k] = 'not tracked'));
  return out;
}

export default function EngineRoom() {
  const { state, today, condition, progress, reducedMotion, pulse, act } = useStore();
  const rs = useMemo(() => readings(state, today), [state, today]);
  const report = useMemo(() => buildReport(state, today), [state, today]);
  const labels = useMemo(() => callouts(state, today), [state, today]);
  const [picked, setPicked] = useState<IndicatorId | null>(null);
  const selected = picked ?? report.focus ?? 'cooling';

  const day = state.days[today];
  const stamps = day && !day.demo ? Object.values(day.stamps ?? {}) : [];
  const lastStamp = stamps.length ? Math.max(...stamps) : null;
  const daysOnRecord = activeDates(state).filter((k) => !state.days[k]?.demo || state.journal.some((j) => j.date === k && !j.demo)).length;
  const finish = COSMETICS.find((c) => c.id === state.equipped.finish)?.name ?? '';

  const quick: Partial<Record<IndicatorId, { label: string; run: () => void }>> = {
    cooling: { label: 'Add a glass', run: () => act({ type: 'water', date: today, delta: 1 }, { pulse: 'cooling', label: 'Glass of water' }) },
    fuel: { label: 'Mark a meal', run: () => act({ type: 'meal', date: today, delta: 1 }, { pulse: 'fuel', label: 'Nourishing meal' }) },
    motion: { label: 'Add 10 min exercise', run: () => act({ type: 'move', date: today, delta: 10 }, { pulse: 'motion', label: '10 minutes of exercise' }) },
    equilibrium: { label: 'Log a breathing break', run: () => act({ type: 'breath', date: today, delta: 1 }, { pulse: 'vent', label: 'Breathing break' }) },
  };
  const jump = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className="room">
        <section aria-labelledby="sheet-title">
          <h1 id="sheet-title" className="sr-only">
            Engine Room
          </h1>
          <div className="sheet">
            <Engine condition={condition} equipped={state.equipped} reducedMotion={reducedMotion} pulse={pulse} selected={selected} onSelect={setPicked} labels={labels} />
            <div className="sheet-foot">
              <div className="notes" aria-live="polite">
                <h3>Notes</h3>
                <ol>
                  <li>{report.headline}</li>
                  {report.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ol>
                {report.suggestion && report.focus && (
                  <p className="next-up">
                    <span className="k">
                      Next maintenance · {REFS[report.focus]} {INDICATORS[report.focus].name.toLowerCase()}
                    </span>
                    <span>{report.suggestion}</span>
                  </p>
                )}
              </div>
              <div className="title-block" aria-label="Drawing details">
                <div className="name">Human Engine, Mk I</div>
                <div>Finish</div>
                <div className="val">{finish}</div>
                <div>Last entry</div>
                <div className="val">{lastStamp ? formatTime(lastStamp) : 'none today'}</div>
                <div>Days on record</div>
                <div className="val">{daysOnRecord || 'none yet'}</div>
                <div>Scale</div>
                <div className="val">1 : 1 person</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="instruments" aria-labelledby="inst-title">
          <div className="sec-head">
            <h2 id="inst-title">Instruments</h2>
            <a className="aside push" href="#/habits">
              Adjust targets
            </a>
          </div>
          {rs.map((r) => {
            const on = selected === r.id;
            const q = quick[r.id];
            return (
              <div key={r.id}>
                <button className={`inst${r.ignored ? ' off' : ''}`} aria-pressed={on} aria-expanded={on} onClick={() => setPicked(r.id)}>
                  <span className="ref">{REFS[r.id]}</span>
                  <span className="inst-name">{r.label}</span>
                  <span className="inst-val">
                    {r.ignored ? 'off' : r.value === null ? '—' : `${Math.round(r.value * 100)}%`}
                  </span>
                  {!r.ignored && <Scale value={r.value ?? 0} active={on} label={`${r.label}, ${r.value === null ? 'not logged' : `${Math.round((r.value ?? 0) * 100)} percent of target`}`} />}
                  {on && (
                    <span className="inst-detail">
                      <span>{INDICATORS[r.id].blurb}</span>
                      <span className="num" style={{ color: 'var(--parchment)' }}>
                        {r.ignored ? 'Not tracked' : r.current}
                        {r.target && !r.ignored ? ` · target ${r.target}` : ''}
                      </span>
                    </span>
                  )}
                </button>
                {on && !r.ignored && (
                  <div style={{ padding: '0 0 14px 34px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {q ? (
                      <button className="btn sm" onClick={q.run}>
                        {q.label}
                      </button>
                    ) : null}
                    <button className="btn sm quiet" onClick={() => jump(r.id === 'rest' ? 'sleep-in' : r.id === 'motion' ? 'steps-in' : `row-${r.id}`)}>
                      {r.id === 'rest' ? 'Record sleep' : r.id === 'motion' ? 'Enter steps' : 'Open in logbook'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="progress-note">
            <div className="lv">
              Level {progress.level} <span>· {progress.title}</span>
            </div>
            <Scale value={progress.into / progress.span} label="Experience toward the next level" />
            <span>
              <span className="num">{progress.into}</span> of <span className="num">{progress.span}</span> XP toward level {progress.level + 1}
              {progress.todayTotal > 0 ? `, ${progress.todayTotal} earned today` : ''}.
            </span>
            <span>
              {progress.streak.current === 0
                ? 'A cold engine starts with any single entry.'
                : `Tended ${progress.streak.last7} of the last 7 days. Current run: ${progress.streak.current} ${progress.streak.current === 1 ? 'day' : 'days'}.`}
            </span>
            <a href="#/workshop" className="small">
              Workshop and commendations
            </a>
          </div>
        </aside>
      </div>

      <Logbook />
    </>
  );
}
