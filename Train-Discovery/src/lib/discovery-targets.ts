import {
  POINTING_RADIUS_M,
  angleDelta,
  bearing,
  distance,
  isPointedAt,
} from "./geo";
import { narrationText, sourceExcerpt } from "./narration";
import type { Coordinate, Place, Ride } from "./types";

export type CatalogState = "idle" | "loading" | "ready" | "cached" | "error";

/** Why simulated auto aim is not pointing at a place, if it is not. */
export function replayCatalogStatus(
  replay: boolean,
  autoAim: boolean,
  target: Place | null,
  packageState: CatalogState,
): "loading" | "unavailable" | "empty" | null {
  if (!replay || !autoAim) return null;
  if (packageState === "error") return "unavailable";
  if (packageState === "idle" || packageState === "loading") return "loading";
  if (!target) return "empty";
  return null;
}

// Map imports can include separate OSM nodes for entrances to the same place.
// Only collapse nearby places whose names agree; distinct nearby landmarks stay distinct.
export function sameDiscoverySite(a: Place, b: Place): boolean {
  if (a.id === b.id) return true;
  const name = (value: string) =>
    value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(name(a.name)) && name(a.name) === name(b.name) && distance(a, b) < 180;
}

export function alreadyDiscovered(
  place: Place,
  ride: Ride,
  byId: Map<string, Place>,
): boolean {
  return (
    ride.queue.some((entry) => sameDiscoverySite(entry.place, place)) ||
    ride.dismissed.some((id) =>
      id === place.id || (byId.has(id) && sameDiscoverySite(byId.get(id)!, place)),
    )
  );
}

/** Automated demo should point to something with worthwhile, attributable content. */
export function replayPriority(place: Place): number {
  if (narrationText(place)) return 3;
  if (!sourceExcerpt(place)) return 0;
  if (place.category === "Infrastructure") return 0;
  if (place.category === "Railway history" || place.category === "Station") return 1;
  return 2;
}

export function chooseReplayTarget(
  places: Place[],
  ride: Ride,
  position: Coordinate,
  byId: Map<string, Place>,
): Place | null {
  return places
    .filter((place) =>
      distance(position, place) <= POINTING_RADIUS_M &&
      replayPriority(place) > 0 &&
      !alreadyDiscovered(place, ride, byId),
    )
    .sort((a, b) =>
      replayPriority(b) - replayPriority(a) ||
      distance(position, a) - distance(position, b),
    )[0] ?? null;
}

export type PointingCandidate = {
  place: Place;
  meters: number;
  alignment: number;
};

/**
 * Places inside the pointing cone. Alignment is angular error, not a claim
 * that the rider can see the place. Same-site nodes collapse to the stronger source.
 */
export function rankPointingCandidates(
  places: Place[],
  position: Coordinate,
  heading: number | null,
  ride: Ride,
  byId: Map<string, Place>,
  limit = 4,
): PointingCandidate[] {
  if (heading === null || !Number.isFinite(heading)) return [];
  const matched = places.flatMap((place) => {
    if (!isPointedAt(position, heading, place) || alreadyDiscovered(place, ride, byId)) return [];
    return [{
      place,
      meters: distance(position, place),
      alignment: Math.abs(angleDelta(bearing(position, place), heading)),
    }];
  });
  const kept: PointingCandidate[] = [];
  for (const candidate of matched) {
    const index = kept.findIndex((item) => sameDiscoverySite(item.place, candidate.place));
    if (index >= 0) {
      const current = kept[index];
      const betterSource = replayPriority(candidate.place) > replayPriority(current.place);
      const tighter = replayPriority(candidate.place) === replayPriority(current.place) &&
        (candidate.alignment < current.alignment ||
          (candidate.alignment === current.alignment && candidate.meters < current.meters));
      if (betterSource || tighter) kept[index] = candidate;
      continue;
    }
    kept.push(candidate);
  }
  return kept
    .sort((a, b) => a.alignment - b.alignment || a.meters - b.meters || replayPriority(b.place) - replayPriority(a.place))
    .slice(0, limit);
}

/** While a finger or focus is on the sheet, keep the rows that were there. */
export function holdCandidateRows<T>(live: T[], held: T[] | null, engaged: boolean): T[] {
  if (!engaged || held === null) return live;
  return held;
}
