import { useEffect, useMemo, useState } from 'react';
import { stationGraphs } from '../data/stations';
import { outagesFrom } from '../engine/network';
import { crowdAt } from '../engine/crowd';
import { findPath, instructions, positionHint, sampleTraversal, sampleWalkerFactor, edgeCostSec, edgeUsable, type StationPath } from '../engine/station';
import { mulberry32, summarize } from '../engine/random';
import { bindingKey, buildContext, type Settings, type StationFocus } from '../app/settings';
import { sampleEvent } from '../data/models';
import type { StationEdge, StationGraph } from '../engine/types';
import { Icon, Prov, Seg, fmtRange, fmtMin, hhmm } from '../ui/kit';

const ORDER = ['woodside', 'jackson-heights', 'jamaica', 'flushing', 'huntington'];

const EDGE_STYLE: Record<StationEdge['kind'], { dash?: string; width: number }> = {
  walk: { width: 2 },
  street: { width: 2, dash: '1 0' },
  crosswalk: { width: 2, dash: '6 4' },
  stairs: { width: 2, dash: '2 3' },
  escalator: { width: 2.5, dash: '8 3' },
  elevator: { width: 4 },
  fare: { width: 2 },
};

type Crowd = 'normal' | 'event';

function Diagram({
  g, path, alt, accessible, outages, crowd, fromNodes, toNodes,
}: {
  g: StationGraph; path: StationPath | null; alt: StationPath | null; accessible: boolean; outages: Set<string>; crowd: number; fromNodes: string[]; toNodes: string[];
}) {
  const onPath = new Set(path?.steps.map((s) => s.edge.id));
  const onAlt = new Set(alt?.steps.map((s) => s.edge.id));
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const LEFT = 150;
  const sx = (x: number) => LEFT + x * 0.86;
  // Alternate labels above/below along each row so neighbours don't collide.
  const below = new Set<string>();
  const rows = new Map<number, typeof g.nodes>();
  for (const n of g.nodes) {
    const k = Math.round(n.y / 6);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k)!.push(n);
  }
  for (const r of rows.values()) r.sort((a, b) => a.x - b.x).forEach((n, i) => i % 2 === 1 && below.add(n.id));
  const groupFirst = new Set<string>();
  const seenGroup = new Set<string>();
  for (const n of [...g.nodes].sort((a, b) => a.x - b.x)) {
    const grp = n.label.split(' · ')[0];
    if (n.position && !seenGroup.has(grp)) { seenGroup.add(grp); groupFirst.add(n.id); }
  }
  const labelLines = (n: (typeof g.nodes)[number]) => {
    if (n.position) {
      const [grp, pos] = n.label.split(' · ');
      return groupFirst.has(n.id) ? [grp, pos ?? ''] : [pos ?? ''];
    }
    const i = n.label.indexOf(' (');
    if (i > 0) return [n.label.slice(0, i), n.label.slice(i + 1)];
    const j = n.label.indexOf(' · ');
    if (j > 0) return [n.label.slice(0, j), n.label.slice(j + 3)];
    return [n.label];
  };
  const bottleneck = (e: StationEdge) => crowd > 1.05 && ((e.queueSec ?? 0) * (crowd - 1) > 15 || e.crowdSensitivity * (crowd - 1) > 0.6);
  const levelBands = [...g.levels].sort((a, b) => a.y - b.y);
  return (
    <svg viewBox={`0 0 ${LEFT + g.width * 0.86 + 90} ${g.height}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label={`${g.name} station schematic`}>
      {levelBands.map((l, i) => {
        const top = i === 0 ? 0 : (levelBands[i - 1].y + l.y) / 2;
        const bottom = i === levelBands.length - 1 ? g.height : (l.y + levelBands[i + 1].y) / 2;
        return (
          <g key={l.level}>
            <rect x={0} y={top} width={LEFT + g.width * 0.86 + 90} height={bottom - top} fill={i % 2 ? 'var(--surface-2)' : 'var(--surface)'} />
            <line x1={0} x2={LEFT + g.width * 0.86 + 90} y1={bottom} y2={bottom} stroke="var(--line)" />
            <text x={14} y={top + 20} className="dlevel">{l.level > 0 ? `+${l.level}` : l.level}</text>
            <foreignObject x={14} y={top + 26} width={LEFT - 24} height={Math.max(30, bottom - top - 30)}>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>{l.label}</div>
            </foreignObject>
          </g>
        );
      })}
      {g.edges.map((e) => {
        const a = nodes.get(e.from)!;
        const b = nodes.get(e.to)!;
        const usable = edgeUsable(e, { accessible, outages });
        const out = outages.has(e.id);
        const main = onPath.has(e.id);
        const second = !main && onAlt.has(e.id);
        const hot = bottleneck(e);
        const st = EDGE_STYLE[e.kind];
        const color = main ? 'var(--accent)' : second ? 'var(--ink-2)' : hot ? 'var(--warn)' : 'var(--line-strong)';
        const mx = (sx(a.x) + sx(b.x)) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={e.id} opacity={usable ? 1 : 0.35}>
            {hot && <line x1={sx(a.x)} y1={a.y} x2={sx(b.x)} y2={b.y} stroke="var(--warn)" strokeOpacity={0.25} strokeWidth={12} strokeLinecap="round" />}
            <line x1={sx(a.x)} y1={a.y} x2={sx(b.x)} y2={b.y} stroke={color} strokeWidth={main ? st.width + 3 : second ? st.width + 1 : st.width}
              strokeDasharray={main ? undefined : st.dash} strokeLinecap="round" />
            {e.kind === 'elevator' && <line x1={sx(a.x)} y1={a.y} x2={sx(b.x)} y2={b.y} stroke="var(--surface)" strokeWidth={1.2} />}
            {e.kind === 'fare' && <rect x={mx - 5} y={my - 7} width={10} height={14} rx={2} fill="var(--surface)" stroke={color} strokeWidth={1.5} />}
            {e.oneWay && <circle cx={mx} cy={my} r={3} fill={color} />}
            {(out || (!usable && accessible)) && (
              <g stroke="var(--bad)" strokeWidth={2.2} strokeLinecap="round">
                <line x1={mx - 6} y1={my - 6} x2={mx + 6} y2={my + 6} />
                <line x1={mx + 6} y1={my - 6} x2={mx - 6} y2={my + 6} />
              </g>
            )}
          </g>
        );
      })}
      {g.nodes.map((n) => {
        const isFrom = fromNodes.includes(n.id);
        const isTo = toNodes.includes(n.id);
        const used = path?.nodes.includes(n.id);
        const r = n.kind === 'platform' ? 6 : 5;
        return (
          <g key={n.id}>
            <circle cx={sx(n.x)} cy={n.y} r={isFrom || isTo ? r + 2 : r}
              fill={isTo ? 'var(--ink)' : isFrom ? 'var(--surface)' : used ? 'var(--accent)' : 'var(--surface)'}
              stroke={isFrom || isTo ? 'var(--ink)' : used ? 'var(--accent)' : 'var(--muted)'} strokeWidth={isFrom ? 3 : 1.5} />
            {(() => {
              const lines = labelLines(n);
              const dn = below.has(n.id);
              const y0 = dn ? n.y + 18 : n.y - 10 - (lines.length - 1) * 12;
              return (
                <text x={sx(n.x)} y={y0} textAnchor="middle" className="dlabel" fontWeight={isFrom || isTo || used ? 600 : 400}>
                  {lines.map((l, i) => <tspan key={i} x={sx(n.x)} dy={i === 0 ? 0 : 12} fill={i > 0 ? 'var(--muted)' : undefined}>{l}</tspan>)}
                </text>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

export function StationsPage({ settings, setSettings, focus }: { settings: Settings; setSettings: (s: Settings) => void; focus: StationFocus | null }) {
  const [stationId, setStationId] = useState(focus?.stationId ?? 'woodside');
  const g = stationGraphs[stationId];
  const keys = g.bindings.map((b) => bindingKey(b));
  const defaults: Record<string, [number, number]> = { woodside: [0, 2], 'jackson-heights': [0, 2], jamaica: [0, 2], flushing: [0, 2], huntington: [0, 1] };
  const [fromKey, setFromKey] = useState(focus?.fromKey ?? keys[defaults[stationId][0]]);
  const [toKey, setToKey] = useState(focus?.toKey ?? keys[defaults[stationId][1]]);
  const [crowdMode, setCrowdMode] = useState<Crowd>(settings.event !== 'none' ? 'event' : 'normal');
  const [useBestCar, setUseBestCar] = useState(true);

  useEffect(() => {
    if (!focus) return;
    setStationId(focus.stationId);
    if (focus.fromKey) setFromKey(focus.fromKey);
    if (focus.toKey) setToKey(focus.toKey);
  }, [focus]);

  const pickStation = (id: string) => {
    setStationId(id);
    const ks = stationGraphs[id].bindings.map((b) => bindingKey(b));
    setFromKey(ks[defaults[id][0]]);
    setToKey(ks[defaults[id][1]]);
  };

  const ctx = useMemo(() => buildContext(settings), [settings]);
  const outages = useMemo(() => outagesFrom(ctx), [ctx]);
  const fromB = g.bindings.find((b) => bindingKey(b) === fromKey) ?? g.bindings[0];
  const toB = g.bindings.find((b) => bindingKey(b) === toKey) ?? g.bindings[1];
  // Event crowding is evaluated 15 min after the sample event ends (peak egress).
  const evts = crowdMode === 'event' ? sampleEvent(settings.event === 'evening' ? 'evening' : 'afternoon') : [];
  const crowd = crowdMode === 'event' ? crowdAt(stationId, evts[0].endSec + 900, evts) : 1;

  const analysis = useMemo(() => {
    const opts = { accessible: settings.accessible, outages, crowd };
    const perSource = fromB.nodes
      .map((n) => ({ node: n, path: findPath(g, [n], toB.nodes, opts) }))
      .filter((x): x is { node: string; path: StationPath } => x.path !== null);
    if (!perSource.length || fromB === toB) return null;
    const best = perSource.reduce((a, b) => (b.path.expectedSec < a.path.expectedSec ? b : a));
    const path = useBestCar ? best.path : perSource[Math.floor(perSource.length / 2)].path;
    // Alternative: a step-free route if the main one uses stairs, otherwise the best path avoiding the main path's vertical edges.
    let alt: StationPath | null = null;
    if (!path.stepFree && !settings.accessible) alt = findPath(g, [useBestCar ? best.node : perSource[Math.floor(perSource.length / 2)].node], toB.nodes, { ...opts, accessible: true });
    else {
      const pen = new Map(path.steps.filter((s) => s.edge.kind !== 'walk').map((s) => [s.edge.id, 600]));
      const a = findPath(g, [best.node], toB.nodes, { ...opts, penalties: pen });
      if (a && a.steps.map((s) => s.edge.id).join() !== path.steps.map((s) => s.edge.id).join()) alt = a;
    }
    const rng = mulberry32(42);
    const samples: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const src = useBestCar ? best.path : perSource[Math.floor(rng() * perSource.length)].path;
      samples.push(sampleTraversal(src, rng, crowd, sampleWalkerFactor(rng, settings.familiarity), settings.familiarity));
    }
    return { path, alt, best, perSource, summary: summarize(samples), samples };
  }, [g, fromB, toB, settings.accessible, settings.familiarity, outages, crowd, useBestCar]);

  const hint = analysis ? positionHint(g, analysis.best.node) : null;
  const steps = analysis ? instructions(g, analysis.path) : [];
  const hotEdges = g.edges
    .filter(() => crowd > 1.05)
    .map((e) => ({ e, extra: edgeCostSec(e, crowd) - e.medianSec }))
    .filter((x) => x.extra > 12)
    .sort((a, b) => b.extra - a.extra)
    .slice(0, 3);

  return (
    <div className="stations">
      <section className="panel side" aria-label="Station explorer controls">
        <div className="titlebar">
          <h1 style={{ fontSize: 22 }}>Stations</h1>
          <Prov>{g.verification === 'verified' ? 'Verified layout' : 'Illustrative layout'}</Prov>
        </div>
        <div className="station-pick" role="group" aria-label="Station">
          {ORDER.map((id) => (
            <button key={id} aria-pressed={id === stationId} onClick={() => pickStation(id)}>{stationGraphs[id].name}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="from-b">From</label>
          <select id="from-b" className="input" value={bindingKey(fromB)} onChange={(e) => setFromKey(e.target.value)}>
            {g.bindings.map((b) => <option key={bindingKey(b)} value={bindingKey(b)}>{b.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to-b">To</label>
          <select id="to-b" className="input" value={bindingKey(toB)} onChange={(e) => setToKey(e.target.value)}>
            {g.bindings.map((b) => <option key={bindingKey(b)} value={bindingKey(b)}>{b.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <Seg label="Crowding" light value={crowdMode} onChange={setCrowdMode} options={[{ value: 'normal', label: 'Normal' }, { value: 'event', label: 'After a game' }]} />
          <label className="check"><input id="s-acc" type="checkbox" checked={settings.accessible} onChange={(e) => setSettings({ ...settings, accessible: e.target.checked })} /> Step-free only</label>
          <label className="check"><input id="s-fam" type="checkbox" checked={settings.familiarity === 'first-time'} onChange={(e) => setSettings({ ...settings, familiarity: e.target.checked ? 'first-time' : 'regular' })} /> First time at this station</label>
          <label className="check"><input id="s-car" type="checkbox" checked={useBestCar} onChange={(e) => setUseBestCar(e.target.checked)} /> Ride in the recommended car</label>
        </div>
        {crowdMode === 'event' && (
          <div className="banner">{Icon.info(16)}<span>Sample event crowding, 15 minutes after a game ends at {hhmm(evts[0].endSec)}: crowd factor {crowd.toFixed(2)}× at this station. <Prov>Synthetic</Prov></span></div>
        )}
        {ctx.realtime?.alerts.filter((a) => a.stationId === stationId).map((a) => (
          <div key={a.id} className="banner warn">{Icon.alert(16)}<span><strong>{a.header}.</strong> {a.description}</span></div>
        ))}
        <div className="divider" />
        {!analysis && (
          <div className="empty">
            <strong>{fromB === toB ? 'Choose two different platforms' : 'No path available'}</strong>
            <span>{fromB === toB ? 'Pick where you arrive and where you need to go.' : settings.accessible ? 'There is no step-free path between these platforms with the current elevator status.' : 'These platforms are not connected in the station model.'}</span>
          </div>
        )}
        {analysis && (
          <>
            <div style={{ display: 'grid', gap: 4 }}>
              <span className="eyebrow">Estimated walk</span>
              <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{fmtRange(analysis.summary.p10, analysis.summary.p90)}</span>
              <span className="small muted">Median {fmtMin(analysis.summary.p50)} · 10th–90th percentile of 3,000 simulated riders · {analysis.path.stepFree ? 'step-free' : 'uses stairs or escalators'}</span>
            </div>
            {hint && <div className="banner">{Icon.info(16)}<span><strong>{hint}.</strong> {analysis.perSource.length > 1 ? `From the worst position the walk takes about ${fmtMin(Math.max(...analysis.perSource.map((p) => p.path.expectedSec)))}.` : ''}</span></div>}
            <ol className="steps">
              {steps.map((s, i) => <li key={i}><span>{s.text}</span><span className="sec">~{Math.round(s.sec / 10) * 10}s</span></li>)}
            </ol>
            {hotEdges.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                <span className="eyebrow">Crowd bottlenecks</span>
                {hotEdges.map(({ e, extra }) => (
                  <div key={e.id} className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{e.label ?? e.kind}</span><span className="mono" style={{ color: 'var(--warn)' }}>+{Math.round(extra)}s</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <p className="small muted">{g.sourceNote}</p>
      </section>

      <section className="panel diagram" aria-label="Station schematic">
        <div className="section-head">
          <h2>{g.name} · schematic by level</h2>
          <div className="legend-list">
            <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--accent)" strokeWidth="4" /></svg>Recommended path</span>
            <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--ink-2)" strokeWidth="3" strokeDasharray="2 3" /></svg>Alternative</span>
            <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray="2 3" /></svg>Stairs</span>
            <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--line-strong)" strokeWidth="2.5" strokeDasharray="8 3" /></svg>Escalator</span>
            <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--line-strong)" strokeWidth="4" /><line x1="0" y1="4" x2="22" y2="4" stroke="var(--surface)" strokeWidth="1.2" /></svg>Elevator</span>
            <span><svg width="12" height="14"><rect x="1" y="1" width="10" height="12" rx="2" fill="none" stroke="var(--muted)" strokeWidth="1.5" /></svg>Fare control</span>
            <span><svg width="22" height="12"><line x1="0" y1="6" x2="22" y2="6" stroke="var(--warn)" strokeOpacity=".3" strokeWidth="10" /></svg>Crowd bottleneck</span>
            <span><svg width="12" height="12" stroke="var(--bad)" strokeWidth="2"><line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" /></svg>Unavailable</span>
          </div>
        </div>
        <div className="dscroll" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Diagram g={g} path={analysis?.path ?? null} alt={analysis?.alt ?? null} accessible={settings.accessible} outages={outages} crowd={crowd}
            fromNodes={analysis ? [analysis.path.nodes[0]] : fromB.nodes} toNodes={toB.nodes} />
        </div>
      </section>
    </div>
  );
}
