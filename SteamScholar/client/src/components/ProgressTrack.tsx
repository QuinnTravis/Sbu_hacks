import { motion } from 'framer-motion';
import { STATION_COUNT, STATION_NAMES } from '../store/gameConfig';

interface ProgressTrackProps {
  stationIndex: number;
  questionsThisStation: number;
  perStation: number;
  /** The train is standing at stationIndex. */
  atStation: boolean;
  className?: string;
}

const W = 320;
const H = 40;
const X0 = 14;
const X1 = W - 14;
const Y = 18;
const stationX = (i: number) => X0 + ((i + 1) / STATION_COUNT) * (X1 - X0);

/** Rail line with 3 station dots and a small train sliding by question progress. */
export function ProgressTrack({ stationIndex, questionsThisStation, perStation, atStation, className = '' }: ProgressTrackProps) {
  const legProgress = atStation ? 1 : Math.min(questionsThisStation, perStation) / perStation;
  const progress = (stationIndex + legProgress) / STATION_COUNT;
  const trainX = X0 + progress * (X1 - X0);
  const name = STATION_NAMES[stationIndex];
  const label = atStation
    ? `Stopped at station ${stationIndex + 1} of ${STATION_COUNT}, ${name}`
    : `Heading to station ${stationIndex + 1} of ${STATION_COUNT}, ${name}. ${Math.min(questionsThisStation, perStation)} of ${perStation} questions answered.`;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
        {/* Sleepers and rail */}
        {Array.from({ length: 30 }, (_, i) => {
          const x = X0 + (i / 29) * (X1 - X0);
          return <line key={i} x1={x} y1={Y - 4} x2={x} y2={Y + 4} stroke="var(--iron-700)" strokeWidth={2} />;
        })}
        <line x1={X0} y1={Y} x2={X1} y2={Y} stroke="var(--brass-500)" strokeWidth={2} />
        <line x1={X0} y1={Y} x2={trainX} y2={Y} stroke="var(--amber-500)" strokeWidth={3} />
        <circle cx={X0} cy={Y} r={3.5} fill="var(--brass-500)" />

        {STATION_NAMES.map((n, i) => {
          const done = i < stationIndex || (i === stationIndex && atStation);
          const current = i === stationIndex && !atStation;
          return (
            <g key={n}>
              {current && <circle className="station-pulse" cx={stationX(i)} cy={Y} r={9} fill="var(--brass-300)" opacity={0.35} />}
              <circle
                cx={stationX(i)}
                cy={Y}
                r={6.5}
                fill={done ? 'var(--amber-500)' : 'var(--iron-900)'}
                stroke={done ? 'var(--amber-500)' : current ? 'var(--brass-300)' : 'var(--brass-500)'}
                strokeWidth={2}
              />
              {done && (
                <path
                  d={`M ${stationX(i) - 3} ${Y} l 2 2.2 l 4 -4.4`}
                  stroke="var(--ink-900)"
                  strokeWidth={1.8}
                  fill="none"
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}

        {/* Little locomotive */}
        <motion.g initial={false} animate={{ x: trainX - X0 }} transition={{ type: 'spring', stiffness: 80, damping: 16 }}>
          <g transform={`translate(${X0 - 8} ${Y - 15})`}>
            <rect x={2} y={4} width={11} height={6} rx={1} fill="var(--cream-100)" />
            <rect x={10} y={1} width={5} height={9} rx={1} fill="var(--cream-100)" />
            <rect x={3} y={1} width={2.5} height={4} fill="var(--cream-100)" />
            <circle cx={5} cy={11} r={2} fill="var(--brass-300)" />
            <circle cx={12} cy={11} r={2} fill="var(--brass-300)" />
          </g>
        </motion.g>
      </svg>
      <p className="mt-0.5 text-center text-xs font-medium text-cream-100" aria-hidden="true">
        {atStation ? 'At ' : 'Next: '}
        <span className="text-brass-300">{name}</span>
        {!atStation && (
          <span className="text-cream-300">
            {' '}
            · {Math.min(questionsThisStation, perStation)}/{perStation}
          </span>
        )}
      </p>
    </div>
  );
}
