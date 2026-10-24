import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import type { World } from '../engine/network';
import type { JourneyEval } from '../engine/evaluate';
import { Icon, Prov, riskColor } from '../ui/kit';

const LAT0 = 40.8;
const K = Math.cos((LAT0 * Math.PI) / 180);
export const project = (lat: number, lon: number): [number, number] => [(lon + 74.05) * K * 1000, (41.0 - lat) * 1000];

type VB = [number, number, number, number];

const AREAS: { label: string; lat: number; lon: number }[] = [
  { label: 'MANHATTAN', lat: 40.776, lon: -73.972 },
  { label: 'QUEENS', lat: 40.727, lon: -73.865 },
  { label: 'NASSAU', lat: 40.735, lon: -73.59 },
  { label: 'SUFFOLK', lat: 40.83, lon: -73.24 },
  { label: 'LONG ISLAND SOUND', lat: 40.955, lon: -73.45 },
];

function bbox(points: [number, number][], padFrac: number, aspect: number): VB {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  let w = Math.max(x1 - x0, 8);
  let h = Math.max(y1 - y0, 8);
  w *= 1 + padFrac * 2;
  h *= 1 + padFrac * 2;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, w, h];
}

export function NetworkMap({
  world,
  journey,
  selectedTransfer,
  onSelectTransfer,
  bottomInset = 0,
  className = '',
  children,
}: {
  world: World;
  journey: JourneyEval | null;
  selectedTransfer: number | null;
  onSelectTransfer: (i: number) => void;
  bottomInset?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const { tt } = world;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [vb, setVb] = useState<VB | null>(null);
  const drag = useRef<{ x: number; y: number; vb: VB } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width || 800, h: e.contentRect.height || 600 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pos = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const s of Object.values(tt.stops)) m.set(s.id, project(s.lat, s.lon));
    return m;
  }, [tt]);

  const segments = useMemo(() => {
    const out: { routeId: string; pts: [number, number][] }[] = [];
    const seen = new Set<string>();
    for (const p of tt.patterns) {
      for (let i = 1; i < p.stops.length; i++) {
        const a = p.stops[i - 1];
        const b = p.stops[i];
        const k = [p.routeId, ...[a, b].sort()].join('|');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ routeId: p.routeId, pts: [pos.get(a)!, pos.get(b)!] });
      }
    }
    return out;
  }, [tt, pos]);

  const usableH = Math.max(120, size.h - bottomInset);
  const fit = () => {
    const pts: [number, number][] = journey
      ? journey.journey.rides.flatMap((r) => tt.trips[r.tripId].stopTimes.slice(r.fromIdx, r.toIdx + 1).map((s) => pos.get(s.stopId)!))
      : [...pos.values()];
    const b = bbox(pts, 0.12, size.w / usableH);
    // Extend the box downward so the bottom card does not cover the route.
    const scale = b[3] / usableH;
    setVb([b[0], b[1], b[2], b[3] + bottomInset * scale]);
  };
  useEffect(fit, [journey?.journey.key, size.w, size.h, bottomInset]); // eslint-disable-line react-hooks/exhaustive-deps

  const view: VB = vb ?? [0, 0, 700, 300];
  const px = view[2] / size.w; // world units per screen pixel

  const zoom = (f: number, cx = view[0] + view[2] / 2, cy = view[1] + view[3] / 2) => {
    const w = Math.min(Math.max(view[2] * f, 8), 1400);
    const h = (w * view[3]) / view[2];
    setVb([cx - ((cx - view[0]) / view[2]) * w, cy - ((cy - view[1]) / view[3]) * h, w, h]);
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const cx = view[0] + ((e.clientX - r.left) / r.width) * view[2];
    const cy = view[1] + ((e.clientY - r.top) / r.height) * view[3];
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy);
  };
  const onDown = (e: RPE) => {
    if ((e.target as Element).closest('[data-hit]')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vb: view };
  };
  const onMove = (e: RPE) => {
    const d = drag.current;
    if (!d) return;
    const s = d.vb[2] / size.w;
    setVb([d.vb[0] - (e.clientX - d.x) * s, d.vb[1] - (e.clientY - d.y) * s, d.vb[2], d.vb[3]]);
  };
  const onUp = () => (drag.current = null);

  const rides = journey?.journey.rides ?? [];
  const journeyStops = new Set<string>();
  rides.forEach((r) => { journeyStops.add(r.fromStop); journeyStops.add(r.toStop); });
  const detailed = view[2] < 90;
  const fs = 11.5 * px;

  return (
    <div className={`canvas ${className}`} ref={wrap}>
      <svg
        viewBox={view.join(' ')}
        preserveAspectRatio="xMidYMid slice"
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label="Schematic network map with the selected journey"
      >
        <defs>
          <pattern id="grid" width={10} height={10} patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="var(--map-grid)" strokeWidth={px} />
          </pattern>
        </defs>
        <rect x={-500} y={-500} width={2500} height={1500} fill="var(--map-land)" />
        <rect x={-500} y={-500} width={2500} height={1500} fill="url(#grid)" />
        {AREAS.map((a) => {
          const [x, y] = project(a.lat, a.lon);
          return (
            <text key={a.label} x={x} y={y} className="map-area" fontSize={fs * 1.05} textAnchor="middle">
              {a.label}
            </text>
          );
        })}
        {segments.map((s, i) => (
          <line key={i} x1={s.pts[0][0]} y1={s.pts[0][1]} x2={s.pts[1][0]} y2={s.pts[1][1]}
            stroke={tt.routes[s.routeId].color} strokeOpacity={journey ? 0.28 : 0.7} strokeWidth={2.5}
            vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        ))}
        {Object.values(tt.stops).map((s) => {
          const [x, y] = pos.get(s.id)!;
          if (journeyStops.has(s.id)) return null;
          return <circle key={s.id} cx={x} cy={y} r={2.6 * px} fill="var(--surface)" stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
        })}
        {rides.map((r) => {
          const trip = tt.trips[r.tripId];
          const pts = trip.stopTimes.slice(r.fromIdx, r.toIdx + 1).map((s) => pos.get(s.stopId)!.join(','));
          return (
            <g key={r.tripId}>
              <polyline points={pts.join(' ')} fill="none" stroke="var(--surface)" strokeWidth={9} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={pts.join(' ')} fill="none" stroke={tt.routes[r.routeId].color} strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              {trip.stopTimes.slice(r.fromIdx + 1, r.toIdx).map((s) => {
                const [x, y] = pos.get(s.stopId)!;
                return <circle key={s.stopId} cx={x} cy={y} r={2.2 * px} fill="var(--surface)" />;
              })}
            </g>
          );
        })}
        {rides.slice(1).map((r, i) => {
          const a = pos.get(rides[i].toStop)!;
          const b = pos.get(r.fromStop)!;
          return <line key={`w${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--ink)" strokeWidth={2} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />;
        })}
        {journey && rides.length > 0 && (() => {
          const o = pos.get(rides[0].fromStop)!;
          const d = pos.get(rides[rides.length - 1].toStop)!;
          return (
            <g>
              <circle cx={o[0]} cy={o[1]} r={6 * px} fill="var(--surface)" stroke="var(--ink)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
              <rect x={d[0] - 6 * px} y={d[1] - 6 * px} width={12 * px} height={12 * px} rx={2 * px} fill="var(--ink)" />
            </g>
          );
        })()}
        {journey?.transfers.map((t) => {
          const at = pos.get(rides[t.index].toStop)!;
          const sel = selectedTransfer === t.index;
          return (
            <g key={t.index} data-hit onClick={() => onSelectTransfer(t.index)} style={{ cursor: 'pointer' }}>
              <circle cx={at[0]} cy={at[1]} r={(sel ? 13 : 10) * px} fill={riskColor(t.conn.assessment)} fillOpacity={0.18} />
              <circle cx={at[0]} cy={at[1]} r={6 * px} fill="var(--surface)" stroke={riskColor(t.conn.assessment)} strokeWidth={sel ? 4 : 3} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {Object.values(tt.stops).map((s) => {
          const show = journeyStops.has(s.id) || (detailed && !s.id.startsWith('Q44-')) || ['L-PENN', 'L-JAM', 'L-HUN', 'L-SBK', 'L-PJ', '7-FLU'].includes(s.id);
          if (!show) return null;
          // Skip duplicate labels for co-located stops in the same complex.
          if (!journeyStops.has(s.id) && (s.id === 'E-JH' || s.id === 'L-WDS' || s.id === 'L-FLU' || s.id === 'E-SUT')) return null;
          const [x, y] = pos.get(s.id)!;
          const strong = journeyStops.has(s.id);
          const below = s.id === 'L-WDS' || s.id === 'E-SUT' || s.id === 'L-FLU' || s.id === 'Q44-ARCHER';
          return (
            <text key={`l${s.id}`} x={x + 8 * px} y={y + (below ? 15 : -7) * px} fontSize={fs * (strong ? 1.05 : 0.95)}
              className="map-label" strokeWidth={3.5 * px} fontWeight={strong ? 600 : 500}>
              {s.shortName ?? s.name}
            </text>
          );
        })}
      </svg>
      <div className="tl">
        <Prov>Schematic · positions approximate</Prov>
      </div>
      <div className="tools">
        <button className="icon-btn" aria-label="Zoom in" onClick={() => zoom(1 / 1.4)}>{Icon.plus(18)}</button>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => zoom(1.4)}>{Icon.minus(18)}</button>
        <button className="icon-btn" aria-label="Fit route" onClick={fit}>{Icon.fit(18)}</button>
      </div>
      {children}
    </div>
  );
}
