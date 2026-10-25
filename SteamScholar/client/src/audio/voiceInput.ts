import { create } from 'zustand';
import { toast } from '../components/ui/Toast';
import { interpret } from '../lib/voiceMatch';
import { DEBUG_MODE, STATION_COUNT } from '../store/gameConfig';
import { useGameStore } from '../store/gameStore';
import { narrator } from './narrator';

/** Minimal Web Speech API surface (not in TypeScript's DOM lib). */
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor = ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition) as RecognitionCtor | undefined;

/** Real recognition (Chrome, Edge, Safari). `?debug=1` adds a scripted stand-in for tests. */
export const voiceSupported = Boolean(Ctor) || DEBUG_MODE;

export type Unmatched = 'unknown' | 'silence';

interface VoiceState {
  listening: boolean;
  /** Last thing heard, shown on screen so low-vision players can confirm it. */
  heard: string;
}
export const useVoiceStore = create<VoiceState>(() => ({ listening: false, heard: '' }));

let recognition: Recognition | null = null;
let listenTimeout: ReturnType<typeof setTimeout> | undefined;
/** Recognition can hang with no usable input device; treat a long silence as "nothing heard". */
const LISTEN_TIMEOUT_MS = 12_000;
const MIC_TEST_TIMEOUT_MS = 8_000;
let onUnmatched: ((reason: Unmatched) => void) | undefined;

function awaiting(): 'answer' | 'continue' | null {
  const s = useGameStore.getState();
  if (s.phase === 'playing' && s.current && !s.feedback && !s.grading) return 'answer';
  if (s.phase === 'maintenance' || (s.phase === 'station' && s.stationIndex < STATION_COUNT - 1)) return 'continue';
  return null;
}

/** Act on what was heard. Returns false when nothing matched. */
function act(alternatives: string[]): boolean {
  const mode = awaiting();
  if (!mode) return true;
  const s = useGameStore.getState();
  const intent = interpret(alternatives, s.current, mode);
  switch (intent.kind) {
    case 'answer':
      s.answer(intent.optionId);
      return true;
    case 'free':
      void s.submitFreeResponse(intent.text);
      return true;
    case 'continue':
      if (s.phase === 'maintenance') s.dismissMaintenance();
      else if (s.phase === 'station') s.departStation();
      return true;
    case 'repeat': {
      const retry = onUnmatched;
      narrator.repeat(() => listen(retry));
      return true;
    }
    default:
      return false;
  }
}

function finishWith(alternatives: string[] | null) {
  const retry = onUnmatched;
  stopListening();
  if (alternatives === null) return retry?.('silence');
  useVoiceStore.setState({ heard: alternatives[0] ?? '' });
  if (!act(alternatives)) retry?.('unknown');
}

export function stopListening() {
  clearTimeout(listenTimeout);
  if (recognition) {
    recognition.onend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.abort();
    recognition = null;
  }
  useVoiceStore.setState({ listening: false });
}

/**
 * Listen for one utterance and act on it. `whenUnmatched` lets eyes-free mode re-prompt after
 * silence or an unrecognized answer.
 */
export function listen(whenUnmatched?: (reason: Unmatched) => void) {
  stopListening();
  if (!awaiting()) return;
  onUnmatched = whenUnmatched;
  narrator.stop();
  useVoiceStore.setState({ listening: true, heard: '' });
  if (!Ctor) return; // debug stand-in: waits for window.__voiceInject

  const rec = new Ctor();
  recognition = rec;
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false;
  let final: string[] | null = null;
  rec.onresult = (e) => {
    const result = e.results[e.results.length - 1];
    const alternatives = Array.from({ length: result.length }, (_, i) => result[i].transcript);
    useVoiceStore.setState({ heard: alternatives[0] ?? '' });
    if (result.isFinal) final = alternatives;
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      onUnmatched = undefined;
      toast('Microphone blocked. Allow mic access in the browser, or answer with keys 1-4.');
    }
  };
  rec.onend = () => finishWith(final);
  try {
    rec.start();
    listenTimeout = setTimeout(() => {
      if (recognition === rec) finishWith(final);
    }, LISTEN_TIMEOUT_MS);
  } catch {
    stopListening();
  }
}

export function toggleListening(whenUnmatched?: (reason: Unmatched) => void) {
  if (useVoiceStore.getState().listening) stopListening();
  else listen(whenUnmatched);
}

if (DEBUG_MODE) {
  // Lets headless tests "speak": window.__voiceInject('two') or window.__voiceInject(null) for silence.
  (window as unknown as { __voiceInject: (text: string | null) => void }).__voiceInject = (text) => {
    if (!useVoiceStore.getState().listening) return;
    finishWith(text === null ? null : [text]);
  };
}

/** Settings "Test microphone": listen once, outside the game, and report what was heard. */
export function testMicrophone(): Promise<{ ok: true; heard: string } | { ok: false; reason: string }> {
  if (!Ctor) return Promise.resolve({ ok: false, reason: 'Voice input needs Chrome, Edge or Safari.' });
  stopListening();
  narrator.stop();
  return new Promise((resolve) => {
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let heard = '';
    let failure = '';
    rec.onresult = (e) => {
      heard = e.results[e.results.length - 1][0]?.transcript ?? '';
    };
    rec.onerror = (e) => {
      failure =
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone access is blocked. Allow it in the address bar, then try again.'
          : e.error === 'no-speech'
            ? "Didn't hear anything. Check the input device and speak a little louder."
            : e.error === 'network'
              ? 'Speech recognition needs an internet connection in this browser.'
              : `Speech recognition error: ${e.error}.`;
    };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(heard ? { ok: true, heard } : { ok: false, reason: failure || "Didn't hear anything. Check the input device and try again." });
    };
    const timer = setTimeout(() => {
      rec.abort();
      finish();
    }, MIC_TEST_TIMEOUT_MS);
    rec.onend = finish;
    try {
      rec.start();
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, reason: 'Could not start the microphone.' });
    }
  });
}
