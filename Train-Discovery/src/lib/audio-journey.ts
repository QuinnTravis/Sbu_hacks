import { distance, segmentDistance } from "./geo";
import { audioEvidence, audioNarration } from "./narration";
import { createJourneyIntroduction } from "./journey-context";
import type { Coordinate, Evidence, Place, Position, RailRoute, Story } from "./types";

export type RailStop = RailRoute["stops"][number];
export type PlaceAudioContext = "pointed" | "pointed-earlier" | "nearby" | "replay";
export const POINTED_TIMELY_MS = 45_000;
export const STATION_TIMELY_MS = 90_000;
export type AudioRequest =
  | { type: "place"; placeId: string; context?: PlaceAudioContext }
  | { type: "station"; routeId: string; stationId: string }
  | { type: "journey"; routeId: string; simulation: boolean; lat?: number; lon?: number };

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

/** One opening per route and mode. The device fallback never claims live weather. */
export function journeyMoment(
  routeId: string,
  routeName: string,
  simulation: boolean,
  position: Coordinate | null,
): AudioMoment {
  const opening = createJourneyIntroduction({ routeName });
  return {
    key: `journey:${routeId}:${simulation ? "simulation" : "live"}`,
    name: `Welcome to ${routeName}`,
    request: {
      type: "journey", routeId, simulation,
      ...(position ? { lat: position.lat, lon: position.lon } : {}),
    },
    fallback: {
      name: `Welcome to ${routeName}`,
      text: `The tracks set the rhythm. The world outside supplies the stories. ${simulation ? "This is a simulated ride. " : ""}${opening.text}`,
      kind: "announcement",
      sources: [],
    },
  };
}

export function pointingContext(selectedAt: number, now: number): "pointed" | "pointed-earlier" {
  return now - selectedAt <= POINTED_TIMELY_MS ? "pointed" : "pointed-earlier";
}

function storyBody(place: Place): { narration: NonNullable<ReturnType<typeof audioNarration>>; body: string } | null {
  const narration = audioNarration(place);
  if (!narration) return null;
  const body = narration.text.startsWith(`${place.name}. `)
    ? narration.text.slice(place.name.length + 2) : narration.text;
  if (body.trim().length < 12) return null;
  return { narration, body };
}

/** Noun for a delayed point. Heritage stays a building; other categories use a fitting noun or “place”. */
function pointedNoun(category: string): string {
  switch (category.trim().toLowerCase()) {
    case "heritage":
    case "building":
      return "building";
    case "landmark":
      return "landmark";
    case "station":
    case "railway history":
      return "station";
    default:
      return "place";
  }
}

function placeLead(place: Place, context: PlaceAudioContext): string {
  switch (context) {
    case "pointed":
      return `You just pointed at ${place.name}.`;
    case "pointed-earlier":
      return `That ${pointedNoun(place.category)} you pointed at earlier, ${place.name}.`;
    case "replay":
      return `Once more, ${place.name}.`;
    default:
      return `${place.name}.`;
  }
}

/** Identification alone is insufficient for a POI story, including offline. */
export function placeAnnouncement(place: Place, context: PlaceAudioContext = "nearby"): AudioScript | null {
  const story = storyBody(place);
  if (!story) return null;
  return {
    name: place.name,
    text: `${placeLead(place, context)} ${story.body}`,
    kind: story.narration.kind,
    sources: place.evidence.filter((source) => !place.story || place.story.claims.some((claim) => claim.evidenceId === source.id))
      .map(({ title, url, license }) => ({ title, url, license })),
    ...(place.story && story.narration.kind === "verified" ? { story: place.story, evidence: place.evidence } : {}),
  };
}

/** Normalized sourced fact, used to avoid telling the same detail twice. */
export function narrationFact(place: Place): string | null {
  const story = storyBody(place);
  if (!story) return null;
  return story.body.replace(/\s+/g, " ").trim().toLowerCase();
}

export function storySentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean);
  return sentences?.length ? sentences : [text.trim()].filter(Boolean);
}

/** Split a story only when a station is already waiting for a sentence boundary. */
export function playbackSegments(text: string, stationWaiting: boolean): string[] {
  const sentences = storySentences(text);
  if (!stationWaiting || sentences.length < 2) return [text];
  return sentences;
}

export function isActivePlayback(generation: number, activeGeneration: number | null): boolean {
  return activeGeneration !== null && generation === activeGeneration;
}

/** A pause during the gap between device-speech sentences keeps the next sentence. */
export function sentenceGapElapsed(input: {
  canceled: boolean;
  paused: boolean;
  nextIndex: number;
}): { action: "stop" } | { action: "hold"; index: number } | { action: "speak"; index: number } {
  if (input.canceled) return { action: "stop" };
  if (input.paused) return { action: "hold", index: input.nextIndex };
  return { action: "speak", index: input.nextIndex };
}

/**
 * Speak a sentence held across a pause only when the engine is idle.
 * A clip that is still in progress resumes alone so speech does not overlap.
 */
