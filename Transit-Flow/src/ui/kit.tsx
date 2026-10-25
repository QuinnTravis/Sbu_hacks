import type { ReactNode } from 'react';
import type { Assessment } from '../engine/transfer';
import type { Route } from '../engine/types';
import { histogram } from '../engine/random';

export { fmtClock, fmtMin, fmtRange } from '../engine/planner';

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export function hhmm(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function parseHhmm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

export function RouteChip({ route, lg }: { route: Route; lg?: boolean }) {
  const label = route.mode === 'rail' ? `LIRR` : route.shortName;
  return (
    <span className={`route${lg ? ' lg' : ''}`} title={`${route.agency} · ${route.longName}`}>
      <i style={{ background: route.color }} />
      <span>{label}</span>
    </span>
  );
}

const RISK: Record<Assessment, { label: string; tone: string }> = {
  reliable: { label: 'Reliable', tone: 'ok' },
  'some-risk': { label: 'Some risk', tone: 'warn' },
  'high-risk': { label: 'High risk', tone: 'bad' },
  unlikely: { label: 'Unlikely', tone: 'bad' },
  impossible: { label: 'Not possible', tone: 'bad' },
};
export const riskTone = (a: Assessment) => RISK[a].tone;
export const riskColor = (a: Assessment) =>
  ({ ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' })[RISK[a].tone] ?? 'var(--muted)';

export function RiskPill({ a, children }: { a: Assessment; children?: ReactNode }) {
  return <span className={`pill ${RISK[a].tone}`}>{children ?? RISK[a].label}</span>;
}

export function assessP(p: number): Assessment {
  if (p >= 0.9) return 'reliable';
  if (p >= 0.7) return 'some-risk';
  if (p >= 0.4) return 'high-risk';
  return 'unlikely';
}

export function Prov({ kind, children }: { kind?: 'live' | 'stale'; children: ReactNode }) {
  return <span className={`prov${kind ? ` ${kind}` : ''}`}>{children}</span>;
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  light,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  light?: boolean;
  label: string;
}) {
  return (
    <div className={`seg${light ? ' light' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Distribution of "time needed" against "time available". The share of the
 * distribution right of the window line is the share of riders who miss.
 */
export function NeedVsWindow({ needSec, windowSec, height = 70 }: { needSec: number[]; windowSec: number; height?: number }) {
  if (!needSec.length) return null;
  const sorted = [...needSec].sort((a, b) => a - b);
  const lo = 0;
  const hiRaw = Math.max(windowSec * 1.6, sorted[Math.floor(sorted.length * 0.98)]);
  const hi = Math.ceil(hiRaw / 60) * 60;
  const bins = 36;
  const h = histogram(needSec, lo, hi, bins);
  const max = Math.max(...h);
  const W = 320;
  const H = height;
  const pad = 16;
  const x = (s: number) => ((s - lo) / (hi - lo)) * W;
  const ticks: number[] = [];
  const step = hi > 1500 ? 300 : hi > 720 ? 120 : 60;
  for (let t = 0; t <= hi; t += step) ticks.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H + pad}`} width="100%" height={H + pad} role="img" aria-label="Distribution of time needed compared with the transfer window">
      {h.map((c, i) => {
        const x0 = (i / bins) * W;
        const mid = lo + ((i + 0.5) / bins) * (hi - lo);
        const bh = max ? (c / max) * (H - 6) : 0;
        return (
          <rect key={i} x={x0 + 0.5} y={H - bh} width={W / bins - 1} height={bh} rx={1.5}
            fill={mid > windowSec ? 'var(--bad)' : 'var(--ink-2)'} opacity={mid > windowSec ? 0.85 : 0.35} />
        );
      })}
      <line x1={0} x2={W} y1={H} y2={H} stroke="var(--line-strong)" />
      <line x1={x(windowSec)} x2={x(windowSec)} y1={0} y2={H} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" />
      <text x={Math.min(x(windowSec) + 4, W - 70)} y={10} fontSize={10} fill="var(--ink)" fontWeight={600}>window {Math.round(windowSec / 60)} min</text>
      {ticks.map((t) => (
        <text key={t} x={Math.min(Math.max(x(t), 6), W - 6)} y={H + 12} fontSize={9.5} textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-mono)">
          {t / 60}m
        </text>
      ))}
    </svg>
  );
}

// ---------- Icons (1.6px stroke, 20px grid) ----------
const I = ({ d, size = 20 }: { d: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
export const Icon = {
  plan: (s?: number) => <I size={s} d={<><circle cx="5" cy="5" r="2" /><path d="M5 7v3a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3" /><rect x="13" y="15" width="4" height="3" rx="1" /></>} />,
  station: (s?: number) => <I size={s} d={<><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 8h14M3 13h14M8 8v5M12 13v4" /></>} />,
  insights: (s?: number) => <I size={s} d={<><path d="M3 17h14" /><path d="M5 14V9M9 14V5M13 14v-3M17 14V7" /></>} />,
  swap: (s?: number) => <I size={s} d={<><path d="M7 3v14M7 17l-3-3M7 17l3-3M13 17V3M13 3l-3 3M13 3l3 3" /></>} />,
  alert: (s?: number) => <I size={s} d={<><path d="M10 3 2.5 16h15L10 3Z" /><path d="M10 8v3.5M10 14v.01" /></>} />,
  info: (s?: number) => <I size={s} d={<><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.5v.01" /></>} />,
  plus: (s?: number) => <I size={s} d={<path d="M10 4v12M4 10h12" />} />,
  minus: (s?: number) => <I size={s} d={<path d="M4 10h12" />} />,
  fit: (s?: number) => <I size={s} d={<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />} />,
  chevron: (s?: number) => <I size={s} d={<path d="m6 8 4 4 4-4" />} />,
  walk: (s?: number) => <I size={s} d={<><circle cx="11" cy="3.5" r="1.5" /><path d="m8 18 2-5 3 2v3M10 13l-1-4 3-2 2 3 2 1M9 9l-3 2" /></>} />,
  arrow: (s?: number) => <I size={s} d={<path d="M4 10h12M12 6l4 4-4 4" />} />,
  expand: (s?: number) => <I size={s} d={<path d="M4 8V4h4M16 12v4h-4M4 4l5 5M16 16l-5-5" />} />,
  logo: (s?: number) => (
    <I size={s} d={<><circle cx="10" cy="10" r="7.5" /><path d="M5.5 10h3l2-3.5 2 7 1.5-3.5h0.5" /></>} />
  ),
};

export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'grid', gap: 8 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 92 : 74 }} />
      ))}
    </div>
  );
}
