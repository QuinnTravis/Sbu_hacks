import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { STATION_COUNT, STATION_NAMES } from '../store/gameConfig';
import { Button } from './ui/Button';

interface StationBannerProps {
  stationIndex: number;
  answered: number;
  correct: number;
  onDepart(): void;
}

/** Brass station nameboard shown while the train stands at a station. */
export function StationBanner({ stationIndex, answered, correct, onDepart }: StationBannerProps) {
  const final = stationIndex === STATION_COUNT - 1;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-labelledby="station-name"
      className="mx-auto w-full max-w-2xl rounded-lg border-4 border-brass-500 bg-gradient-to-b from-[#2a231d] to-iron-900 p-1 shadow-xl"
    >
      <div className="rounded-md border border-brass-300/40 px-5 py-4 text-center md:px-8">
        <p className="small-caps-label text-brass-300">
          Station {stationIndex + 1} of {STATION_COUNT}
        </p>
        <h2 id="station-name" className="font-display text-3xl text-cream-100 md:text-4xl">
          {STATION_NAMES[stationIndex]}
        </h2>
        <p className="mt-2 text-cream-100">
          {answered} of {answered} answered · Leg accuracy <strong className="text-brass-300">{accuracy}%</strong> ({correct} correct)
        </p>
        <div className="mt-4 flex justify-center">
          {final ? (
            <p className="inline-flex items-center gap-2 font-semibold text-brass-300" role="status">
              <Flag className="h-5 w-5" aria-hidden="true" /> End of the line. Printing your Station Report…
            </p>
          ) : (
            <Button autoFocus size="lg" onClick={onDepart}>
              Depart
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
