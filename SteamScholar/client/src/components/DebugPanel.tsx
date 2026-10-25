import { useGameStore } from '../store/gameStore';

/** `?debug=1` only: force correct / wrong answers to watch the train respond. */
export function DebugPanel() {
  const current = useGameStore((s) => s.current);
  const answer = useGameStore((s) => s.answer);
  const targetSpeed = useGameStore((s) => s.targetSpeed);
  const actualSpeed = useGameStore((s) => s.actualSpeed);
  const stop = useGameStore((s) => s.stopAtNextStation);
  const phase = useGameStore((s) => s.phase);
  if (!current && phase !== 'station') return null;
  const wrong = current?.options.find((o) => o.id !== current.correctOptionId);
  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 md:bottom-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded bg-iron-950/90 px-3 py-2 text-xs text-cream-100">
      <span>
        {phase} · target {targetSpeed.toFixed(0)} · actual {actualSpeed.toFixed(0)}
        {stop ? ' · stopping' : ''}
      </span>
      {current && (
        <>
          <button className="rounded bg-verdigris-500 px-2 py-1 text-iron-950" onClick={() => answer(current.correctOptionId)}>
            Correct
          </button>
          <button className="rounded bg-copper-500 px-2 py-1 text-iron-950" onClick={() => wrong && answer(wrong.id)}>
            Wrong
          </button>
        </>
      )}
    </div>
  );
}
