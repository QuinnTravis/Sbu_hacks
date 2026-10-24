import { useEffect, useRef, useState } from 'react';
import { Wind, X } from 'lucide-react';

const INHALE = 4;
const EXHALE = 6;
const CYCLE = INHALE + EXHALE;
const TOTAL = 60;

export default function BreathingModal({ onClose, onComplete, reducedMotion }: { onClose: () => void; onComplete: () => void; reducedMotion: boolean }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    firstBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now() - elapsed * 1000;
    const t = window.setInterval(() => {
      const e = (performance.now() - startRef.current) / 1000;
      if (e >= TOTAL) {
        window.clearInterval(t);
        setElapsed(TOTAL);
        setRunning(false);
        onComplete();
        return;
      }
      setElapsed(e);
    }, 100);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const inCycle = elapsed % CYCLE;
  const inhaling = inCycle < INHALE;
  const phase = !running && elapsed === 0 ? 'Ready when you are' : elapsed >= TOTAL ? 'Pressure released' : inhaling ? 'Breathe in…' : 'And slowly out…';
  const scale = !running && elapsed === 0 ? 0.6 : inhaling ? 1 : 0.55;
  const left = Math.max(0, Math.ceil(TOTAL - elapsed));

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal plate rivets" role="dialog" aria-modal="true" aria-labelledby="breath-title" ref={dialogRef}>
        <div className="plate-head">
          <div>
            <div className="eyebrow">Release valve</div>
            <h2 id="breath-title">One-minute breathing break</h2>
          </div>
          <button className="btn ghost sm icon" onClick={onClose} aria-label="Close" ref={firstBtn}>
            <X />
          </button>
        </div>
        <p className="muted small">In for {INHALE}, out for {EXHALE}. Follow the ring, or just breathe at your own pace. There’s no wrong way to do this.</p>
        <div className="breath-stage">
          <svg className="breath-ring" viewBox="0 0 210 210" aria-hidden="true">
            <circle cx={105} cy={105} r={98} fill="none" stroke="rgba(201,154,75,0.25)" strokeWidth={2} />
            <circle
              cx={105}
              cy={105}
              r={98}
              fill="none"
              stroke="#e8a33d"
              strokeWidth={3}
              strokeDasharray={`${(elapsed / TOTAL) * 615.75} 615.75`}
              transform="rotate(-90 105 105)"
              strokeLinecap="round"
            />
            <g className="orb" style={{ transform: `scale(${reducedMotion ? 0.8 : scale})`, transitionDuration: reducedMotion ? '0s' : inhaling ? `${INHALE}s` : `${EXHALE}s` }}>
              <circle cx={105} cy={105} r={78} fill="rgba(232,163,61,0.12)" />
              <circle cx={105} cy={105} r={60} fill="rgba(232,163,61,0.18)" />
              <circle cx={105} cy={105} r={42} fill="rgba(255,210,122,0.35)" />
            </g>
            <text x={105} y={112} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={20} fill="#efe3c8">
              {left}s
            </text>
          </svg>
          <div className="breath-phase" aria-live="polite">
            {phase}
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {elapsed < TOTAL && (
            <button className="btn primary" onClick={() => setRunning((r) => !r)}>
              <Wind />
              {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Begin'}
            </button>
          )}
          <span className="spacer" />
          {elapsed < TOTAL ? (
            <button className="btn ghost" onClick={() => onComplete()}>
              I took my break
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
