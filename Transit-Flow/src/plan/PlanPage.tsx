import { useEffect, useMemo, useRef, useState } from 'react';
import { demoWorld } from '../data/world';
import { places, realtimeScenarios, type RealtimeScenario } from '../data/models';
import { plan, type Place, type PlanResult, type RouteOption } from '../engine/planner';
import { realtimeStatus } from '../engine/delays';
import { mtaProxyProvider, type ProviderState } from '../engine/realtime';
import type { JourneyEval } from '../engine/evaluate';
import type { EventWindow } from '../engine/types';
import { buildContext, type EventDetection, type InsightsFocus, type Settings, type StationFocus } from '../app/settings';
import { NetworkMap } from './NetworkMap';
import { JourneyDetail, flowFor } from './JourneyDetail';
import {
  Icon, Loading, Prov, RiskPill, RouteChip, Seg, assessP, fmtClock, fmtMin, fmtRange, hhmm, parseHhmm, pct,
} from '../ui/kit';

const world = demoWorld;
const byId = (id: string) => places.find((p) => p.id === id)!;

function PlaceCombo({ id, label, value, onChange, dest }: { id: string; label: string; value: Place; onChange: (p: Place) => void; dest?: boolean }) {
  const [text, setText] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  useEffect(() => setText(value.name), [value]);
  const q = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!open) return [];
    const all = places.filter((p) => !q || q === value.name.toLowerCase() || p.name.toLowerCase().includes(q) || p.aliases?.some((a) => a.includes(q)) || p.area.toLowerCase().includes(q));
    return all.slice(0, 8);
  }, [q, open, value.name]);
  const pick = (p: Place) => {
    onChange(p);
    setText(p.name);
    setOpen(false);
  };
  return (
    <div className="combo">
      <span className={`dot${dest ? ' dest' : ''}`} />
      <input
        id={id}
        className="input"
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        value={text}
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onBlur={() => setTimeout(() => { setOpen(false); setText(value.name); }, 120)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setHi((h) => Math.min(h + 1, matches.length - 1)); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
          if (e.key === 'Enter' && matches[hi]) { pick(matches[hi]); e.preventDefault(); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className="combo-list" id={`${id}-list`} role="listbox">
          {matches.length === 0 && <div className="small muted" style={{ padding: 10 }}>No station matches “{text}”. Try Flushing, Woodside, Jamaica or Stony Brook.</div>}
          {matches.map((p, i) => (
            <button key={p.id} role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span className="small muted">{p.area}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Human names for the stations an event crowds, busiest first. */
function crowdedStops(ev: EventWindow) {
  const stops = Object.values(world.tt.stops);
  const names = Object.entries(ev.stationImpact)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => (stops.find((s) => s.stationId === k || s.id === k)?.name ?? k).replace(' (LIRR)', ''));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
}

function EventStatus({ d }: { d: EventDetection }) {
  if (d.kind === 'loading') return <span className="small muted">Checking for games, concerts and events near the network…</span>;
  if (d.kind === 'error') return <div className="banner warn">{Icon.alert(16)}<span>Couldn’t check for events today ({d.message}). Crowding from games or concerts isn’t included.</span></div>;
  if (d.events.length) return d.failed.length ? <span className="small muted">Some event sources didn’t answer: {d.failed.join('; ')}.</span> : null;
  return <span className="small muted">No games or concerts near the network today. Checked {d.sources.join(' and ')}.{d.failed.length ? ` Unavailable: ${d.failed.join('; ')}.` : ''}</span>;
}

type Status = { kind: 'loading' } | { kind: 'ready'; result: PlanResult } | { kind: 'error'; message: string };

export function lateBy(sec: number) {
  return sec <= 60 ? 'same arrival' : `+${fmtMin(sec)} vs plan`;
}

function worst(e: JourneyEval) {
  if (!e.transfers.length) return null;
  return e.transfers.reduce((a, b) => (b.conn.pSuccess < a.conn.pSuccess ? b : a));
}

function RouteCard({
  o, result, selected, variantKey, onSelect, onVariant, children,
}: {
  o: RouteOption; result: PlanResult; selected: boolean; variantKey: string; onSelect: () => void; onVariant: (k: string) => void; children?: React.ReactNode;
}) {
  const e = [o.rep, ...o.tight].find((x) => x.journey.key === variantKey) ?? o.rep;
  const j = e.journey;
  const w = worst(e);
  const rides = j.rides;
  const mode = result.query.mode;
  return (
    <article className={`card${selected ? ' selected' : ''}`} aria-label={`Route leaving ${fmtClock(j.departSec)}`}>
      <button onClick={onSelect} style={{ all: 'unset', display: 'grid', gap: 9, cursor: 'pointer' }} aria-expanded={selected}>
        {o.tags.length > 0 && (
          <div className="tagline">
            {o.tags.map((t) => <span key={t} className={`tag${t === 'Recommended' ? ' rec' : ''}`}>{t}</span>)}
          </div>
        )}
        <div className="top">
          <span className="times">
            {fmtClock(j.departSec)} <span className="arrow">→</span> {fmtClock(j.arriveSec)}
          </span>
          <span className="dur">{fmtMin(j.arriveSec - j.departSec)}</span>
        </div>
        <div className="legs">
          {rides.map((r, i) => (
            <span key={i} style={{ display: 'contents' }}>
              {i > 0 && <span className="sep">› {world.tt.stops[r.fromStop].name.split('–')[0].replace(' (LIRR)', '')} ›</span>}
              <RouteChip route={world.tt.routes[r.routeId]} />
            </span>
          ))}
        </div>
        <div className="meta">
          {w ? <RiskPill a={w.conn.assessment}>{w.model.stationName}: {pct(w.conn.pSuccess)}</RiskPill> : <span className="pill neutral">No transfers</span>}
          <span>{rides.length - 1} transfer{rides.length === 2 ? '' : 's'}</span>
          <span>{fmtMin(e.walkingSec)} walking</span>
          {mode === 'depart' ? (
            <span>Expected <span className="mono">{fmtClock(e.expectedArriveSec)}</span></span>
          ) : (
            <span>On time {pct(e.pOnTime)}</span>
          )}
        </div>
      </button>
      {selected && o.tight.length > 0 && (
        <div className="banner warn" style={{ display: 'grid', gap: 6 }}>
          <span>
            <strong>Later departures connect only on paper.</strong> Same onward trains, less margin:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button className="chip" aria-pressed={variantKey === o.rep.journey.key} onClick={() => onVariant(o.rep.journey.key)}
              style={variantKey === o.rep.journey.key ? { borderColor: 'var(--ink)', color: 'var(--ink)' } : undefined}>
              Leave {fmtClock(o.rep.journey.departSec)} · {pct(o.rep.pAllConnections)}
            </button>
            {o.tight.map((t) => (
              <button key={t.journey.key} className="chip" onClick={() => onVariant(t.journey.key)}
                style={variantKey === t.journey.key ? { borderColor: 'var(--ink)', color: 'var(--ink)' } : undefined}>
                Leave {fmtClock(t.journey.departSec)} · {pct(t.pAllConnections)}
              </button>
            ))}
          </div>
        </div>
      )}
      {selected && children}
    </article>
  );
}

export function PlanPage({
  settings, setSettings, onOpenStation, onOpenInsights,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onOpenStation: (f: StationFocus) => void;
  onOpenInsights: (f: InsightsFocus) => void;
}) {
  const [from, setFrom] = useState<Place>(byId('flushing'));
  const [to, setTo] = useState<Place>(byId('stony-brook'));
  const [mode, setMode] = useState<'depart' | 'arrive'>('depart');
  const [time, setTime] = useState(7 * 3600 + 45 * 60);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [transferIdx, setTransferIdx] = useState<number | null>(null);
  const [showConditions, setShowConditions] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const proxyUrl = import.meta.env.VITE_REALTIME_PROXY_URL as string | undefined;
  const [live, setLive] = useState(false);
  const [liveState, setLiveState] = useState<ProviderState>({ kind: 'not-configured' });
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    mtaProxyProvider(proxyUrl)
      .fetch()
      .then((snap) => !cancelled && setLiveState(snap ? { kind: 'ok', snapshot: snap } : { kind: 'not-configured' }))
      .catch((e: Error) => !cancelled && setLiveState({ kind: 'error', message: e.message }));
    return () => { cancelled = true; };
  }, [live, proxyUrl]);
  const ctx = useMemo(() => {
    const c = buildContext(settings);
    return live && liveState.kind === 'ok' ? { ...c, realtime: liveState.snapshot } : c;
  }, [settings, live, liveState]);
  const rt = realtimeStatus(ctx);
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    setStatus({ kind: 'loading' });
    const h = setTimeout(() => {
      try {
        if (from.id === to.id) throw new Error('Origin and destination are the same. Choose a different destination.');
        const result = plan(world, ctx, { from, to, mode, timeSec: time });
        if (id !== runId.current) return;
        setStatus({ kind: 'ready', result });
        const first = result.options[0];
        setSelected(first?.id ?? null);
        setVariant(first?.rep.journey.key ?? null);
        const risky = first ? worst(first.rep) : null;
        setTransferIdx(risky ? risky.index : null);
      } catch (err) {
        if (id === runId.current) setStatus({ kind: 'error', message: (err as Error).message });
      }
    }, 30);
    return () => clearTimeout(h);
  }, [from, to, mode, time, ctx]);

  const result = status.kind === 'ready' ? status.result : null;
  const option = result?.options.find((o) => o.id === selected) ?? null;
  const journey = option ? [option.rep, ...option.tight].find((e) => e.journey.key === variant) ?? option.rep : null;
  const transfer = journey && transferIdx !== null ? journey.transfers[transferIdx] ?? null : null;

  const selectOption = (o: RouteOption) => {
    if (selected === o.id) {
      setSelected(null);
      return;
    }
    setSelected(o.id);
    setVariant(o.rep.journey.key);
    const w = worst(o.rep);
    setTransferIdx(w ? w.index : null);
  };
  const set = (p: Partial<Settings>) => setSettings({ ...settings, ...p });

  return (
    <div className="plan">
      <section className="panel plan-side" aria-label="Journey planner">
        <div className="head">
          <div className="titlebar">
            <h1>Plan a trip</h1>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {rt.kind === 'fresh' && (rt.source === 'demo' ? <Prov>Demo feed</Prov> : <Prov kind="live">Live feed</Prov>)}
              {rt.kind === 'stale' && <Prov kind="stale">Feed stale</Prov>}
            </div>
          </div>
          <div className="odbox">
            <PlaceCombo id="from" label="From" value={from} onChange={setFrom} />
            <PlaceCombo id="to" label="To" value={to} onChange={setTo} dest />
            <button className="icon-btn swap" aria-label="Swap origin and destination" onClick={() => { setFrom(to); setTo(from); }}>{Icon.swap(16)}</button>
          </div>
          <div className="when">
            <Seg label="Time mode" light value={mode} onChange={setMode} options={[{ value: 'depart', label: 'Leave after' }, { value: 'arrive', label: 'Arrive by' }]} />
            <input id="time" className="input mono" type="time" aria-label="Time" value={hhmm(time)} onChange={(e) => { const v = parseHhmm(e.target.value); if (v !== null) setTime(v); }} />
            <button className="btn ghost" aria-expanded={showConditions} onClick={() => setShowConditions((v) => !v)}>
              Conditions <span style={{ display: 'inline-flex', transform: showConditions ? 'rotate(180deg)' : 'none' }}>{Icon.chevron(14)}</span>
            </button>
          </div>
          {showConditions && (
            <div className="conditions">
              <div className="row">
                <label className="check"><input id="acc" type="checkbox" checked={settings.accessible} onChange={(e) => set({ accessible: e.target.checked })} /> Step-free only</label>
                <label className="check"><input id="fam" type="checkbox" checked={settings.familiarity === 'first-time'} onChange={(e) => set({ familiarity: e.target.checked ? 'first-time' : 'regular' })} /> New to these stations</label>
              </div>
              <div className="row">
                <div className="field" style={{ flex: '1 1 160px' }}>
                  <label htmlFor="feed">Service data</label>
                  <select id="feed" className="input" value={settings.feed} onChange={(e) => set({ feed: e.target.value as RealtimeScenario })}>
                    {Object.entries(realtimeScenarios).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: '0 1 110px' }}>
                  <label htmlFor="now">Demo clock</label>
                  <input id="now" className="input mono" type="time" value={hhmm(settings.nowSec)} onChange={(e) => { const v = parseHhmm(e.target.value); if (v !== null) set({ nowSec: v }); }} />
                </div>
              </div>
              {proxyUrl ? (
                <label className="check"><input id="live" type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Use MTA real-time feed (via proxy)</label>
              ) : (
                <span className="small muted">{realtimeScenarios[settings.feed].description} Live MTA data: not configured (see VITE_REALTIME_PROXY_URL in the README).</span>
              )}
              {live && liveState.kind === 'error' && <div className="banner bad">{Icon.alert(16)}<span>Couldn’t load the real-time feed: {liveState.message}. Using the schedule and delay model instead.</span></div>}
              {live && liveState.kind === 'ok' && <span className="small muted">Live feed loaded. Trip updates only apply to trips in the loaded timetable; the demo timetable is synthetic, so expect alerts but few matching trips.</span>}
            </div>
          )}
          <EventStatus d={settings.detected} />
          {ctx.realtime?.alerts.map((a) => (
            <div key={a.id} className="banner warn">{Icon.alert(16)}<span><strong>{a.header}.</strong> {a.description}</span></div>
          ))}
          {rt.kind === 'stale' && (
            <div className="banner warn">{Icon.alert(16)}<span><strong>Real-time data is {Math.round(rt.ageSec / 60)} minutes old</strong> and is being ignored. Estimates use the schedule and the delay model.</span></div>
          )}
          {ctx.events.map((ev) => (
            <div key={ev.id} className="banner">{Icon.info(16)}<span><strong>Detected: {ev.label}.</strong> Expect heavier crowds at {crowdedStops(ev)} before the start and after the end; routes below account for it. <Prov>{ev.provenance === 'published' ? 'MLB schedule' : 'AI estimate'}</Prov></span></div>
          ))}
        </div>

        <NetworkMap
          world={world}
          journey={journey}
          selectedTransfer={transferIdx}
          onSelectTransfer={setTransferIdx}
          className={`mapwrap mobile-only${bigMap ? ' tall' : ''}`}
        >
          <button className="icon-btn" style={{ position: 'absolute', left: 12, bottom: 12 }} aria-label={bigMap ? 'Shrink map' : 'Expand map'} onClick={() => setBigMap((v) => !v)}>{Icon.expand(16)}</button>
        </NetworkMap>

        <div className="results" aria-live="polite">
          {status.kind === 'loading' && <Loading />}
          {status.kind === 'error' && (
            <div className="empty"><strong>Couldn’t plan this trip</strong><span>{status.message}</span></div>
          )}
          {result && result.options.length === 0 && (
            <div className="empty"><strong>No routes found</strong><span>{result.emptyReason}</span></div>
          )}
          {result && result.options.length > 0 && (
            <>
              <div className="summary-line">
                <span className="eyebrow">{result.options.length} routes · ranked by expected arrival</span>
                <span className="small muted">{result.stats.candidates} candidates checked</span>
              </div>
              {result.options.map((o, i) => (
                <RouteCard key={o.id} o={o} result={result} selected={selected === o.id}
                  variantKey={selected === o.id && variant ? variant : o.rep.journey.key}
                  onSelect={() => selectOption(o)} onVariant={(k) => { setVariant(k); const e = [o.rep, ...o.tight].find((x) => x.journey.key === k)!; const w = worst(e); setTransferIdx(w ? w.index : null); }}>
                  {i === 0 && result.why.length > 0 && (
                    <div className="why">
                      <span className="eyebrow">Why this route</span>
                      <ul>{result.why.map((w) => <li key={w}>{w}</li>)}</ul>
                    </div>
                  )}
                  {journey && <JourneyDetail world={world} journey={journey} onOpenStation={onOpenStation} onOpenInsights={onOpenInsights} />}
                  <details className="small">
                    <summary className="muted" style={{ cursor: 'pointer' }}>How this route was scored</summary>
                    <table className="data" style={{ marginTop: 6 }}>
                      <tbody>
                        {o.costBreakdown.map((c) => (
                          <tr key={c.label}><td style={{ paddingLeft: 0 }}>{c.label}</td><td className="mono" style={{ textAlign: 'right' }}>{c.min.toFixed(1)} min</td></tr>
                        ))}
                        <tr><td style={{ paddingLeft: 0 }}><strong>Planning cost (lower is better)</strong></td><td className="mono" style={{ textAlign: 'right' }}><strong>{o.costMin.toFixed(1)}</strong></td></tr>
                      </tbody>
                    </table>
                    <p className="muted" style={{ marginTop: 6 }}>Arrival range (10th–90th percentile of {o.rep.arrivalSamples.length} simulated trips): {fmtClock(o.rep.arrival.p10)} – {fmtClock(o.rep.arrival.p90)}.</p>
                  </details>
                </RouteCard>
              ))}
              <p className="small muted" style={{ padding: '4px 8px' }}>
                Probabilities come from a seeded simulation of train delays and walking times through illustrative station models. They are model estimates on synthetic data, not measurements. Fares are not shown.
              </p>
            </>
          )}
        </div>
      </section>

      <NetworkMap world={world} journey={journey} selectedTransfer={transferIdx} onSelectTransfer={setTransferIdx} bottomInset={transfer ? 190 : 0} className="desktop-only">
        {transfer && journey && (
          <div className="mapcard">
            <div className="head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16 }}>Transfer at {transfer.model.stationName}</strong>
                <RiskPill a={transfer.conn.assessment} />
                <Prov>Model estimate</Prov>
              </div>
              <div className="row-actions">
                {transfer.model.graph && transfer.model.inBinding && transfer.model.outBinding && (
                  <button className="btn" onClick={() => onOpenStation({ stationId: transfer.model.graph!.id, fromKey: `${transfer.model.inBinding!.stopId}|${transfer.model.inBinding!.routeId}|${transfer.model.inBinding!.directionId}|${transfer.model.inBinding!.service ?? ''}`, toKey: `${transfer.model.outBinding!.stopId}|${transfer.model.outBinding!.routeId}|${transfer.model.outBinding!.directionId}|${transfer.model.outBinding!.service ?? ''}`, timeSec: journey.journey.rides[transfer.index].arr })}>
                    Station layout
                  </button>
                )}
                {flowFor(transfer, world, journey) && (
                  <button className="btn" onClick={() => onOpenInsights({ fromStop: transfer.model.fromStop, toStop: transfer.model.toStop, inTripId: journey.journey.rides[transfer.index].tripId })}>Network view</button>
                )}
              </div>
            </div>
            <div className="grid">
              <div className="fact"><span className="k">Arrive</span><span className="v mono">{fmtClock(journey.journey.rides[transfer.index].arr)}</span><span className="small muted">{world.tt.routes[journey.journey.rides[transfer.index].routeId].shortName === 'LIRR' ? 'LIRR' : world.tt.routes[journey.journey.rides[transfer.index].routeId].shortName} train</span></div>
              <div className="fact"><span className="k">Departs</span><span className="v mono">{fmtClock(journey.journey.rides[transfer.index + 1].dep)}</span><span className="small muted">window {fmtMin(transfer.conn.windowSec)}</span></div>
              <div className="fact"><span className="k">Estimated walk</span><span className="v">{transfer.model.feasible ? fmtRange(transfer.conn.physical.p10, transfer.conn.physical.p90) : '—'}</span><span className="small muted">10th–90th pct.</span></div>
              <div className="fact"><span className="k">Chance to make it</span><span className="v">{pct(transfer.conn.pSuccess)}</span><span className="small muted">{transfer.connBestCar && transfer.carHint ? `${pct(transfer.connBestCar.pSuccess)} in best car` : assessP(transfer.conn.pSuccess) === 'reliable' ? 'comfortable' : 'tight'}</span></div>
              <div className="fact"><span className="k">If missed</span><span className="v mono">{transfer.arrivalIfMissedSec !== null ? fmtClock(transfer.arrivalIfMissedSec) : '—'}</span><span className="small muted">{transfer.arrivalIfMissedSec !== null ? lateBy(transfer.arrivalIfMissedSec - journey.journey.arriveSec) : 'no later service'}</span></div>
            </div>
          </div>
        )}
      </NetworkMap>
    </div>
  );
}
