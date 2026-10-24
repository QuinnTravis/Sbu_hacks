import { useEffect, useMemo, useRef, useState } from 'react';
import { demoWorld } from '../data/world';
import { demandFlows, hourProfile, onboardLoad, sampleEvent } from '../data/models';
import { compare, enumerateCohorts, simulate, totals, TIMED_WINDOW_SEC, type CohortStats, type Comparison, type Intervention, type SimResult } from '../engine/analytics';
import { connectionProbability } from '../engine/transfer';
import { stationGraphs } from '../data/stations';
import { bindingKey, type InsightsFocus, type Settings, type StationFocus } from '../app/settings';
import { Icon, NeedVsWindow, Prov, RiskPill, Seg, assessP, fmtClock, fmtMin, fmtRange, pct } from '../ui/kit';

const world = demoWorld;
const DAYS = 100;
const SEED = 2026;
type DayType = 'normal' | 'event';
type Hours = 'all' | 'am' | 'mid' | 'pm' | 'eve';
const HOURS: Record<Hours, [number, number]> = { all: [0, 30], am: [6, 10], mid: [10, 15], pm: [15, 19.5], eve: [19.5, 30] };
const EVENTS = sampleEvent('afternoon');

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const shortFlow = (label: string) => label.split(' · ')[1] ?? label;

function Kpi({ v, label, d }: { v: string; label: string; d: string }) {
  return (
    <div className="kpi">
      <span className="eyebrow">{label}</span>
      <span className="v">{v}</span>
      <span className="d">{d}</span>
    </div>
  );
}

