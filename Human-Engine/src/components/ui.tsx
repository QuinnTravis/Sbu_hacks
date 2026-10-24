import { Check, X } from 'lucide-react';
import { useStore } from '../state/store';
import { MOOD_LABELS, STRESS_LABELS } from '../lib/metrics';

/**
 * A calibrated rule: ten divisions with a notch at the target.
 * The filled line is the reading; nothing else is coloured.
 */
export function Scale({ value, label, active = false, ink = false }: { value: number; label: string; active?: boolean; ink?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const base = ink ? 'rgba(38,36,31,0.35)' : 'rgba(228,217,196,0.25)';
  const fill = active ? 'var(--brass)' : ink ? 'var(--ink)' : 'var(--parchment)';
  return (
    <div className="scale" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="9" x2="100" y2="9" stroke={base} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={i * 10} x2={i * 10} y1={i % 5 === 0 ? 4 : 6} y2="9" stroke={base} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" y1="9" x2={pct} y2="9" stroke={fill} strokeWidth="3" vectorEffect="non-scaling-stroke" style={{ transition: 'all .6s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
    </div>
  );
}

/** Line-drawn gear mark for the masthead. Static. */
export function Emblem({ className }: { className?: string }) {
  const teeth = Array.from({ length: 10 }, (_, i) => i * 36);
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      {teeth.map((a) => (
        <path key={a} d="M13.6 2.2h2.8l.5 3h-3.8z" transform={`rotate(${a} 15 15)`} fill="currentColor" stroke="none" />
      ))}
      <circle cx="15" cy="15" r="10" />
      <circle cx="15" cy="15" r="3.2" />
      <path d="M15 5v6.8M15 18.2V25M5 15h6.8M18.2 15H25" strokeWidth="1" />
    </svg>
  );
}

export function DialGlyph({ frac }: { frac: number }) {
  const a = ((-120 + 240 * frac) * Math.PI) / 180;
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <path d="M5.5 18.5 A9 9 0 1 1 20.5 18.5" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
      <line x1={13} y1={14} x2={13 + 7.5 * Math.sin(a)} y2={14 - 7.5 * Math.cos(a)} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={13} cy={14} r={1.8} fill="currentColor" />
    </svg>
  );
}

export function ScalePicker({ kind, value, onChange, name, id }: { kind: 'mood' | 'stress'; value: number | null; onChange: (v: number) => void; name: string; id?: string }) {
  const labels = kind === 'mood' ? MOOD_LABELS : STRESS_LABELS;
  return (
    <div className="seg" role="radiogroup" aria-label={name} id={id}>
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
          <DialGlyph frac={i / 4} />
          {l}
        </button>
      ))}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} role="status">
          <div>
            <b>{t.title}</b>
            {t.body && <span> · {t.body}</span>}
          </div>
          <button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Tick({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" className="tick-box" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange}>
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
