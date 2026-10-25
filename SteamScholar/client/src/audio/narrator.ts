import { DEBUG_MODE } from '../store/gameConfig';
import { useGameStore } from '../store/gameStore';
import { audio } from './audioManager';

/**
 * Conductor narration for eyes-free mode. Prefers ElevenLabs clips from /api/tts; if that fails
 * once (no key, no permission, offline) it switches to the browser's speechSynthesis for the session.
 */

let useServerVoice = true;
let current: HTMLAudioElement | null = null;
let token = 0;
let lastText = '';

function pickBrowserVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en'));
}

function speakWithBrowser(text: string, done: () => void) {
  if (!('speechSynthesis' in window)) return done();
  let finished = false;
  const once = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    done();
  };
  // speechSynthesis sometimes never fires onend (Chrome, long text); never leave eyes-free mode waiting.
  const watchdog = setTimeout(once, 2_000 + text.length * 90);
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickBrowserVoice();
  if (voice) u.voice = voice;
  u.rate = 1.02;
  u.onend = once;
  u.onerror = once;
  window.speechSynthesis.speak(u);
}

function stopPlayback() {
  token++;
  if (current) {
    current.pause();
    current.src = '';
    current = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  audio.duck(false);
}

export const narrator = {
  /**
   * Speak `text`, interrupting anything already playing. `onEnd` fires only if not interrupted.
   * Prompts like "Sorry, I didn't catch that" pass `remember: false` so "repeat" re-reads the question.
   */
  speak(text: string, onEnd?: () => void, { remember = true }: { remember?: boolean } = {}) {
    stopPlayback();
    if (remember) lastText = text;
    if (DEBUG_MODE) console.debug(`[narrator] ${text}`);
    if (!useGameStore.getState().settings.sound) {
      onEnd?.();
      return;
    }
    const mine = token;
    const finish = () => {
      if (mine !== token) return;
      audio.duck(false);
      current = null;
      onEnd?.();
    };
    audio.duck(true);

    if (!useServerVoice) return speakWithBrowser(text, finish);

    const el = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
    current = el;
    el.onended = finish;
    el.onerror = () => {
      if (mine !== token) return;
      useServerVoice = false; // stay on the browser voice for the rest of the session
      speakWithBrowser(text, finish);
    };
    el.play().catch((err: DOMException) => {
      // Interruptions abort play() on purpose; anything else (e.g. autoplay blocked) falls back.
      if (mine !== token || err.name === 'AbortError') return;
      speakWithBrowser(text, finish);
    });
  },

  repeat(onEnd?: () => void) {
    if (lastText) narrator.speak(lastText, onEnd);
  },

  stop: stopPlayback,
};