function Heatmap({ stats }: { stats: CohortStats[] }) {
  const hours = Array.from({ length: 19 }, (_, i) => i + 5);
  const flows = demandFlows.filter((f) => stats.some((s) => s.cohort.flow.id === f.id));
  const cell = (fid: string, h: number) => {
    let w = 0, miss = 0;
    for (const s of stats) {
      if (s.cohort.flow.id !== fid || s.cohort.windowSec > TIMED_WINDOW_SEC) continue;
      if (Math.floor(s.cohort.inArr / 3600) !== h) continue;
      w += s.pax;
      miss += s.pax * (1 - s.pSuccess);
    }
    return w ? miss / w : null;
  };
  return (
    <div className="scroll-x" style={{ padding: '0 20px 18px' }}>
      <div className="heat" style={{ gridTemplateColumns: `minmax(170px, 1.4fr) repeat(${hours.length}, minmax(20px, 1fr))`, minWidth: 620 }}>
        <span />
        {hours.map((h) => <span key={h} className="mono muted" style={{ textAlign: 'center', fontSize: 10 }}>{h % 12 || 12}{h < 12 ? 'a' : 'p'}</span>)}
        {flows.map((f) => (
          <div key={f.id} style={{ display: 'contents' }}>
            <span style={{ fontSize: 11.5, alignSelf: 'center', paddingRight: 8 }}>{f.label.replace(' · ', ' — ')}</span>
            {hours.map((h) => {
              const v = cell(f.id, h);
              return (
                <span key={h} className="cell" title={v === null ? 'No timed connections' : `${f.label}, ${h}:00 — ${pct(v)} miss (simulated)`}
                  style={v === null
                    ? { border: '1px dashed var(--line)' }
                    : { background: `color-mix(in srgb, var(--bad) ${Math.round(Math.min(1, v / 0.6) * 85) + 4}%, var(--surface-2))` }} />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 11 }} className="muted">
        <span>0%</span>
        <span style={{ width: 120, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, color-mix(in srgb, var(--bad) 4%, var(--surface-2)), var(--bad))' }} />
        <span>60%+ of transferring riders miss</span>
        <span style={{ width: 14, height: 10, border: '1px dashed var(--line-strong)', borderRadius: 2, marginLeft: 10 }} />
        <span>no timed connection</span>
      </div>
    </div>
  );
}

function DayComparison({ normal, event }: { normal: SimResult; event: SimResult }) {
  const rows = demandFlows.map((f) => {
    const sel = (s: CohortStats) => s.cohort.flow.id === f.id && s.cohort.windowSec <= TIMED_WINDOW_SEC && s.cohort.inArr >= 12 * 3600 && s.cohort.inArr <= 19 * 3600;
    const n = totals(normal.cohorts, sel);
    const e = totals(event.cohorts, sel);
    return { f, n: n.paxPerDay ? n.madePaxPerDay / n.paxPerDay : null, e: e.paxPerDay ? e.madePaxPerDay / e.paxPerDay : null };
  }).filter((r) => r.n !== null);
  return (
    <div style={{ padding: '0 20px 18px', display: 'grid', gap: 10 }}>
      {rows.map(({ f, n, e }) => (
        <div key={f.id} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
            <span>{f.label}</span>
            <span className="mono muted">{pct(n!)} → {pct(e!)}</span>
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--sunken)' }}><div style={{ width: pct(n!), height: '100%', borderRadius: 3, background: 'var(--ink-2)' }} /></div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--sunken)' }}><div style={{ width: pct(e!), height: '100%', borderRadius: 3, background: 'var(--warn)' }} /></div>
          </div>
        </div>
      ))}
      <div className="legend-list">
        <span><i style={{ width: 14, height: 6, borderRadius: 3, background: 'var(--ink-2)', display: 'inline-block' }} />Normal weekday</span>
        <span><i style={{ width: 14, height: 6, borderRadius: 3, background: 'var(--warn)', display: 'inline-block' }} />Sample event day (1:10 PM game)</span>
        <span className="muted">Timed connections 12–7 PM, rider-weighted</span>
      </div>
    </div>
  );
}

function Simulator({ selected, dayType }: { selected: CohortStats | null; dayType: DayType }) {
  const [kind, setKind] = useState<'hold' | 'shift' | 'edge'>('hold');
  const [hold, setHold] = useState(90);
  const [shift, setShift] = useState(3);
  const [edgeId, setEdgeId] = useState<string>('');
  const [reduction, setReduction] = useState(40);
  const [res, setRes] = useState<{ cmp: Comparison; iv: Intervention; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = selected?.cohort;
  const g = c?.stationId ? stationGraphs[c.stationId] : undefined;
  const outTrip = c ? world.tt.trips[c.outTripId] : null;
  const outRoute = outTrip ? world.tt.routes[outTrip.routeId] : null;
  const station = c ? world.tt.stops[c.flow.toStop].name : '';
  useEffect(() => {
    if (g) {
      const pathIds = new Set(selected?.model.paths?.best.path.steps.map((s) => s.edge.id));
      const e = g.edges.filter((x) => pathIds.has(x.id)).sort((a, b) => b.medianSec - a.medianSec)[0] ?? g.edges[0];
      setEdgeId(e.id);
    }
    setRes(null);
  }, [selected?.cohort.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c || !outTrip || !outRoute) return <div className="sim"><div className="empty"><strong>Select a connection</strong><span>Pick a row in the table to test changes to it.</span></div></div>;

  const label =
    kind === 'hold'
      ? `Hold ${outRoute.longName} trains at ${station} up to ${hold}s for connecting riders`
      : kind === 'shift'
        ? `Move the ${fmtClock(c.outDep)} ${outRoute.longName} departure ${shift > 0 ? 'later' : 'earlier'} by ${Math.abs(shift)} min (whole trip)`
        : `Make "${g?.edges.find((e) => e.id === edgeId)?.label ?? edgeId}" ${reduction}% faster`;

  const run = () => {
    const iv: Intervention =
      kind === 'hold'
        ? { kind: 'hold', stopId: c.flow.toStop, routeId: outTrip.routeId, directionId: outTrip.directionId, maxHoldSec: hold }
        : kind === 'shift'
          ? { kind: 'shift', tripId: c.outTripId, shiftSec: shift * 60 }
          : { kind: 'edge', stationId: c.stationId!, edgeId, reductionPct: reduction };
    setBusy(true);
    setError(null);
    setTimeout(() => {
      try {
        const cmp = compare(world, demandFlows, hourProfile, { days: DAYS, seed: SEED, events: dayType === 'event' ? EVENTS : [], onboardLoad }, iv);
        setRes({ cmp, iv, label });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const rows = res
    ? (() => {
        const b = res.cmp.beforeTotals, a = res.cmp.afterTotals;
        return [
          { k: 'Riders making their connection', b: b.madePaxPerDay, a: a.madePaxPerDay, up: true, f: fmtInt },
          { k: 'Riders missing their connection', b: b.missedPaxPerDay, a: a.missedPaxPerDay, up: false, f: fmtInt },
          { k: 'Average wait per transferring rider', b: b.waitPaxMinPerDay / b.paxPerDay, a: a.waitPaxMinPerDay / a.paxPerDay, up: false, f: (x: number) => `${x.toFixed(1)} min` },
          { k: 'Passenger-minutes waiting at transfers', b: b.waitPaxMinPerDay, a: a.waitPaxMinPerDay, up: false, f: fmtInt },
          { k: 'Passenger-minutes of hold delay to riders on board', b: res.cmp.before.holdPaxMinPerDay, a: res.cmp.after.holdPaxMinPerDay, up: false, f: fmtInt },
        ];
      })()
    : [];
  const ivStation = c.stationId;

  return (
    <div className="sim">
      <div className="controls">
        <Seg label="Intervention" light value={kind} onChange={(k) => { setKind(k); setRes(null); }} options={[
          { value: 'hold', label: 'Hold train' },
          { value: 'shift', label: 'Shift departure' },
          { value: 'edge', label: 'Faster walkway' },
        ]} />
        {kind === 'hold' && (
          <div className="field">
            <label htmlFor="hold">Maximum hold for late connecting riders</label>
            <div className="slider-row"><input id="hold" type="range" min={15} max={180} step={15} value={hold} onChange={(e) => setHold(Number(e.target.value))} /><span className="mono">{hold}s</span></div>
            <span className="small muted">Applies to every {outRoute.longName} departure from {station} in the direction of this connection.</span>
          </div>
        )}
        {kind === 'shift' && (
          <div className="field">
            <label htmlFor="shift">Shift the {fmtClock(c.outDep)} departure</label>
            <div className="slider-row"><input id="shift" type="range" min={-5} max={5} step={1} value={shift} onChange={(e) => setShift(Number(e.target.value))} /><span className="mono">{shift > 0 ? '+' : ''}{shift} min</span></div>
            <span className="small muted">The whole trip moves, so connections further along the line change too.</span>
          </div>
        )}
        {kind === 'edge' && g && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="field">
              <label htmlFor="edge">Walkway segment at {g.name}</label>
              <select id="edge" className="input" value={edgeId} onChange={(e) => setEdgeId(e.target.value)}>
                {[...g.edges].sort((a, b) => b.medianSec - a.medianSec).map((e) => <option key={e.id} value={e.id}>{e.label ?? `${e.kind} ${e.from} → ${e.to}`} · {e.medianSec}s</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="red">Reduce traversal time by</label>
              <div className="slider-row"><input id="red" type="range" min={10} max={70} step={5} value={reduction} onChange={(e) => setReduction(Number(e.target.value))} /><span className="mono">{reduction}%</span></div>
            </div>
          </div>
        )}
        {kind === 'edge' && !g && <div className="banner">{Icon.info(16)}<span>This station has no indoor model, so walkway changes can’t be tested here.</span></div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={run} disabled={busy || (kind === 'edge' && !g)}>{busy ? 'Simulating…' : 'Run simulation'}</button>
          <span className="small muted">{DAYS} {dayType === 'event' ? 'event' : 'normal'} days · same random draws before and after</span>
        </div>
      </div>
      {error && <div className="banner bad">{Icon.alert(16)}<span>Simulation failed: {error}</span></div>}
      {res && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="small"><strong>{res.label}.</strong></div>
          <div className="scroll-x">
            <table className="data compare">
              <thead><tr><th>Network, per {dayType === 'event' ? 'event' : 'normal'} day</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = r.a - r.b;
                  const good = r.up ? d > 0 : d < 0;
                  const tiny = Math.abs(d) < (r.k.startsWith('Average') ? 0.05 : 0.5);
                  return (
                    <tr key={r.k} style={{ cursor: 'default' }}>
                      <td>{r.k}</td><td className="mono">{r.f(r.b)}</td><td className="mono">{r.f(r.a)}</td>
                      <td className={`mono ${tiny ? '' : good ? 'delta-good' : 'delta-bad'}`}>{tiny ? '—' : `${d > 0 ? '+' : '−'}${r.f(Math.abs(d))}`}</td>
                    </tr>
                  );
                })}
                <tr style={{ cursor: 'default' }}>
                  <td><strong>Net passenger-minutes saved</strong></td><td /><td />
                  <td className={`mono ${res.cmp.netPaxMinPerDay >= 0 ? 'delta-good' : 'delta-bad'}`}><strong>{res.cmp.netPaxMinPerDay >= 0 ? '+' : '−'}{fmtInt(Math.abs(res.cmp.netPaxMinPerDay))}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          {res.cmp.changed.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="eyebrow">Connections that changed most</span>
              {res.cmp.changed.slice(0, 6).map((ch) => {
                const downstream = ch.before.cohort.stationId !== ivStation;
                return (
                  <div key={ch.before.cohort.id} className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span>{ch.flowLabel}, arriving {fmtClock(ch.inArr)} {downstream && <span className="tag" style={{ marginLeft: 4 }}>downstream</span>}</span>
                    <span className="mono">{pct(ch.before.pSuccess)} → {pct(ch.after.pSuccess)} · wait {fmtMin(ch.before.meanWaitSec)} → {fmtMin(ch.after.meanWaitSec)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {res.cmp.warnings.map((w) => <div key={w} className="banner warn">{Icon.alert(16)}<span>{w}</span></div>)}
          <p className="small muted">
            An experiment on synthetic demand and delays, not a recommendation. Holds are costed for riders on board; effects on following trains, crew schedules and track capacity are not modelled. A shifted train’s own riders who board before this station are not costed.
          </p>
        </div>
      )}
    </div>
  );
}

export function InsightsPage({ settings, focus, onOpenStation }: { settings: Settings; focus: InsightsFocus | null; onOpenStation: (f: StationFocus) => void }) {
  const [dayType, setDayType] = useState<DayType>(settings.event !== 'none' ? 'event' : 'normal');
  const [station, setStation] = useState<string>('all');
  const [hours, setHours] = useState<Hours>('all');
  const [fragileOnly, setFragileOnly] = useState(true);
  const [sims, setSims] = useState<{ normal: SimResult; event: SimResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => {
      try {
        const cohorts = enumerateCohorts(world, demandFlows, hourProfile);
        const base = { days: DAYS, seed: SEED, intervention: { kind: 'none' } as const, onboardLoad };
        setSims({ normal: simulate(world, cohorts, { ...base, events: [] }), event: simulate(world, cohorts, { ...base, events: EVENTS }) });
      } catch (e) {
        setError((e as Error).message);
      }
    }, 30);
    return () => clearTimeout(h);
  }, []);

  const pendingFocus = useRef<InsightsFocus | null>(focus);
  const focusedId = useRef<string | null>(null);
  useEffect(() => {
    pendingFocus.current = focus;
  }, [focus]);
  useEffect(() => {
    const f = pendingFocus.current;
    if (!f || !sims) return;
    const s = sims.normal.cohorts.find((x) => x.cohort.flow.fromStop === f.fromStop && x.cohort.flow.toStop === f.toStop && x.cohort.inTripId === f.inTripId);
    pendingFocus.current = null;
    if (s) {
      focusedId.current = s.cohort.id;
      setSelectedId(s.cohort.id);
      setStation('all');
      setHours('all');
      setFragileOnly(false);
    }
  }, [focus, sims]);

  const active = sims ? (dayType === 'event' ? sims.event : sims.normal) : null;
  const filter = (s: CohortStats) => {
    const h = s.cohort.inArr / 3600;
    const [lo, hi] = HOURS[hours];
    return (station === 'all' || s.cohort.stationId === station) && h >= lo && h < hi;
  };
  const t = active ? totals(active.cohorts, filter) : null;
  const rows = useMemo(() => {
    if (!active) return [];
    return active.cohorts
      .filter((s) => filter(s) && s.cohort.windowSec <= TIMED_WINDOW_SEC && (!fragileOnly || s.pSuccess < 0.85))
      .sort((a, b) => b.pax * b.meanMissLossSec - a.pax * a.meanMissLossSec);
  }, [active, station, hours, fragileOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pendingFocus.current) return;
    if (focusedId.current) {
      if (rows.some((r) => r.cohort.id === focusedId.current)) focusedId.current = null;
      return;
    }
    if (rows.length && !rows.some((r) => r.cohort.id === selectedId)) setSelectedId(rows[0].cohort.id);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = active?.cohorts.find((s) => s.cohort.id === selectedId) ?? null;
  const selectedOther = sims && selected ? (dayType === 'event' ? sims.normal : sims.event).cohorts.find((s) => s.cohort.id === selected.cohort.id) ?? null : null;
  const riderView = useMemo(() => {
    if (!selected) return null;
    const c = selected.cohort;
    return connectionProbability(
      world,
      { nowSec: 0, events: dayType === 'event' ? EVENTS : [], realtime: null, staleAfterSec: 300, accessible: false, familiarity: 'regular' },
      { inTrip: world.tt.trips[c.inTripId], inIdx: c.inIdx, outTrip: world.tt.trips[c.outTripId], outIdx: c.outIdx },
      { n: 3000, seed: 7 },
    );
  }, [selected, dayType]);

  const shown = showAll ? rows : rows.slice(0, 14);
  const routeOf = (tripId: string) => world.tt.routes[world.tt.trips[tripId].routeId];

  return (
    <div className="insights">
      <section className="panel">
        <div className="bar">
          <div style={{ display: 'grid', gap: 4 }}>
            <h1 style={{ fontSize: 22 }}>Connection reliability</h1>
            <span className="small muted">Where scheduled transfers fail in practice, using the same station models and transfer model as trip planning.</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Seg label="Day type" value={dayType} onChange={setDayType} options={[{ value: 'normal', label: 'Normal day' }, { value: 'event', label: 'Event day' }]} />
            <div className="field">
              <label htmlFor="ins-station">Station</label>
              <select id="ins-station" className="input" value={station} onChange={(e) => setStation(e.target.value)} style={{ padding: '6px 9px' }}>
                <option value="all">All stations</option>
                {['woodside', 'jackson-heights', 'jamaica', 'huntington'].map((s) => <option key={s} value={s}>{stationGraphs[s].name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ins-hours">Time of day</label>
              <select id="ins-hours" className="input" value={hours} onChange={(e) => setHours(e.target.value as Hours)} style={{ padding: '6px 9px' }}>
                <option value="all">All day</option><option value="am">AM peak 6–10</option><option value="mid">Midday 10–3</option><option value="pm">PM peak 3–7:30</option><option value="eve">Evening</option>
              </select>
            </div>
          </div>
        </div>
        <div className="banner" style={{ margin: '0 20px 14px' }}>
          {Icon.info(16)}
          <span>
            <strong>Simulated history, not observations.</strong> {DAYS} synthetic service days replayed through a synthetic timetable, delay model and transfer demand
            {dayType === 'event' ? ', with a sample 1:10 PM Citi Field game' : ''}. Use it to compare scenarios, not to quote real figures. <Prov>Simulated · synthetic</Prov>
          </span>
        </div>
        {error && <div className="banner bad" style={{ margin: '0 20px 14px' }}>{Icon.alert(16)}<span>Analysis failed: {error}</span></div>}
        {!t && !error && <div style={{ padding: '0 20px 20px' }}><div className="skeleton" style={{ height: 80 }} /></div>}
        {t && (
          <div className="kpis" style={{ borderTop: '1px solid var(--line)' }}>
            <Kpi label="Timed connections" v={fmtInt(t.timedConnections)} d="scheduled windows of 20 min or less" />
            <Kpi label="Phantom connections" v={fmtInt(t.phantom)} d="valid on the timetable, made by under 70%" />
            <Kpi label="Riders missing a connection" v={fmtInt(t.missedPaxPerDay)} d={`of ${fmtInt(t.paxPerDay)} transferring per day`} />
            <Kpi label="Passenger-minutes lost" v={fmtInt(t.missPaxMinPerDay)} d="per day, waiting for the next service" />
          </div>
        )}
      </section>

      <div className="ins-grid">
        <section className="panel" aria-label="Fragile transfers">
          <div className="section-head">
            <h2>Fragile transfers, ranked by passenger-minutes lost</h2>
            <label className="check small"><input id="frag" type="checkbox" checked={fragileOnly} onChange={(e) => setFragileOnly(e.target.checked)} /> Only below 85%</label>
          </div>
          {!active && <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 240 }} /></div>}
          {active && rows.length === 0 && <div className="empty"><strong>No fragile connections in this view</strong><span>Every timed connection here is made at least 85% of the time. Widen the filters to see all connections.</span></div>}
          {active && rows.length > 0 && (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr><th>Connection</th><th>Window</th><th>Walk (P10–P90)</th><th>Made</th><th>If missed</th><th>Riders/day</th><th>Pax-min lost</th></tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const c = s.cohort;
                    return (
                      <tr key={c.id} className={c.id === selectedId ? 'sel' : ''} onClick={() => setSelectedId(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedId(c.id)}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{shortFlow(c.flow.label)}</div>
                          <div className="small muted">{c.flow.label.split(' · ')[0]} · {routeOf(c.inTripId).shortName} {fmtClock(c.inArr)} → {routeOf(c.outTripId).shortName} {fmtClock(c.outDep)}{s.phantom ? ' · phantom' : ''}</div>
                        </td>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtMin(c.windowSec)}</td>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtRange(s.physical.p10, s.physical.p90)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="meter"><i style={{ width: pct(s.pSuccess), background: s.pSuccess >= 0.9 ? 'var(--ok)' : s.pSuccess >= 0.7 ? 'var(--warn)' : 'var(--bad)' }} /></span>
                          <span className="mono">{pct(s.pSuccess)}</span>
                        </td>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>{c.missWaitSec !== null ? `+${Math.round(c.missWaitSec / 60)} min` : 'none'}</td>
                        <td className="mono">{fmtInt(s.pax)}</td>
                        <td className="mono">{fmtInt((s.pax * s.meanMissLossSec) / 60)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 14 && (
                <div style={{ padding: '10px 20px' }}><button className="btn ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button></div>
              )}
            </div>
          )}
        </section>

        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel" aria-label="Selected connection">
            {!selected && <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 200 }} /></div>}
            {selected && riderView && (
              <div style={{ padding: '16px 20px 18px', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <span className="eyebrow">{selected.cohort.flow.label.split(' · ')[0]}</span>
                    <h2 style={{ fontSize: 16 }}>{routeOf(selected.cohort.inTripId).shortName} arrives {fmtClock(selected.cohort.inArr)} → {routeOf(selected.cohort.outTripId).longName} {fmtClock(selected.cohort.outDep)}</h2>
                  </div>
                  <RiskPill a={selected.cohort.windowSec < 0 ? 'impossible' : assessP(selected.pSuccess)} />
                </div>
                <div className="facts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  <div className="fact"><span className="k">Scheduled window</span><span className="v">{fmtMin(selected.cohort.windowSec)}</span><span className="small muted">minimum {fmtMin(selected.cohort.schedMinSec)}</span></div>
                  <div className="fact"><span className="k">Made · {dayType === 'event' ? 'event' : 'normal'}</span><span className="v">{pct(selected.pSuccess)}</span><span className="small muted">95% CI {pct(selected.ci[0])}–{pct(selected.ci[1])}, n={DAYS}</span></div>
                  <div className="fact"><span className="k">Made · {dayType === 'event' ? 'normal' : 'event'}</span><span className="v">{selectedOther ? pct(selectedOther.pSuccess) : '—'}</span><span className="small muted">same seed</span></div>
                  <div className="fact"><span className="k">Wait if missed</span><span className="v">{selected.cohort.missWaitSec !== null ? fmtMin(selected.cohort.missWaitSec) : '—'}</span><span className="small muted">next departure, same line</span></div>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span className="small muted">Rider model for this connection ({fmtMin(riderView.windowSec)} window): {pct(riderView.pSuccess)} make it. This is the number a rider sees in Plan.</span>
                  <NeedVsWindow needSec={riderView.marginSamples.map((m) => m + riderView.windowSec)} windowSec={riderView.windowSec} />
                </div>
                {selected.phantom && (
                  <div className="banner warn">{Icon.alert(16)}<span><strong>Phantom connection.</strong> The window meets the published {fmtMin(selected.cohort.schedMinSec)} minimum, but the station model puts the walk at {fmtRange(selected.physical.p10, selected.physical.p90)} before train delays.</span></div>
                )}
                {selected.model.graph && selected.model.inBinding && selected.model.outBinding && (
                  <div><button className="btn" onClick={() => onOpenStation({ stationId: selected.model.graph!.id, fromKey: bindingKey(selected.model.inBinding!), toKey: bindingKey(selected.model.outBinding!) })}>{Icon.station(16)} Station layout</button></div>
                )}
              </div>
            )}
          </section>
          <section className="panel" aria-label="Schedule intervention simulator">
            <div className="section-head" style={{ paddingBottom: 0 }}>
              <h2>Test a change</h2>
              <Prov>Experiment</Prov>
            </div>
            <Simulator selected={selected} dayType={dayType} />
          </section>
        </div>
      </div>

      <div className="ins-grid">
        <section className="panel" aria-label="Transfer risk by hour">
          <div className="section-head"><h2>Transfer risk by hour · {dayType === 'event' ? 'event day' : 'normal day'}</h2><Prov>Simulated</Prov></div>
          {active ? <Heatmap stats={active.cohorts.filter((s) => station === 'all' || s.cohort.stationId === station)} /> : <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div>}
        </section>
        <section className="panel" aria-label="Normal versus event day">
          <div className="section-head"><h2>Normal vs. event day</h2><Prov>Simulated</Prov></div>
          {sims ? <DayComparison normal={sims.normal} event={sims.event} /> : <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div>}
        </section>
      </div>
    </div>
  );
}
