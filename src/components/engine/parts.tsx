import type { ReactNode, Ref } from 'react';
import type { GAUGE_STYLES } from '../../data/catalog';

/** Gear outline path centred on 0,0. */
export function gearPath(teeth: number, ro: number, ri: number, holeR = 0): string {
  const step = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [
      [ri, a - step * 0.5],
      [ri, a - step * 0.27],
      [ro, a - step * 0.16],
      [ro, a + step * 0.16],
      [ri, a + step * 0.27],
    ];
    for (const [r, t] of p) pts.push(`${(r * Math.cos(t)).toFixed(2)},${(r * Math.sin(t)).toFixed(2)}`);
  }
  let d = `M${pts[0]} L${pts.slice(1).join(' L')} Z`;
  if (holeR > 0) d += ` M${holeR},0 A${holeR},${holeR} 0 1,0 ${-holeR},0 A${holeR},${holeR} 0 1,0 ${holeR},0 Z`;
  return d;
}

export function Rivets({ x1, x2, y, gap = 18, r = 2.4, fill }: { x1: number; x2: number; y: number; gap?: number; r?: number; fill: string }) {
  const n = Math.max(1, Math.floor((x2 - x1) / gap));
  const out: ReactNode[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    out.push(<circle key={i} cx={x} cy={y} r={r} fill={fill} className="rivet" />);
  }
  return <g>{out}</g>;
}

/** Round pressure dial. frac 0..1 maps to −130°…+130°. */
export function Dial({
  cx,
  cy,
  r,
  frac,
  style,
  bezel,
  zones,
  label,
  needleRef,
  idPrefix,
  dim,
}: {
  cx: number;
  cy: number;
  r: number;
  frac: number;
  style: (typeof GAUGE_STYLES)[string];
  bezel: string;
  zones?: { from: number; to: number; color: string }[];
  label?: string;
  needleRef?: Ref<SVGGElement>;
  idPrefix: string;
  dim?: boolean;
}) {
  const ticks: ReactNode[] = [];
  const nTicks = r > 35 ? 26 : 10;
  for (let i = 0; i <= nTicks; i++) {
    const a = ((-130 + (260 * i) / nTicks) * Math.PI) / 180;
    const major = i % (r > 35 ? 5 : 5) === 0;
    const r1 = r * 0.86;
    const r2 = r * (major ? 0.68 : 0.76);
    ticks.push(
      <line
        key={i}
        x1={cx + r1 * Math.sin(a)}
        y1={cy - r1 * Math.cos(a)}
        x2={cx + r2 * Math.sin(a)}
        y2={cy - r2 * Math.cos(a)}
        stroke={style.tick}
        strokeWidth={major ? 1.6 : 0.8}
      />,
    );
  }
  const arc = (from: number, to: number, rr: number) => {
    const a1 = ((-130 + 260 * from) * Math.PI) / 180;
    const a2 = ((-130 + 260 * to) * Math.PI) / 180;
    const large = (to - from) * 260 > 180 ? 1 : 0;
    return `M${cx + rr * Math.sin(a1)},${cy - rr * Math.cos(a1)} A${rr},${rr} 0 ${large},1 ${cx + rr * Math.sin(a2)},${cy - rr * Math.cos(a2)}`;
  };
  const angle = -130 + 260 * Math.max(0, Math.min(1, frac));
  return (
    <g opacity={dim ? 0.55 : 1}>
      <circle cx={cx} cy={cy + 2} r={r + 7} fill="rgba(0,0,0,0.45)" />
      <circle cx={cx} cy={cy} r={r + 6} fill={`url(#${idPrefix}-bezel)`} stroke={bezel} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r} fill={style.face} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${idPrefix}-faceShade)`} />
      {zones?.map((z, i) => <path key={i} d={arc(z.from, z.to, r * 0.81)} stroke={z.color} strokeWidth={r * 0.1} fill="none" opacity={0.85} />)}
      {ticks}
      {label && (
        <text x={cx} y={cy + r * 0.42} textAnchor="middle" className="dial-label" fill={style.ink} fontSize={Math.max(6, r * 0.17)}>
          {label}
        </text>
      )}
      <g ref={needleRef} transform={`rotate(${angle} ${cx} ${cy})`} className="needle">
        <path d={`M${cx - r * 0.05},${cy + r * 0.16} L${cx},${cy - r * 0.8} L${cx + r * 0.05},${cy + r * 0.16} Z`} fill={style.needle} />
      </g>
      <circle cx={cx} cy={cy} r={r * 0.1} fill={bezel} stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
      <ellipse cx={cx - r * 0.25} cy={cy - r * 0.4} rx={r * 0.55} ry={r * 0.3} fill={style.glass} transform={`rotate(-25 ${cx} ${cy})`} />
    </g>
  );
}
