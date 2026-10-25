import { Headphones, Mic, MicOff } from 'lucide-react';
import { listenForReply } from '../audio/eyesFree';
import { stopListening, useVoiceStore, voiceSupported } from '../audio/voiceInput';
import { useGameStore } from '../store/gameStore';

/** Push-to-talk button, listening state, and what was heard (so low-vision players can check it). */
export function VoiceControl() {
  const { listening, heard } = useVoiceStore();
  const eyesFree = useGameStore((s) => s.settings.eyesFree);
  const canAnswer = useGameStore(
    (s) => (s.phase === 'playing' && Boolean(s.current) && !s.feedback) || s.phase === 'maintenance' || s.phase === 'station',
  );
  if (!voiceSupported && !eyesFree) return null;

  return (
    // In-flow above the card on narrower screens; in the empty margin beside it from 1280px up,
    // so it never pushes the answers below the fold.
    <div className="mb-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm xl:absolute xl:right-6 xl:top-5 xl:mb-0 xl:w-52 xl:flex-col xl:items-end">
      {eyesFree && (
        <span className="mr-auto inline-flex items-center gap-1.5 text-brass-300 xl:mr-0">
          <Headphones className="h-4 w-4" aria-hidden="true" /> Eyes-free · R to repeat
        </span>
      )}
      {heard && (
        <span className="max-w-[60%] truncate text-cream-300 xl:max-w-full">
          Heard: <q className="text-cream-100">{heard}</q>
        </span>
      )}
      {voiceSupported && (
        <button
          type="button"
          disabled={!canAnswer && !listening}
          aria-pressed={listening}
          onClick={() => (listening ? stopListening() : listenForReply())}
          className={`inline-flex min-h-10 items-center gap-2 rounded-md border-2 px-3 py-1.5 font-semibold transition-colors active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 ${
            listening
              ? 'border-amber-500 bg-amber-500/15 text-amber-500'
              : 'border-brass-500 text-cream-100 hover:border-brass-300 hover:bg-iron-700'
          }`}
        >
          {listening ? (
            <>
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              Listening… <MicOff className="h-4 w-4" aria-hidden="true" />
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" aria-hidden="true" /> Speak answer <kbd className="font-sans text-xs text-brass-300">V</kbd>
            </>
          )}
        </button>
      )}
    </div>
  );
}
