import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Gauge } from '../components/Gauge';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { toast } from '../components/ui/Toast';
import { ApiError, DEPOT_ERRORS, ERROR_COPY, fetchSampleDeck, generateDeck, type ErrorCode } from '../lib/api';
import type { Deck } from '../lib/types';
import { GENERATION_TIMEOUT_MS, SAMPLE_MIN_LOADING_MS } from '../store/gameConfig';
import { useGameStore } from '../store/gameStore';

const STATUS_LINES = ['Shoveling coal...', 'Reading your notes...', 'Writing your exam questions...', 'Checking the track...'];
const STATUS_INTERVAL_MS = 2_000;
/** Fake progress: ease out toward 90% and hold there until the API returns. */
const PROGRESS_HOLD = 90;
const PROGRESS_EASE = 0.035;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Loading() {
  const source = useGameStore((s) => s.pendingSource);
  const startRun = useGameStore((s) => s.startRun);
  const failToDepot = useGameStore((s) => s.failToDepot);
  const requestDeck = useGameStore((s) => s.requestDeck);
  const resetToDepot = useGameStore((s) => s.resetToDepot);

  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The request. Deferred one tick so React StrictMode's mount/unmount/mount in dev doesn't
  // send (and spend free-tier quota on) a duplicate generation request.
  useEffect(() => {
    if (!source) {
      resetToDepot();
      return;
    }
    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;

    const run = async () => {
      const startedAt = performance.now();
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, GENERATION_TIMEOUT_MS);
      try {
        let deck: Deck;
        if (source.kind === 'sample') {
          const result = await fetchSampleDeck(controller.signal);
          if (result.bundled) toast("Couldn't reach the depot server, so we're using the built-in sample deck.");
          deck = result.deck;
          await sleep(Math.max(0, SAMPLE_MIN_LOADING_MS - (performance.now() - startedAt)));
        } else {
          deck = await generateDeck(source, controller.signal);
        }
        clearTimeout(timeout);
        if (cancelled) return;
        setProgress(100);
        await sleep(300);
        if (!cancelled) startRun(deck);
      } catch (err) {
        clearTimeout(timeout);
        if (cancelled) return;
        if (timedOut) return setError('generation_failed');
        if (err instanceof ApiError) {
          if (DEPOT_ERRORS.has(err.code)) return failToDepot(err.message);
          return setError(err.code);
        }
        setError('network');
      }
    };

    const startTimer = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      controller.abort();
    };
  }, [source, attempt, startRun, failToDepot, resetToDepot]);

  // Fake progress and rotating status text while waiting.
  useEffect(() => {
    if (error) return;
    const p = setInterval(() => setProgress((v) => (v >= PROGRESS_HOLD ? v : v + (PROGRESS_HOLD - v) * PROGRESS_EASE)), 100);
    const t = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_LINES.length), STATUS_INTERVAL_MS);
    return () => {
      clearInterval(p);
      clearInterval(t);
    };
  }, [error, attempt, source]);

  const retry = () => {
    setError(null);
    setProgress(0);
    setAttempt((a) => a + 1);
  };

  const useSample = () => {
    setError(null);
    setProgress(0);
    requestDeck({ kind: 'sample' });
  };

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
      <Panel className="w-full max-w-md px-6 py-8 text-center md:px-10">
        {error ? (
          <div role="alert">
            <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-copper-500" aria-hidden="true" />
            <h1 className="font-display text-3xl text-brass-500">{error === 'network' ? 'Signal lost' : 'Boiler stalled'}</h1>
            <p className="mt-3 text-cream-100">{ERROR_COPY[error]}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={retry} autoFocus>
                Retry
              </Button>
              <Button variant="secondary" onClick={useSample}>
                Use sample deck
              </Button>
            </div>
            <button type="button" onClick={resetToDepot} className="mt-5 rounded text-sm text-brass-300 underline underline-offset-4 hover:text-cream-100">
              Back to the Depot
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl text-brass-500">Warming the boiler</h1>
            <Gauge
              value={progress}
              unit="PRESSURE"
              zones
              ariaLabel={`Boiler warming, ${Math.round(progress)} percent`}
              className="mx-auto my-5 w-44"
            />
            <p className="h-7 text-lg text-cream-100" role="status" aria-live="polite">
              {STATUS_LINES[statusIdx]}
            </p>
            <div
              className="mt-4 h-3 overflow-hidden rounded-full border border-brass-500 bg-iron-950"
              role="progressbar"
              aria-label="Preparing your questions"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div className="h-full bg-amber-500" style={{ width: `${progress}%` }} />
            </div>
            {source?.kind !== 'sample' && <p className="mt-4 text-sm text-cream-300">Writing questions usually takes 10-30 seconds.</p>}
          </>
        )}
      </Panel>
    </main>
  );
}
