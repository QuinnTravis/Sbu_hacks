import { BookOpen, Check, Download, RotateCcw, Upload, Wrench } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerControls } from '../components/SettingsDrawer';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Panel } from '../components/ui/Panel';
import { REVISIT_BELOW, STATION_NAMES } from '../store/gameConfig';
import { useGameStore } from '../store/gameStore';

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const Perforation = () => <hr className="my-5 border-0 border-t-2 border-dashed border-ink-900/25" aria-hidden="true" />;

export default function Report() {
  const report = useGameStore((s) => s.report);
  const lastDeck = useGameStore((s) => s.lastDeck);
  const startRun = useGameStore((s) => s.startRun);
  const resetToDepot = useGameStore((s) => s.resetToDepot);
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const newMaterials = () => {
    resetToDepot();
    navigate('/');
  };

  if (!report) {
    return (
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4">
        <Panel className="max-w-md p-8 text-center">
          <h1 ref={titleRef} tabIndex={-1} className="font-display text-3xl text-brass-500 outline-none">
            No journeys yet
          </h1>
          <p className="mt-3 text-cream-100">Finish a run and your Station Report will be waiting here.</p>
          <Button className="mt-6" onClick={newMaterials}>
            New materials
          </Button>
        </Panel>
      </main>
    );
  }

  const canRideAgain = lastDeck?.id === report.deckId;
  const finished = new Date(report.finishedAt);
  const stats = [
    { label: 'Accuracy', value: `${report.accuracy}%`, detail: `${report.correctAnswers} of ${report.totalAnswers}` },
    { label: 'Best streak', value: `×${report.bestStreak}`, detail: 'in a row' },
    { label: 'Total time', value: formatDuration(report.totalMs), detail: 'min:sec' },
    { label: 'Peak pressure', value: `${report.peakPressure}`, detail: 'of 100' },
  ];

  return (
    <main className="print-static relative z-10 h-dvh overflow-y-auto px-4 py-10 md:py-14">
      <CornerControls className="no-print fixed right-4 top-4 z-20" />

      <Card className="print-plain mx-auto max-w-3xl overflow-hidden">
        {/* Ticket header band */}
        <div className="print-plain flex flex-wrap items-end justify-between gap-2 bg-ink-900 px-6 py-3 text-cream-100 md:px-8">
          <p className="small-caps-label text-brass-300">SteamScholar Railway Co.</p>
          <p className="small-caps-label text-cream-300">
            Ticket {report.deckId.slice(0, 8).toUpperCase()} · {finished.toLocaleDateString()}
          </p>
        </div>

        <div className="px-6 py-6 md:px-8">
          <h1 ref={titleRef} tabIndex={-1} className="font-display text-4xl text-ink-900 outline-none md:text-5xl">
            Journey Complete
          </h1>
          <p className="mt-1 text-lg font-semibold text-ink-900">{report.deckTitle}</p>
          <p className="text-sm text-ink-900/80">
            {STATION_NAMES[0]} → {STATION_NAMES[STATION_NAMES.length - 1]}
          </p>

          <Perforation />

          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-md border border-ink-900/20 bg-cream-300/60 px-3 py-3">
                <dt className="small-caps-label text-ink-900/80">{s.label}</dt>
                <dd className="text-3xl font-bold text-ink-900">{s.value}</dd>
                <dd className="text-xs text-ink-900/75">{s.detail}</dd>
              </div>
            ))}
          </dl>

          <Perforation />

          <section aria-labelledby="concepts-title">
            <h2 id="concepts-title" className="mb-3 text-xl font-bold text-ink-900">
              Concept breakdown
            </h2>
            <ul className="space-y-3">
              {report.concepts.map((c) => {
                const weak = c.accuracy < REVISIT_BELOW;
                return (
                  <li key={c.concept} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[14rem_1fr_auto]">
                    <span className="flex items-center gap-2 font-semibold text-ink-900">
                      {weak ? (
                        <Wrench className="h-4 w-4 shrink-0 text-copper-500" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4 shrink-0 text-verdigris-500" strokeWidth={3} aria-hidden="true" />
                      )}
                      {c.concept}
                      {weak && (
                        <span className="small-caps-label rounded border border-copper-500 bg-copper-500/15 px-1.5 py-0.5 text-ink-900">
                          Revisit
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 row-start-2 h-3 overflow-hidden rounded-full border border-ink-900/25 bg-cream-300 md:col-span-1 md:row-start-auto">
                      <span
                        className={`block h-full shadow-[inset_-3px_0_0_#2B2118] ${weak ? 'bg-copper-500' : 'bg-verdigris-500'}`}
                        style={{ width: `${Math.max(c.accuracy, 2)}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-ink-900">
                      {c.accuracy}% <span className="text-sm font-normal text-ink-900/75">({c.correct}/{c.attempts})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {report.missed.length > 0 && (
            <>
              <Perforation />
              <section aria-labelledby="revisit-title">
                <h2 id="revisit-title" className="mb-3 text-xl font-bold text-ink-900">
                  Revisit these
                </h2>
                <ul className="space-y-4">
                  {report.missed.map((m) => (
                    <li key={m.questionId} className="border-l-4 border-copper-500 pl-3">
                      <p className="small-caps-label text-ink-900/80">{m.concept}</p>
                      <p className="font-semibold text-ink-900">{m.prompt}</p>
                      <p className="text-ink-900">
                        <span className="font-semibold">Answer:</span> {m.correctText}
                      </p>
                      <p className="inline-flex items-center gap-1 text-sm text-ink-900/80">
                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        {m.sourceLabel}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
          {report.missed.length === 0 && (
            <>
              <Perforation />
              <p className="font-semibold text-ink-900">A clean run with nothing to revisit. Full steam ahead!</p>
            </>
          )}
        </div>

        <div className="no-print flex flex-col gap-3 border-t-2 border-dashed border-ink-900/25 bg-cream-300/50 px-6 py-5 sm:flex-row sm:flex-wrap md:px-8">
          <Button
            icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
            disabled={!canRideAgain}
            onClick={() => {
              if (!lastDeck) return;
              startRun(lastDeck);
              navigate('/');
            }}
          >
            Ride again
          </Button>
          <Button variant="secondary-on-cream" icon={<Upload className="h-4 w-4" aria-hidden="true" />} onClick={newMaterials}>
            New materials
          </Button>
          <Button
            variant="secondary-on-cream"
            className="sm:ml-auto"
            icon={<Download className="h-4 w-4" aria-hidden="true" />}
            onClick={() => window.print()}
          >
            Download report
          </Button>
        </div>
      </Card>
    </main>
  );
}
