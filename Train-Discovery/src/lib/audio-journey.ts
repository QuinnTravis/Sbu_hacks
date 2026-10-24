import { distance, segmentDistance } from "./geo";
import { audioNarration } from "./narration";
import type { Coordinate, Evidence, Place, Position, RailRoute, Story } from "./types";

export type RailStop = RailRoute["stops"][number];
export type PlaceAudioContext = "pointed" | "nearby" | "replay";
export type AudioRequest =
  | { type: "place"; placeId: string; context?: PlaceAudioContext }
  | { type: "station"; routeId: string; stationId: string };

export type AudioScript = {
  name: string;
  text: string;
  kind: "verified" | "source" | "announcement";
  sources: { title: string; url: string; license: string }[];
  story?: Story;
  evidence?: Evidence[];
};

export type AudioMoment = {
  key: string;
  request: AudioRequest;
  name: string;
  fallback: AudioScript | null;
  place?: Place;
  station?: RailStop;
  expiresAt?: number;
};

/** A GPS observation, not a timetable prediction or proof this train will stop. */
export function reachedStation(
  stop: Coordinate,
  position: Position,
  previous: Position | null,
): boolean {
  if (distance(stop, position) <= 250) return true;
  // Cover a missed GPS fix at speed, but never treat a replay jump or stale fix
  // as a journey through every station between the two observations.
  return Boolean(
    previous &&
    position.timestamp > previous.timestamp &&
    position.timestamp - previous.timestamp < 15000 &&
    distance(previous, position) < 1200 &&
    segmentDistance(stop, previous, position) <= 180,
  );
}

export function stationAnnouncement(stop: RailStop): AudioScript {
  return { name: stop.name, text: `Station approaching: ${stop.name}.`, kind: "announcement", sources: [] };
}

/** Identification alone is insufficient for a POI story, including offline. */
export function placeAnnouncement(place: Place, context: PlaceAudioContext = "nearby"): AudioScript | null {
  const narration = audioNarration(place);
  if (!narration) return null;
  const body = narration.text.startsWith(`${place.name}. `)
    ? narration.text.slice(place.name.length + 2) : narration.text;
  if (body.trim().length < 12) return null;
  const introductions = [
    `You just pointed at ${place.name}.`,
    `You're pointing at ${place.name}.`,
    `That's ${place.name} you're pointing at.`,
  ];
  const variant = [...place.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % introductions.length;
  return {
    name: place.name,
    text: `${context === "pointed" ? introductions[variant] : `${place.name}.`} ${body}`,
    kind: narration.kind,
    sources: place.evidence.filter((source) => !place.story || place.story.claims.some((claim) => claim.evidenceId === source.id))
      .map(({ title, url, license }) => ({ title, url, license })),
    ...(place.story && narration.kind === "verified" ? { story: place.story, evidence: place.evidence } : {}),
  };
}

export function chooseAudioMoment(
  moments: AudioMoment[],
  spoken: Set<string>,
  dismissed: Set<string>,
  now: number,
  preferred: string | null = null,
): AudioMoment | undefined {
  const eligible = moments.filter((moment) =>
    (!moment.place || !dismissed.has(moment.place.id)) &&
    (!moment.expiresAt || moment.expiresAt > now),
  );
  return eligible.find((moment) => moment.key === preferred) ??
    eligible.find((moment) => !spoken.has(moment.key));
}
