import { MotionConfig } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { initAudio } from './audio/audioManager';
import { LiveRegion } from './components/LiveRegion';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Toaster } from './components/ui/Toast';
import TrainScene from './scene/TrainScene';
import Depot from './screens/Depot';
import Loading from './screens/Loading';
import Play from './screens/Play';
import Report from './screens/Report';
import { useGameStore, type Phase } from './store/gameStore';

const IN_RUN: ReadonlySet<Phase> = new Set(['playing', 'maintenance', 'station']);

/** Route `/`: Depot, Loading, or the gameplay HUD depending on phase. */
function Home() {
  const phase = useGameStore((s) => s.phase);
  const resetToDepot = useGameStore((s) => s.resetToDepot);
  // Back from /report lands here with the run over: start fresh at the Depot.
  useEffect(() => {
    if (phase === 'report') resetToDepot();
  }, [phase, resetToDepot]);
  if (phase === 'loading') return <Loading />;
  if (IN_RUN.has(phase)) return <Play />;
  return <Depot />;
}

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => initAudio(), []);

  // Finishing a run opens the report route (only on the transition, so Back still works).
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === 'report' && prevPhase.current !== 'report') navigate('/report');
    prevPhase.current = phase;
  }, [phase, navigate]);

  const hud = location.pathname === '/' && IN_RUN.has(phase);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      <div data-reduce-motion={reduceMotion} className="relative h-dvh overflow-hidden bg-iron-950">
        {/* One persistent scene: full-bleed and dimmed behind menus, top of the HUD during a run. */}
        <div className={`no-print ${hud ? 'absolute inset-x-0 top-0 h-[35%] md:h-[55%]' : 'fixed inset-0'}`}>
          <TrainScene />
          {!hud && <div className="absolute inset-0 bg-iron-950/70" />}
        </div>
        <div className="relative h-full">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/report" element={<Report />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </div>
        <SettingsDrawer />
        <Toaster />
        <LiveRegion />
      </div>
    </MotionConfig>
  );
}
