import { useMemo, useState } from 'react';
import { ArrowRight, Database, Flame, Plus, Sparkles, Wind } from 'lucide-react';
import Engine from '../components/engine/Engine';
import Checklist from '../components/Checklist';
import { Bar, INDICATOR_ICONS } from '../components/ui';
import { INDICATORS } from '../data/catalog';
import { hasDemo } from '../data/demo';
import { readings } from '../lib/metrics';
import { buildReport } from '../lib/report';
import { useStore } from '../state/store';
import type { IndicatorId } from '../types';

export default function EngineRoom() {
  const { state, today, condition, progress, reducedMotion, pulse, act } = useStore();
  const rs = useMemo(() => readings(state, today), [state, today]);
  const report = useMemo(() => buildReport(state, today), [state, today]);
  const [picked, setPicked] = useState<IndicatorId | null>(null);
  const selected = picked ?? report.focus ?? 'cooling';
  const demo = hasDemo(state);

  return (
    <div className="stack">
      {demo && (
        <div className="demo-banner" role="note">
          <Database size={18} color="var(--verdigris)" aria-hidden="true" />
          <span className="grow">
            <span className="tag demo">Demo</span>&nbsp; Some history here is sample data so you can see the engine in motion. Your own entries replace today’s sample readings automatically.
          </span>
          <button className="btn sm ghost" onClick={() => act({ type: 'clearDemo' })}>
            Clear sample data
          </button>
        </div>
      )}

      <div className="room">
        <div className="stack">
          <section className="plate engine-stage" aria-labelledby="engine-title">
            <div className="stage-head">
              <div>
                <div className="eyebrow">Engine Room</div>
                <h2 id="engine-title">Today’s engine</h2>
                <div className="stage-state">
                  {condition.label} · {Math.round(condition.overall * 100)}% output
                </div>
              </div>
            </div>
            <Engine condition={condition} equipped={state.equipped} reducedMotion={reducedMotion} pulse={pulse} selected={selected} onSelect={setPicked} />
            <div className="engine-hint" aria-hidden="true">
              Select any part of the machine to inspect it.
            </div>
          </section>

          <section className="plate rivets" aria-labelledby="report-title">
            <div className="plate-head">
              <div>
                <div className="eyebrow">Daily engine report</div>
                <h3 id="report-title" className="sr-only">Daily engine report</h3>
              </div>
              <span className="tag self">From your entries</span>
            </div>
            <div className="report" aria-live="polite">
              <div className="headline">{report.headline}</div>
              {report.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              {report.suggestion && (
                <div className="next">
                  <ArrowRight aria-hidden="true" />
                  <span>{report.suggestion}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="stack" aria-label="Engine readings">
          <Inspector id={selected} />

          <section className="plate rivets" aria-labelledby="ind-title">
            <div className="plate-head">
              <div>
                <div className="eyebrow">Five indicators</div>
                <h3 id="ind-title">Today’s readings</h3>
              </div>
              <a className="small muted" href="#/habits">Targets are yours to change →</a>
            </div>
            <div className="indicators">
              {rs.map((r) => {
                const I = INDICATOR_ICONS[r.id];
                return (
                  <button key={r.id} className={`ind${r.ignored ? ' ignored' : ''}`} aria-pressed={selected === r.id} onClick={() => setPicked(r.id)}>
                    <span className="ico">
                      <I aria-hidden="true" />
                    </span>
                    <span>
                      <span className="name">
                        {r.label} <span className="sub">{INDICATORS[r.id].habit}</span>
                      </span>
                      <Bar value={r.value ?? 0} ind={r.id} label={`${r.label} progress`} />
                    </span>
                    <span className="val">
                      {r.ignored ? 'Not tracked' : r.current}
                      {!r.ignored && r.target && (
                        <>
                          <br />
                          <small>target {r.target}</small>
                        </>
                      )}
                      {!r.ignored && !r.target && (
                        <>
                          <br />
                          <small>self-reported</small>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="plate rivets level" aria-labelledby="lvl-title">
            <div className="level-row">
              <div className="level-badge" aria-hidden="true">
                {progress.level}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow">Level {progress.level}</div>
                <div className="level-title" id="lvl-title">
                  {progress.title}
                </div>
              </div>
              <div className="mono small muted" style={{ textAlign: 'right' }}>
                {progress.into}/{progress.span}
                <br />
                XP
              </div>
            </div>
            <Bar className="xpbar" value={progress.into / progress.span} label="Experience toward next level" />
            <div className="stats">
              <div className="stat">
                <b>{progress.todayTotal}</b>
                <span>XP today</span>
              </div>
              <div className="stat">
                <b>{progress.streak.current}</b>
                <span>day rhythm</span>
              </div>
              <div className="stat">
                <b>{progress.streak.last7}/7</b>
                <span>days tended</span>
              </div>
            </div>
            <p className="small muted">
              {progress.streak.current === 0
                ? 'Every engine starts cold. One task today starts a new rhythm.'
                : progress.streak.todayActive
                  ? `Tended today. Your best rhythm so far is ${progress.streak.best} ${progress.streak.best === 1 ? 'day' : 'days'}.`
                  : 'Your rhythm carries through today. Whenever you’re ready, any single task keeps it going.'}
            </p>
          </section>
        </aside>
      </div>

      <Checklist />
    </div>
  );
}

function Inspector({ id }: { id: IndicatorId }) {
  const { state, today, act } = useStore();
  const r = readings(state, today).find((x) => x.id === id)!;
  const info = INDICATORS[id];
  const I = INDICATOR_ICONS[id];
  const quick: Record<IndicatorId, { label: string; run: () => void; icon: typeof Plus } | null> = {
    cooling: { label: 'Add a glass of water', icon: Plus, run: () => act({ type: 'water', date: today, delta: 1 }, { pulse: 'cooling', label: 'Glass of water' }) },
    fuel: { label: 'Mark a nourishing meal', icon: Flame, run: () => act({ type: 'meal', date: today, delta: 1 }, { pulse: 'fuel', label: 'Nourishing meal' }) },
    motion: { label: 'Add 10 minutes of movement', icon: Plus, run: () => act({ type: 'move', date: today, delta: 10 }, { pulse: 'motion', label: '10 minutes of movement' }) },
    equilibrium: { label: 'Log a breathing break', icon: Wind, run: () => act({ type: 'breath', date: today, delta: 1 }, { pulse: 'vent', label: 'Breathing break' }) },
    rest: null,
  };
  const q = quick[id];
  const pct = r.value === null ? null : Math.round(r.value * 100);
  return (
    <section className="plate rivets" aria-labelledby="insp-title" aria-live="polite">
      <div className="subsys">
        <svg className="meter-big" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx={32} cy={32} r={28} fill="#120e0b" stroke="rgba(201,154,75,0.35)" />
          <circle cx={32} cy={32} r={24} fill="none" stroke="rgba(201,154,75,0.12)" strokeWidth={5} />
          <circle cx={32} cy={32} r={24} fill="none" stroke="var(--amber)" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${((pct ?? 0) / 100) * 150.8} 150.8`} transform="rotate(-90 32 32)" style={{ transition: 'stroke-dasharray .6s' }} />
          <foreignObject x={20} y={20} width={24} height={24}>
            <I color="#ecc777" width={24} height={24} />
          </foreignObject>
        </svg>
        <div>
          <div className="sys-name">{info.system}</div>
          <h3 id="insp-title">
            {info.name} {r.ignored ? <span className="tag self">Not tracked</span> : <span className="mono small muted">{pct === null ? 'awaiting entry' : `${pct}%`}</span>}
          </h3>
          <p className="small" style={{ color: 'var(--cream)', marginTop: 4 }}>
            {info.blurb}
          </p>
          <p className="small muted" style={{ marginTop: 6 }}>
            Logged: {r.ignored ? '—' : r.current}
            {r.target && !r.ignored ? ` · target ${r.target}` : ''}
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            {q && (
              <button className="btn sm" onClick={q.run}>
                <q.icon /> {q.label}
              </button>
            )}
            {id === 'rest' && (
              <button
                className="btn sm"
                onClick={() => {
                  const el = document.getElementById('sleep-in');
                  el?.scrollIntoView({ block: 'center' });
                  el?.focus({ preventScroll: true });
                }}
              >
                <Sparkles /> Record sleep below
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
