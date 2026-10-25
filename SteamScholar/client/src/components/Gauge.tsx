import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface GaugeProps {
  value: number;
  /** Visible caption under the readout, e.g. "PSI" or "MPH". */
  unit: string;
  /** Full text equivalent, e.g. "Boiler pressure 62 percent". */
  ariaLabel: string;
  /** Show low / ok / high zones on the dial. */
  zones?: boolean;
  /** Spring needle with overshoot and settle (pressure); off for fast-updating dials. */
  springy?: boolean;
  /** Changes on each correct answer to flash the rim amber. */
  pulseKey?: number;
  className?: string;
}

const CX = 60;
const CY = 60;
const SWEEP = 270;
const START = -135;

const angleFor = (v: number) => START + (Math.min(100, Math.max(0, v)) / 100) * SWEEP;

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function arc(r: number, from: number, to: number) {
  const a = polar(r, angleFor(from));
  const b = polar(r, angleFor(to));
  const large = ((to - from) / 100) * SWEEP > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

// Zones from spec 6.3 (low / ok / high), matching the adaptive-difficulty bands. No red, ever.
const ZONES = [
  { from: 0, to: 35, color: 'var(--copper-500)' },
  { from: 35, to: 70, color: 'var(--brass-500)' },
  { from: 70, to: 100, color: 'var(--amber-500)' },
];

/** Analog brass dial, 0-100. */
export function Gauge({ value, unit, ariaLabel, zones = false, springy = false, pulseKey, className = '' }: GaugeProps) {
  const [glowing, setGlowing] = useState(false);
  const firstPulse = useRef(pulseKey);

  useEffect(() => {
    if (pulseKey === undefined || pulseKey === firstPulse.current) return;
    setGlowing(true);
    const t = setTimeout(() => setGlowing(false), 700);
    return () => clearTimeout(t);
  }, [pulseKey]);

  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel} className={className}>
      {/* Brass rim (flashes amber on a correct answer) */}
      <circle
        cx={CX}
        cy={CY}
        r={56}
        fill="var(--iron-900)"
        stroke={glowing ? 'var(--amber-500)' : 'var(--brass-500)'}
        strokeWidth={5}
        style={{
          transition: 'stroke 200ms, filter 200ms',
          filter: glowing ? 'drop-shadow(0 0 6px var(--amber-500))' : 'none',
        }}
      />
      <circle cx={CX} cy={CY} r={51} fill="none" stroke="var(--iron-700)" strokeWidth={1} />

      {zones &&
        ZONES.map((z) => <path key={z.from} d={arc(44, z.from, z.to)} stroke={z.color} strokeWidth={5} fill="none" opacity={0.9} />)}

      {ticks.map((t) => {
        const major = t % 50 === 0;
        const a = polar(major ? 35 : 38, angleFor(t));
        const b = polar(41, angleFor(t));
        return (
          <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--cream-300)" strokeWidth={major ? 2 : 1} strokeLinecap="round" />
        );
      })}
      {[0, 50, 100].map((t) => {
        const p = polar(27, angleFor(t));
        return (
          <text key={t} x={p.x} y={p.y + 3} textAnchor="middle" fontSize={8} fill="var(--brass-300)" fontFamily="Inter, sans-serif">
            {t}
          </text>
        );
      })}

      <motion.g
        initial={false}
        animate={{ rotate: angleFor(value) }}
        transition={springy ? { type: 'spring', stiffness: 140, damping: 9, mass: 0.8 } : { type: 'tween', duration: 0.15 }}
        style={{ originX: '50%', originY: '50%' }}
      >
        {/* Invisible disc keeps the group's box centred on the pivot. */}
        <circle cx={CX} cy={CY} r={56} fill="transparent" />
        <path d={`M ${CX - 2.5} ${CY + 8} L ${CX} ${CY - 44} L ${CX + 2.5} ${CY + 8} Z`} fill="var(--amber-500)" />
      </motion.g>
      <circle cx={CX} cy={CY} r={5} fill="var(--brass-300)" stroke="var(--iron-950)" strokeWidth={1.5} />

      <text x={CX} y={CY + 28} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--cream-100)" fontFamily="Inter, sans-serif">
        {Math.round(value)}
      </text>
      <text x={CX} y={CY + 38} textAnchor="middle" fontSize={7} fill="var(--brass-300)" letterSpacing={1.2} fontFamily="Inter, sans-serif">
        {unit}
      </text>
    </svg>
  );
}