export function deviceSpeechResume(
  heldIndex: number | null,
  engineSpeaking: boolean,
): { action: "speak"; index: number } | { action: "resume"; dropHeld: boolean } {
  if (heldIndex !== null && !engineSpeaking) return { action: "speak", index: heldIndex };
  return { action: "resume", dropHeld: heldIndex !== null && engineSpeaking };
}

export type SelectedStory = { place: Place; selectedAt: number; replay?: boolean };
export type PendingStation = { key: string; station: RailStop; routeId: string; expiresAt: number };
export type PlaybackCursor = { key: string; kind: "story" | "station"; sentencesRemaining: number };

export function canPrepare(place: Place): boolean {
  return Boolean(audioNarration(place) || audioEvidence(place).length);
}

export function preparationOrder(
  selected: Place[],
  nearby: Place[],
  spoken: Set<string>,
  activeId: string | null,
  limit = 2,
): Place[] {
  const ordered: Place[] = [];
  const seen = new Set<string>();
  for (const place of [...selected, ...nearby]) {
    if (ordered.length >= limit) break;
    if (seen.has(place.id) || place.id === activeId || spoken.has(`place:${place.id}`) || !canPrepare(place)) continue;
    seen.add(place.id);
    ordered.push(place);
  }
  return ordered;
}

export function playNowSelection(
  selected: SelectedStory[],
  currentKey: string | null,
  spoken: Set<string>,
): SelectedStory | null {
  return selected.find((item) => {
    const key = `place:${item.place.id}`;
    return key !== currentKey && (item.replay || !spoken.has(key));
  }) ?? null;
}

function placeMoment(place: Place, context: PlaceAudioContext): AudioMoment {
  return {
    key: `place:${place.id}`,
    name: place.name,
    place,
    request: { type: "place", placeId: place.id, context },
    fallback: placeAnnouncement(place, context),
  };
}

function stationMoment(station: PendingStation): AudioMoment {
  return {
    key: station.key,
    name: station.station.name,
    station: station.station,
    fallback: stationAnnouncement(station.station),
    request: { type: "station", routeId: station.routeId, stationId: station.station.id },
    expiresAt: station.expiresAt,
  };
}

function takeStory(items: SelectedStory[], spoken: Set<string>, dismissed: Set<string>, spokenFacts: Set<string>, now: number): AudioMoment | null {
  for (const item of items) {
    if (dismissed.has(item.place.id)) continue;
    const key = `place:${item.place.id}`;
    if (!item.replay && spoken.has(key)) continue;
    const fact = narrationFact(item.place);
    if (!item.replay && fact && spokenFacts.has(fact)) continue;
    const context = item.replay ? "replay" : pointingContext(item.selectedAt, now);
    return placeMoment(item.place, context);
  }
  return null;
}

export function nextNarration(input: {
  now: number;
  position: Coordinate | null;
  current: PlaybackCursor | null;
  boundary: "none" | "sentence" | "story";
  selected: SelectedStory[];
  nearby: Place[];
  stations: PendingStation[];
  spoken: Set<string>;
  dismissed: Set<string>;
  spokenFacts: Set<string>;
  immediateKey?: string | null;
}): { next: AudioMoment | null; discardedStationKeys: string[]; resume: boolean } {
  const discardedStationKeys = input.stations.filter((station) =>
    station.expiresAt <= input.now ||
    Boolean(input.position && distance(input.position, station.station) > 1200),
  ).map((station) => station.key);
  const timely = input.stations.filter((station) =>
    !discardedStationKeys.includes(station.key) && !input.spoken.has(station.key));

  if (input.immediateKey) {
    const item = input.selected.find((entry) => `place:${entry.place.id}` === input.immediateKey);
    const place = item?.place ?? input.nearby.find((candidate) => `place:${candidate.id}` === input.immediateKey);
    if (place && !input.dismissed.has(place.id)) {
      const context = item?.replay ? "replay" : item ? pointingContext(item.selectedAt, input.now) : "nearby";
      return { next: placeMoment(place, context), discardedStationKeys, resume: false };
    }
  }

  if (input.current && input.boundary === "none") {
    return { next: null, discardedStationKeys, resume: true };
  }
  if (input.current?.kind === "story" && input.boundary === "sentence" && input.current.sentencesRemaining > 0) {
    const station = timely[0];
    if (station) return { next: stationMoment(station), discardedStationKeys, resume: false };
    return { next: null, discardedStationKeys, resume: true };
  }

  const selected = takeStory(input.selected, input.spoken, input.dismissed, input.spokenFacts, input.now);
  if (selected) return { next: selected, discardedStationKeys, resume: false };
  const station = timely[0];
  if (station) return { next: stationMoment(station), discardedStationKeys, resume: false };
  for (const place of input.nearby) {
    if (input.dismissed.has(place.id) || input.spoken.has(`place:${place.id}`)) continue;
    const fact = narrationFact(place);
    if (fact && input.spokenFacts.has(fact)) continue;
    return { next: placeMoment(place, "nearby"), discardedStationKeys, resume: false };
  }
  return { next: null, discardedStationKeys, resume: false };
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
