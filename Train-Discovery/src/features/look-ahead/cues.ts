import {
  etaSeconds,
  kmAhead,
  sideOf,
  type Direction,
  type Facing,
  type Side,
} from "@/lib/route-geometry";
import type { Place } from "@/lib/types";

/**
 * Look-ahead cues: which curated place to announce next, on which side, and
 * when. Pure; the ride screen supplies position, speed, and time.
 */

export type LookAheadCue = {
  poiId: string;
  side: Side | null;
  etaSeconds: number | null;
  closestApproachM: number;
  score: number;
  phase: "upcoming" | "now";
  /** When this cue first appeared, for the minimum gap between cues. */
  startedAt: number;
};

export const CATEGORY_WEIGHT: Record<string, number> = {
  "Railroad heritage": 1,
  Canyon: 1,
  Heritage: 0.85,
  Landmark: 0.8,
  Mountain: 0.75,
  River: 0.7,
  Nature: 0.7,
  Town: 0.6,
};

export const DEFAULT_LEAD_S = 120;
/** Tunnels and canyons get a longer lead so the rider can get to a window. */
export const LEAD_BY_TYPE: Record<string, number> = { tunnel: 180, canyon: 180 };
export const DEFAULT_MIN_GAP_S = 45;
/** "Now" once the place is this close in time or distance. */
export const NOW_WINDOW_S = 25;
export const NOW_WINDOW_KM = 0.6;
/** Drop a cue once the train is this far past it. */
export const PASSED_KM = 0.3;
/** Without a usable speed, show a cue only this close. */
export const STOPPED_REACH_KM = 2;
/** Places scoring below this are not highlights unless bookmarked. */
export const HIGHLIGHT_THRESHOLD = 0.75;

export function leadSeconds(place: Place): number {
  return LEAD_BY_TYPE[place.basic?.type ?? ""] ?? DEFAULT_LEAD_S;
}

/** Where a long feature begins in the direction of travel. */
export function entryKm(place: Place, direction: Direction): number | null {
  if (place.extentKm) return direction === 1 ? place.extentKm[0] : place.extentKm[1];
  return typeof place.routeKm === "number" ? place.routeKm : null;
}

export function exitKm(place: Place, direction: Direction): number | null {
  if (place.extentKm) return direction === 1 ? place.extentKm[1] : place.extentKm[0];
  return typeof place.routeKm === "number" ? place.routeKm : null;
}

/** categoryWeight × proximityFactor × fameFactor, with a boost for bookmarks. */
export function highlightScore(place: Place, bookmarked = false): number {
  const category = CATEGORY_WEIGHT[place.category] ?? 0.6;
  const lateral = Math.min(5000, Math.max(0, place.lateralM ?? 5000));
  const proximity = 1 - (lateral / 5000) * 0.6;
  const sitelinks = Math.log2(1 + (place.fame ?? 0)) / 5;
  const fame = 0.6 + Math.min(0.8, sitelinks) + (place.wikipedia ? 0.2 : 0) + (place.story ? 0.25 : 0);
  return category * proximity * fame * (bookmarked ? 1.6 : 1);
}

export function isHighlight(place: Place, bookmarked = false): boolean {
  if (bookmarked) return true;
  return place.kind !== "place" && highlightScore(place) >= HIGHLIGHT_THRESHOLD;
}

export type CueInput = {
  places: Place[];
  km: number;
  direction: Direction | null;
  speedKmh: number | null;
  facing: Facing;
  bookmarked: ReadonlySet<string>;
  /** Places already cued on this ride. */
  announced: ReadonlySet<string>;
  current: LookAheadCue | null;
  lastStartedAt: number | null;
  now: number;
  minGapS?: number;
};

function describe(place: Place, input: CueInput, direction: Direction, startedAt: number): LookAheadCue | null {
  const entry = entryKm(place, direction);
  const exit = exitKm(place, direction);
  if (entry === null || exit === null) return null;
  // Gone once the train is past the far end of the feature.
  if (kmAhead(exit, input.km, direction) < -PASSED_KM) return null;
  const ahead = kmAhead(entry, input.km, direction);
  const eta = ahead > 0 ? etaSeconds(entry, input.km, direction, input.speedKmh) : 0;
  const inside = ahead <= 0;
  const now = inside || ahead <= NOW_WINDOW_KM || (eta !== null && eta <= NOW_WINDOW_S);
  return {
    poiId: place.id,
    side: sideOf(place, direction, input.facing),
    etaSeconds: eta === null ? null : Math.max(0, eta),
    closestApproachM: Math.round(place.lateralM ?? 0),
    score: highlightScore(place, input.bookmarked.has(place.id)),
    phase: now ? "now" : "upcoming",
    startedAt,
  };
}

/**
 * The cue to show now. A shown cue stays until its place is passed; a new one
 * starts only after the minimum gap, and never for a place already behind us.
 */
export function selectCue(input: CueInput): { cue: LookAheadCue | null; isNew: boolean } {
  const { direction } = input;
  if (direction === null) return { cue: null, isNew: false };
  if (input.current) {
    const place = input.places.find((p) => p.id === input.current!.poiId);
    const refreshed = place ? describe(place, input, direction, input.current.startedAt) : null;
    if (refreshed) return { cue: refreshed, isNew: false };
  }
  const gapMs = (input.minGapS ?? DEFAULT_MIN_GAP_S) * 1000;
  if (input.lastStartedAt !== null && input.now - input.lastStartedAt < gapMs) return { cue: null, isNew: false };
  let best: LookAheadCue | null = null;
  for (const place of input.places) {
    if (input.announced.has(place.id)) continue;
    const bookmarked = input.bookmarked.has(place.id);
    if (!isHighlight(place, bookmarked)) continue;
    const entry = entryKm(place, direction);
    if (entry === null) continue;
    const ahead = kmAhead(entry, input.km, direction);
    // Never announce something the train has already reached.
    if (ahead <= 0) continue;
    const eta = etaSeconds(entry, input.km, direction, input.speedKmh);
    if (eta === null ? ahead > STOPPED_REACH_KM : eta > leadSeconds(place)) continue;
    const cue = describe(place, input, direction, input.now);
    if (!cue) continue;
    if (!best || cue.score > best.score || (cue.score === best.score && (cue.etaSeconds ?? 0) < (best.etaSeconds ?? 0))) best = cue;
  }
  return { cue: best, isNew: Boolean(best) };
}
