import { AnimatePresence, motion } from 'framer-motion';
import { Flame, TrainFront } from 'lucide-react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio/audioManager';
import { narrateCurrent, listenForReply } from '../audio/eyesFree';
import { stopListening, useVoiceStore, voiceSupported } from '../audio/voiceInput';
import { DebugPanel } from '../components/DebugPanel';
import { Gauge } from '../components/Gauge';
import { MaintenancePanel } from '../components/MaintenancePanel';
import { ProgressTrack } from '../components/ProgressTrack';
import { QuestionCard } from '../components/QuestionCard';
import { CornerControls } from '../components/SettingsDrawer';
import { StationBanner } from '../components/StationBanner';
import { VoiceControl } from '../components/VoiceControl';
import { Card } from '../components/ui/Card';
import { isFromInteractive } from '../lib/a11y';
import { DEBUG_MODE, QUESTIONS_PER_STATION, STATION_NAMES } from '../store/gameConfig';
import { useGameStore } from '../store/gameStore';

/** Map a key press to an option id for the current question (1-4, or T/F and 1/2 for true/false). */
function optionForKey(key: string): string | null {
  const q = useGameStore.getState().current;
  if (!q) return null;
  const k = key.toLowerCase();
  if (q.type === 'tf') {
    if (k === 't' || k === '1') return q.options.find((o) => o.id === 'true')?.id ?? q.options[0].id;
    if (k === 'f' || k === '2') return q.options.find((o) => o.id === 'false')?.id ?? q.options[1].id;
    return null;
  }
  const n = Number(k);
  return Number.isInteger(n) && n >= 1 && n <= q.options.length ? q.options[n - 1].id : null;
}

function usePlayKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      if (s.settingsOpen || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      // Typing a free-response answer must not trigger shortcuts.
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      const key = e.key.toLowerCase();
      if (key === 'v' && voiceSupported) {
        e.preventDefault();
        if (useVoiceStore.getState().listening) stopListening();
        else listenForReply();
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        narrateCurrent();
        return;
      }
      if (s.phase === 'playing' && s.current && !s.feedback) {
        const optionId = optionForKey(e.key);
        if (optionId) {
          e.preventDefault();
          audio.click();
          s.answer(optionId);
        }
        return;
      }
      // Enter/Space on a focused button already clicks it; only handle it when focus is elsewhere.
      if ((e.key === 'Enter' || e.key === ' ') && !isFromInteractive(e)) {
        if (s.phase === 'maintenance') {
          e.preventDefault();
          s.dismissMaintenance();
        } else if (s.phase === 'station') {
          e.preventDefault();
          s.departStation();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function Play() {
  const s = useGameStore(
    useShallow((st) => ({
      phase: st.phase,
      current: st.current,
      currentIsRequeue: st.currentIsRequeue,
      currentIsReview: st.currentIsReview,
      feedback: st.feedback,
      grading: st.grading,
      submitFreeResponse: st.submitFreeResponse,
      pressure: st.pressure,
      streak: st.streak,
      correctPulse: st.correctPulse,
      actualSpeed: st.actualSpeed,
      stationIndex: st.stationIndex,
      questionsThisStation: st.questionsThisStation,
      stopAtNextStation: st.stopAtNextStation,
      answered: st.answered,
      answer: st.answer,
      dismissMaintenance: st.dismissMaintenance,
      departStation: st.departStation,
    })),
  );
  usePlayKeyboard();

  const leg = s.answered.filter((a) => a.stationIndex === s.stationIndex);
  const legCorrect = leg.filter((a) => a.correct).length;
  const pressure = Math.round(s.pressure);

  let content: JSX.Element | null = null;
  if (s.phase === 'station') {
    content = (
      <StationBanner key="station" stationIndex={s.stationIndex} answered={leg.length} correct={legCorrect} onDepart={s.departStation} />
    );
  } else if (s.phase === 'maintenance' && s.current) {
    content = <MaintenancePanel key="maintenance" question={s.current} feedback={s.feedback} onDismiss={s.dismissMaintenance} />;
  } else if (s.current) {
    content = (
      <QuestionCard
        key={`q-${s.current.id}-${s.currentIsRequeue}`}
        question={s.current}
        feedback={s.feedback}
        isRequeue={s.currentIsRequeue}
        isReview={s.currentIsReview}
        grading={s.grading}
        onAnswer={s.answer}
        onSubmitFree={s.submitFreeResponse}
      />
    );
  } else if (s.stopAtNextStation) {
    content = (
      <motion.div key="approach" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="flex items-center gap-4 p-5 md:p-6" role="status">
          <TrainFront className="h-10 w-10 shrink-0 text-copper-500" aria-hidden="true" />
          <div>
            <p className="small-caps-label text-ink-900/80">Leg complete · {legCorrect} of {leg.length} correct</p>
            <p className="text-xl font-semibold text-ink-900">Approaching {STATION_NAMES[s.stationIndex]}…</p>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="relative flex h-dvh flex-col">
      {/* Top: overlays on the 3D scene (the scene itself is rendered behind by App). */}
      <section aria-label="Train status" className="pointer-events-none relative h-[35%] shrink-0 md:h-[55%]">
        <div className="pointer-events-auto absolute left-2 top-2 flex items-center gap-2 md:left-4 md:top-4 md:flex-col md:items-start">
          <Gauge
            value={pressure}
            unit="PRESSURE"
            zones
            springy
            pulseKey={s.correctPulse}
            ariaLabel={`Boiler pressure ${pressure} percent`}
            className="w-16 drop-shadow-lg md:w-32"
          />
          <AnimatePresence>
            {s.streak >= 2 && (
              <motion.p
                key="streak"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500 bg-iron-950/85 px-3 py-1 text-sm font-bold text-amber-500"
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                Streak ×{s.streak}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute inset-x-2 bottom-1 rounded-md border border-iron-700 bg-iron-950/85 px-2 py-1 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-4 md:w-80 md:-translate-x-1/2">
          <ProgressTrack
            stationIndex={s.stationIndex}
            questionsThisStation={s.questionsThisStation}
            perStation={QUESTIONS_PER_STATION}
            atStation={s.phase === 'station'}
          />
        </div>

        <div className="pointer-events-auto absolute right-2 top-2 flex items-center gap-2 md:right-4 md:top-4 md:flex-col md:items-end">
          <Gauge
            value={s.actualSpeed}
            unit="MPH"
            ariaLabel={`Speed ${Math.round(s.actualSpeed)} miles per hour`}
            className="order-first w-14 drop-shadow-lg md:order-last md:w-24"
          />
          <CornerControls />
        </div>

        {DEBUG_MODE && <DebugPanel />}
      </section>

      {/* Bottom: iron panel with the learning content. */}
      <section
        aria-label="Question"
        className="relative min-h-0 flex-1 overflow-y-auto border-t-2 border-brass-500 bg-iron-900 px-3 py-3 shadow-[inset_0_8px_16px_rgb(0_0_0/0.4)] md:px-8 md:py-5"
      >
        <div className="mx-auto max-w-3xl">
          <VoiceControl />
          <AnimatePresence mode="wait">{content}</AnimatePresence>
        </div>
      </section>
    </div>
  );
}
