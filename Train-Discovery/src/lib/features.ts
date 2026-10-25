/**
 * Feature flags. Each addendum feature is an isolated module that can be
 * switched off at build time with NEXT_PUBLIC_FEATURE_<NAME>=0. Next.js only
 * inlines NEXT_PUBLIC_* variables read literally, so each one is spelled out.
 */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const features = {
  /** F1: look-ahead cues and the window-side advisor. */
  lookAhead: flag(process.env.NEXT_PUBLIC_FEATURE_LOOK_AHEAD, true),
  /** F2: narrate named places along the line with tiered, upgraded scripts. */
  narration: flag(process.env.NEXT_PUBLIC_FEATURE_NARRATION, true),
  /** F3: historic photos with a past/present slider. */
  history: flag(process.env.NEXT_PUBLIC_FEATURE_HISTORY, true),
  /** F4: bookmarks, including places not reached yet. */
  bookmarks: flag(process.env.NEXT_PUBLIC_FEATURE_BOOKMARKS, true),
  /** F5: language menu. English is always available. */
  i18n: flag(process.env.NEXT_PUBLIC_FEATURE_I18N, true),
  /** F6: estimated no-signal stretches and offline downloads. */
  connectivity: flag(process.env.NEXT_PUBLIC_FEATURE_CONNECTIVITY, true),
  /** F7: air quality along the route. */
  airQuality: flag(process.env.NEXT_PUBLIC_FEATURE_AIR_QUALITY, true),
  /** F8: push-to-talk questions and commands. */
  voice: flag(process.env.NEXT_PUBLIC_FEATURE_VOICE, true),
  /**
   * Generate narrator audio live through ElevenLabs for static-network places
   * that have no pre-generated clip. Off by default to protect the character
   * budget (DECISIONS D13); the device voice covers those places instead.
   */
  liveNarration: flag(process.env.NEXT_PUBLIC_FEATURE_LIVE_NARRATION, false),
  /** F9: movable 3D models of approaching places. */
  models3d: flag(process.env.NEXT_PUBLIC_FEATURE_MODELS_3D, true),
} as const;

export type FeatureName = keyof typeof features;
