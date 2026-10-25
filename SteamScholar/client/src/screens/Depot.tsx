import { AlertTriangle, FileText, Package, ScrollText, ShieldAlert, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { audio } from '../audio/audioManager';
import { CornerControls } from '../components/SettingsDrawer';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Panel } from '../components/ui/Panel';
import { ERROR_COPY, MIN_TEXT_CHARS, validateFile } from '../lib/api';
import { useGameStore } from '../store/gameStore';

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Depot() {
  const requestDeck = useGameStore((s) => s.requestDeck);
  const depotError = useGameStore((s) => s.depotError);
  const hasReport = useGameStore((s) => Boolean(s.report));
  const eyesFree = useGameStore((s) => s.settings.eyesFree);
  const updateSettings = useGameStore((s) => s.updateSettings);

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(depotError);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textId = useId();
  const counterId = useId();

  const textChars = text.trim().length;
  const canFire = Boolean(file) || textChars >= MIN_TEXT_CHARS;

  const acceptFile = (f: File | undefined) => {
    if (!f) return;
    const problem = validateFile(f);
    if (problem) {
      setFile(null);
      setError(ERROR_COPY[problem]);
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  const fire = () => {
    if (!canFire) return;
    audio.unlock();
    requestDeck(file ? { kind: 'file', file } : { kind: 'text', text });
  };

  const trySample = () => {
    audio.unlock();
    requestDeck({ kind: 'sample' });
  };

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center overflow-y-auto px-4 py-16">
      <CornerControls className="fixed right-4 top-4 z-20" />

      <Panel className="w-full max-w-xl px-5 py-7 md:px-9 md:py-9">
        <header className="mb-6 text-center">
          <h1 className="font-display text-4xl text-brass-500 md:text-5xl">SteamScholar</h1>
          <p className="mt-2 text-lg text-cream-100">Load your notes. Fire up the boiler.</p>
        </header>

        {/* Loading dock drop zone */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-describedby="dock-hint"
          className={`group flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors active:translate-y-[2px] ${
            dragging ? 'border-amber-500 bg-amber-500/10' : 'border-brass-500 bg-iron-950/50 hover:border-brass-300 hover:bg-iron-950/80'
          }`}
        >
          <Package className={`h-12 w-12 ${dragging ? 'text-amber-500' : 'text-brass-500 group-hover:text-brass-300'}`} aria-hidden="true" />
          <span className="text-lg font-semibold text-cream-100">Drop your study materials here</span>
          <span id="dock-hint" className="text-sm text-brass-300">
            or click to browse · PDF or TXT, up to 10 MB
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-cream-300">
          <ShieldAlert className="h-3.5 w-3.5 text-brass-300" aria-hidden="true" />
          Free AI tier: don&apos;t upload anything private.
        </p>

        {file && (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-brass-500/60 bg-iron-950/60 px-3 py-2">
            <FileText className="h-5 w-5 shrink-0 text-brass-300" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-cream-100">{file.name}</span>
            <span className="shrink-0 text-sm text-cream-300">{formatSize(file.size)}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label={`Remove ${file.name}`}
              className="rounded p-1 text-brass-300 hover:bg-iron-700 hover:text-cream-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-copper-500 bg-copper-500/15 px-3 py-2 text-cream-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-copper-500" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="mt-5">
          <button
            type="button"
            aria-expanded={showPaste}
            aria-controls={textId}
            onClick={() => setShowPaste((v) => !v)}
            className="inline-flex items-center gap-2 rounded text-brass-300 underline decoration-brass-500 underline-offset-4 hover:text-cream-100"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Or paste your notes
          </button>
          {showPaste && (
            <div className="mt-3">
              <label htmlFor={textId} className="sr-only">
                Paste your notes
              </label>
              <textarea
                id={textId}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                aria-describedby={counterId}
                rows={7}
                placeholder="Paste lecture notes, a chapter summary, or study guide text…"
                className="w-full resize-y rounded-md border-2 border-iron-700 bg-cream-100 p-3 text-base text-ink-900 placeholder:text-ink-900/60 hover:border-brass-500 focus:border-amber-500"
              />
              <p id={counterId} className={`mt-1 text-sm ${textChars >= MIN_TEXT_CHARS ? 'text-brass-300' : 'text-cream-300'}`}>
                {textChars.toLocaleString()} characters
                {textChars < MIN_TEXT_CHARS && ` · ${MIN_TEXT_CHARS - textChars} more needed`}
                {file && textChars > 0 && ' · the uploaded file will be used'}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-iron-700 pt-2">
          <Toggle
            label="Eyes-free mode"
            description="Questions read aloud; answer by voice. Works with your eyes closed."
            checked={eyesFree}
            onChange={(on) => updateSettings({ eyesFree: on })}
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={trySample}>
            Try a sample deck
          </Button>
          <Button size="lg" onClick={fire} disabled={!canFire} aria-describedby={!canFire ? 'fire-hint' : undefined}>
            Fire up the boiler
          </Button>
        </div>
        {!canFire && (
          <p id="fire-hint" className="mt-2 text-right text-xs text-cream-300">
            Add a file or at least {MIN_TEXT_CHARS} characters of notes.
          </p>
        )}

        {hasReport && (
          <p className="mt-6 text-center text-sm">
            <Link to="/report" className="rounded text-brass-300 underline underline-offset-4 hover:text-cream-100">
              View your last Station Report
            </Link>
          </p>
        )}
      </Panel>
    </main>
  );
}
