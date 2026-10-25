/**
 * Imperative effect triggers. Game logic fires these; the 3D scene and the audio
 * manager register handlers. Nothing here touches Three.js directly.
 */
export type EffectName = 'steamBurst' | 'sputter' | 'shake';

type Handler = () => void;
const handlers: Record<EffectName, Set<Handler>> = {
  steamBurst: new Set(),
  sputter: new Set(),
  shake: new Set(),
};

export function onEffect(name: EffectName, handler: Handler): () => void {
  handlers[name].add(handler);
  return () => handlers[name].delete(handler);
}

function fire(name: EffectName) {
  handlers[name].forEach((h) => h());
}

/** Correct answer: a big puff from the stack and cylinders. */
export const triggerSteamBurst = () => fire('steamBurst');
/** Wrong answer: a few small irregular puffs. */
export const triggerSputter = () => fire('sputter');
/** Wrong answer: brief small camera shake (the scene skips it under reduce motion). */
export const triggerShake = () => fire('shake');
