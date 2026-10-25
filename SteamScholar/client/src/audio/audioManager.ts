import { Howl, Howler } from 'howler';
import { onEffect } from '../scene/effects';
import { useGameStore } from '../store/gameStore';

// Generated with ElevenLabs (scripts/generate-sfx.mjs). scripts/make-placeholder-audio.mjs writes
// synthesized WAV stand-ins; set AUDIO_EXT to 'wav' to use those instead.
const AUDIO_EXT = 'mp3';
const file = (name: string) => [`/audio/${name}.${AUDIO_EXT}`];

type SoundName = 'whistle' | 'click' | 'chime' | 'sputter';

const CHUG_RATE = { min: 0.8, max: 1.6 };
const CHUG_VOLUME = { min: 0.15, max: 0.5 };

let sounds: Record<SoundName, Howl> | null = null;
let chug: Howl | null = null;
let unlocked = false;

function load() {
  if (sounds) return;
  sounds = {
    // Balanced by measured loudness: the whistle take is ~11 dB hotter than the chug and sputter.
    whistle: new Howl({ src: file('whistle'), volume: 0.4 }),
    click: new Howl({ src: file('ui-click'), volume: 0.4 }),
    chime: new Howl({ src: file('correct-chime'), volume: 0.35 }),
    sputter: new Howl({ src: file('sputter'), volume: 0.75 }),
  };
  chug = new Howl({ src: file('chug-loop'), loop: true, volume: 0 });
}

function play(name: SoundName) {
  if (!unlocked || !sounds) return;
  sounds[name].play();
}

function updateChug(speed: number) {
  if (!unlocked || !chug) return;
  const t = Math.min(1, Math.max(0, speed / 100));
  chug.rate(CHUG_RATE.min + t * (CHUG_RATE.max - CHUG_RATE.min));
  chug.volume(speed < 1 ? 0 : CHUG_VOLUME.min + t * (CHUG_VOLUME.max - CHUG_VOLUME.min));
}

export const audio = {
  /** Audio starts only after a user gesture ("Fire up the boiler" or "Try a sample deck"). */
  unlock() {
    if (unlocked) return;
    load();
    unlocked = true;
    chug?.play();
    updateChug(useGameStore.getState().actualSpeed);
  },
  click: () => play('click'),
  whistle: () => play('whistle'),
};

/** Wire audio to the store and effect bus. Call once; returns a cleanup function. */
export function initAudio(): () => void {
  const store = useGameStore;
  Howler.mute(!store.getState().settings.sound);

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.settings.sound !== prev.settings.sound) Howler.mute(!state.settings.sound);
    if (state.actualSpeed !== prev.actualSpeed) updateChug(state.actualSpeed);
    if (state.phase === 'station' && prev.phase !== 'station') play('whistle');
  });

  const offs = [
    onEffect('steamBurst', () => {
      play('whistle');
      play('chime');
    }),
    onEffect('sputter', () => play('sputter')),
  ];

  return () => {
    unsubscribe();
    offs.forEach((off) => off());
  };
}
