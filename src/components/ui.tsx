import { Award, Check, Droplets, Flame, Footprints, Gauge, Info, Lock, Moon, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { IndicatorId } from '../types';
import { useStore, type Toast } from '../state/store';
import { MOOD_LABELS, STRESS_LABELS } from '../lib/metrics';

export const INDICATOR_ICONS: Record<IndicatorId, typeof Moon> = {
  rest: Moon,
  cooling: Droplets,
  motion: Footprints,
  fuel: Flame,
  equilibrium: Gauge,
};

export function Bar({ value, ind, label, className = '' }: { value: number; ind?: IndicatorId; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`bar ${className}`} data-ind={ind} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small engraved emblem used in the masthead. */
export function Emblem({ className }: { className?: string }) {
  const teeth = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="em-b" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe7a8" />
          <stop offset="0.6" stopColor="#c99a4b" />
          <stop offset="1" stopColor="#5d4219" />
        </radialGradient>
      </defs>
      <g className="rot">
        {teeth.map((a) => (
          <rect key={a} x={20} y={1.5} width={4} height={6} rx={1} fill="url(#em-b)" transform={`rotate(${a} 22 22)`} />
        ))}
        <circle cx={22} cy={22} r={15.5} fill="url(#em-b)" />
        <circle cx={22} cy={22} r={11.5} fill="#16100c" />
      </g>
      <path d="M22 13.5 C18 18 16.5 20.5 16.5 23.5 a5.5 5.5 0 0 0 11 0 C27.5 20.5 26 18 22 13.5Z" fill="#e8a33d" />
      <circle cx={22} cy={24} r={2.4} fill="#ffe3a0" />
    </svg>
  );
}

/** A tiny dial glyph used instead of emoji for mood/stress choices. */
export function DialGlyph({ frac, color = 'currentColor' }: { frac: number; color?: string }) {
  const a = ((-120 + 240 * frac) * Math.PI) / 180;
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <path d="M5.5 18.5 A9 9 0 1 1 20.5 18.5" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
      <line x1={13} y1={14} x2={13 + 7.5 * Math.sin(a)} y2={14 - 7.5 * Math.cos(a)} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={13} cy={14} r={2} fill={color} />
    </svg>
  );
}

export function ScalePicker({ kind, value, onChange, name }: { kind: 'mood' | 'stress'; value: number | null; onChange: (v: number) => void; name: string }) {
  const labels = kind === 'mood' ? MOOD_LABELS : STRESS_LABELS;
  const colors = kind === 'mood' ? ['#8a7f9e', '#9a8fb8', '#c9a24e', '#b5c96a', '#f0c46a'] : ['#8fc7a8', '#a7c770', '#e0b24a', '#e0874a', '#d0664a'];
  return (
    <div className="scale" role="radiogroup" aria-label={name}>
      {labels.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          onClick={() => onChange(i + 1)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(Math.min(5, (value ?? 0) + 1));
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(Math.max(1, (value ?? 2) - 1));
            }
          }}
          tabIndex={value === i + 1 || (value === null && i === 0) ? 0 : -1}
        >
          <DialGlyph frac={i / 4} color={colors[i]} />
          {l}
        </button>
      ))}
    </div>
  );
}

const TOAST_ICONS: Record<Toast['kind'], typeof Moon> = {
  xp: Sparkles,
  achievement: Award,
  level: Award,
  unlock: Lock,
  info: Info,
  warn: TriangleAlert,
};

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const I = TOAST_ICONS[t.kind];
        return (
          <div key={t.id} className="toast" data-kind={t.kind} role="status">
            <div className="ti">
              <I />
            </div>
            <div>
              <b>{t.title}</b>
              {t.body && <span>{t.body}</span>}
            </div>
            <button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" className="toggle-box" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange}>
      {checked && <Check strokeWidth={3} />}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={checked} onClick={onChange}>
      <span className="track" />
      {label}
    </button>
  );
}
