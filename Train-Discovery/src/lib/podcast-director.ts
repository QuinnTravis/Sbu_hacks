import {
  narrationFact,
  placeAnnouncement,
  pointingContext,
  stationAnnouncement,
} from "./audio-journey";
import type { AudioMoment, AudioScript, PendingStation, SelectedStory } from "./audio-journey";
import { distance } from "./geo";
import { narrationText } from "./narration";
import type { PlaceAudioContext } from "./audio-journey";
import type { Place, Position } from "./types";

/**
 * Pure editorial layer for the existing single audio queue. It chooses *when*
 * and *what* to play; use-audio-guide remains responsible for fetching,
 * cancellation, speech, pause/resume, and marking keys played on completion.
 *
 * `moment` is the same AudioMoment consumed by the existing scheduler. Place
 * scripts are rebuilt through placeAnnouncement's citation/quote guards. The
 * director never writes new historical claims or implies a POI is visible.
 */
export const PODCAST_INTRO_KEY = "podcast:intro";
export const PODCAST_AUTO_GAP_MS = 7_000;
export const PODCAST_BREATH_MS = 900;

const MAX_NEARBY_METERS = 1_100;
const MAX_STATION_METERS = 1_200;
const MAX_FIX_AGE_MS = 15_000;
const MAX_FIX_ACCURACY_METERS = 150;

export type PodcastCandidate = {
  moment: AudioMoment;
  /** A script composed for a static-network place (verified, source, or basic tier). */
  script?: AudioScript | null;
  /** Optional editorial theme; otherwise the catalog category is used. */
  topic?: string | null;
  /** A selection timestamp; lets a pointed clip use the truthful lead-in. */
  selectedAt?: number;
};

export type PodcastPlayback = {
  key: string;
  kind: "story" | "station" | "intro" | "transition" | "announcement";
  endedAt: number;
  topic?: string | null;
};

export type PodcastDirectorInput = {
  now: number;
  candidates: readonly PodcastCandidate[];
  geography: {
    routeId: string | null;
    position: Position | null;
    /** How far from the rider a nearby story may be. 1.1 km on LIRR; wider on mountain corridors. */
    nearbyMeters?: number;
  };
  /** Language for station lines. English when absent. */
  language?: string;
  playedKeys: ReadonlySet<string>;
  /** Values from narrationFact(place), for different places telling the same fact. */
  playedFacts?: ReadonlySet<string>;
  /** Site keys returned by a previously played plan, for duplicate map records. */
  playedSiteKeys?: ReadonlySet<string>;
  dismissedPlaceIds?: ReadonlySet<string>;
  /** An explicit, user-chosen place gets ahead of automatic narration. */
  pointedPlaceId?: string | null;
  pointedAt?: number | null;
  /** Only an explicit replay can override the normal played/fact deduplication. */
  replayPlaceId?: string | null;
  previousTopic?: string | null;
  lastPlayback?: PodcastPlayback | null;
  current?: {
    key: string;
    kind: "story" | "station" | "intro" | "transition" | "announcement";
    boundary: "none" | "sentence" | "story";
    sentencesRemaining?: number;
  } | null;
};

export type RankedPodcastItem = {
  moment: AudioMoment;
  priority: "station" | "announcement" | "pointed" | "nearby";
  reason: string;
  score: number;
  topic: string | null;
  /** A deep dive contains at least two individually supported story claims. */
  depth: "brief" | "deep";
  supportedDetails: number;
  /** Store alongside playedKeys when speech actually finishes. */
  siteKey: string | null;
  factKey: string | null;
};

export type PodcastPlan = { ranked: RankedPodcastItem[] } & (
  | { action: "story" | "station" | "announcement"; item: RankedPodcastItem; reason: string }
  | { action: "intro" | "transition"; key: string; text: string; next: RankedPodcastItem; reason: string }
  | { action: "quiet"; reason: "no-sourced-stories" | "unknown-location" | "playback-in-progress" | "continue-current" | "breathing-room" | "invalid-time"; until?: number }
);

const validCoordinates = (point: { lat: number; lon: number }) =>
  Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
  Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180;

function validLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function usablePosition(position: Position | null, now: number): position is Position {
  return Boolean(position && validCoordinates(position) &&
    Number.isFinite(position.accuracy) && position.accuracy >= 0 &&
    position.accuracy <= MAX_FIX_ACCURACY_METERS &&
    Number.isFinite(position.timestamp) &&
    now - position.timestamp >= -2_000 && now - position.timestamp <= MAX_FIX_AGE_MS);
}

function cleanTopic(value: string | null | undefined): string | null {
  const result = value?.trim().toLowerCase() ?? "";
  return result || null;
}

function siteName(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable identity for recording that a named mapped site has been narrated. */
export function podcastSiteKey(place: Place): string {
  const name = siteName(place.name);
  return `${name}:${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
}

function sameSite(a: Place, b: Place): boolean {
  return siteName(a.name) === siteName(b.name) &&
    distance(a, b) <= 180;
}

function candidateItem(input: PodcastDirectorInput, entry: PodcastCandidate, positioned: Position | null): RankedPodcastItem | null {
  const { moment } = entry;
  const { routeId } = input.geography;
  if (moment.request.type === "announcement") {
    // Templated, time-sensitive lines (look-ahead cues, warnings). Never a historical claim.
    if (!moment.fallback?.text.trim() || !Number.isFinite(moment.expiresAt) ||
      (moment.expiresAt ?? 0) <= input.now || input.playedKeys.has(moment.key)) return null;
    return { moment, priority: "announcement", reason: "timely announcement",
      score: 8_000 + (moment.priority ?? 0), topic: null, depth: "brief", supportedDetails: 0,
      siteKey: null, factKey: null };
  }
  if (moment.request.type === "station") {
    const stop = moment.station;
    if (!stop || !positioned || !routeId || !validCoordinates(stop) ||
      !stop.id.trim() || !stop.name.trim() ||
      moment.key !== `station:${stop.id}` ||
      moment.request.stationId !== stop.id ||
      moment.request.routeId !== routeId ||
      !Number.isFinite(moment.expiresAt) || (moment.expiresAt ?? 0) <= input.now ||
      distance(positioned, stop) > MAX_STATION_METERS ||
      input.playedKeys.has(moment.key)) return null;
    const safeMoment: AudioMoment = { ...moment, name: stop.name, fallback: stationAnnouncement(stop, input.language ?? "en") };
    return { moment: safeMoment, priority: "station", reason: "timely station encounter", score: 10_000 +
      (MAX_STATION_METERS - distance(positioned, stop)) / 10,
      topic: null, depth: "brief", supportedDetails: 0, siteKey: null, factKey: null };
  }

  const place = moment.place;
  if (!place || moment.request.type !== "place" || !validCoordinates(place) ||
    !place.id.trim() || !place.name.trim() || !validLink(place.sourceUrl) ||
    !Array.isArray(place.routeIds) || !place.routeIds.length ||
    moment.request.placeId !== place.id || moment.key !== `place:${place.id}` ||
    input.dismissedPlaceIds?.has(place.id)) return null;

  const explicit = input.pointedPlaceId === place.id || Number.isFinite(entry.selectedAt);
  const replay = input.replayPlaceId === place.id;
  const nearbyMeters = input.geography.nearbyMeters ?? MAX_NEARBY_METERS;
  if (!explicit && !replay && (!positioned ||
      (routeId !== null && !place.routeIds.includes(routeId)) ||
      distance(positioned, place) > nearbyMeters)) return null;

  const fact = narrationFact(place);
  const siteKey = podcastSiteKey(place);
  if (!replay && (input.playedKeys.has(moment.key) ||
    input.playedSiteKeys?.has(siteKey) ||
    (fact && input.playedFacts?.has(fact)))) return null;

  const selectedAt = Number.isFinite(entry.selectedAt) ? entry.selectedAt : input.pointedAt;
  const context = replay ? "replay" : explicit
    ? typeof selectedAt === "number" && Number.isFinite(selectedAt) &&
      selectedAt <= input.now && selectedAt >= 0
      ? pointingContext(selectedAt, input.now) : "pointed-earlier"
    : "nearby";
  // A name, a URL, or an arbitrary AudioMoment fallback cannot constitute a
  // sourced story. This rechecks claim quotes / matching Wikipedia excerpts.
  // Static-network scripts come precomposed from the same checks (narration-script.ts).
  const script = entry.script !== undefined ? entry.script : placeAnnouncement(place, context);
  if (!script || script.kind === "announcement" || !script.sources.length ||
    !script.sources.every((source) => source.title.trim() && source.license.trim() && validLink(source.url))) return null;

  const topic = cleanTopic(entry.topic ?? place.category);
  const nearbyDistance = positioned ? Math.min(nearbyMeters, distance(positioned, place)) : nearbyMeters;
  const pointed = explicit || replay;
  const published = place.story;
  const supportedDetails = script.kind === "verified" && published
    ? published.claims.filter((claim) => narrationText({ ...place, story: { ...published, claims: [claim] } })).length
    : script.kind === "source" ? 1 : 0;
  const depth = supportedDetails >= 2 ? "deep" : "brief";
  const score = (pointed ? 5_000 : 1_000) +
    (script.kind === "verified" ? 240 : script.kind === "basic" ? -200 : 0) +
    Math.min(3, supportedDetails) * 20 +
    (topic && topic === cleanTopic(input.previousTopic) ? 130 : 0) +
    Math.max(0, ((nearbyMeters - nearbyDistance) / nearbyMeters) * 55);
  return {
    moment: { ...moment, name: place.name, fallback: script,
      request: { type: "place", placeId: place.id, context, ...(script.language && script.language !== "en" ? { locale: script.language } : {}) } },
    priority: pointed ? "pointed" : "nearby",
    reason: pointed ? replay ? "explicit replay" : depth === "deep" ? "user chose a multi-fact deep dive" : "user chose this place" :
      script.kind === "verified" ? "nearby verified story" : script.kind === "basic" ? "nearby basic geography" : "nearby attributed source excerpt",
    score, topic, depth, supportedDetails, siteKey, factKey: fact,
  };
}

function rank(input: PodcastDirectorInput, position: Position | null): RankedPodcastItem[] {
  const ordered = input.candidates
    .map((candidate) => candidateItem(input, candidate, position))
    .filter((item): item is RankedPodcastItem => item !== null)
    .sort((a, b) => b.score - a.score ||
      (a.moment.key < b.moment.key ? -1 : a.moment.key > b.moment.key ? 1 : 0));
  const unique: RankedPodcastItem[] = [];
  for (const item of ordered) {
    if (unique.some((other) => other.moment.key === item.moment.key ||
      (item.factKey && other.factKey === item.factKey) ||
      (item.moment.place && other.moment.place && sameSite(item.moment.place, other.moment.place)))) continue;
    unique.push(item);
  }
  return unique;
}

/**
 * Reuses the scheduler's SelectedStory, PendingStation, Place and AudioMoment
 * types. `selectedAt` is carried through so delayed pointing stays truthful.
 * Does not fetch content, generate speech, or mark items played.
 */
/** Builds a static-network moment: a script plus the parts to speak. */
export type PlaceComposer = (place: Place, context: PlaceAudioContext) =>
  { script: AudioScript; parts: AudioMoment["parts"] } | null;

export function podcastCandidatesFromJourney(input: {
  now: number;
  selected: readonly SelectedStory[];
  nearby: readonly Place[];
  stations: readonly PendingStation[];
  announcements?: readonly AudioMoment[];
  compose?: PlaceComposer | null;
  language?: string;
}): PodcastCandidate[] {
  const candidates: PodcastCandidate[] = [];
  const placeCandidate = (place: Place, context: PlaceAudioContext, selectedAt?: number): PodcastCandidate => {
    const composed = input.compose ? input.compose(place, context) : undefined;
    return {
      ...(selectedAt !== undefined ? { selectedAt } : {}),
      ...(input.compose ? { script: composed?.script ?? null } : {}),
      moment: { key: `place:${place.id}`, name: place.name, place,
        request: { type: "place", placeId: place.id, context,
          ...(input.compose && input.language && input.language !== "en" ? { locale: input.language } : {}) },
        fallback: composed ? composed.script : input.compose ? null : placeAnnouncement(place, context),
        ...(composed?.parts ? { parts: composed.parts } : {}) },
    };
  };
  for (const item of input.selected) {
    const context = item.replay ? "replay" : pointingContext(item.selectedAt, input.now);
    candidates.push(placeCandidate(item.place, context, item.selectedAt));
  }
  for (const place of input.nearby) candidates.push(placeCandidate(place, "nearby"));
  for (const station of input.stations) candidates.push({
    moment: { key: station.key, name: station.station.name, station: station.station,
      request: { type: "station", routeId: station.routeId, stationId: station.station.id,
        ...(input.language && input.language !== "en" ? { locale: input.language } : {}) },
      fallback: stationAnnouncement(station.station, input.language ?? "en"), expiresAt: station.expiresAt },
  });
  for (const announcement of input.announcements ?? []) candidates.push({ moment: announcement });
  return candidates;
}

/**
 * Decide one queue action. After an intro/transition finishes, record its key
 * and call again. At a sentence boundary, speak only an urgent station, then
 * resume the suspended story. Do not use this to create a second audio queue.
 */
export function planPodcast(input: PodcastDirectorInput): PodcastPlan {
  if (!Number.isFinite(input.now)) return { action: "quiet", reason: "invalid-time", ranked: [] };
  const positioned = usablePosition(input.geography.position, input.now) ? input.geography.position : null;
  const ranked = rank(input, positioned);
  const station = ranked.find((item) => item.priority === "station");
  if (input.current && input.current.boundary !== "story") {
    if (input.current.boundary === "sentence" && input.current.kind === "story" &&
      (input.current.sentencesRemaining ?? 0) > 0 && station)
      return { action: "station", item: station, reason: station.reason, ranked };
    return { action: "quiet", reason: input.current.boundary === "sentence" ? "continue-current" : "playback-in-progress", ranked };
  }

  // The station window is short. It always precedes background narration and
  // even a selected place; the selected story stays ranked for the next turn.
  if (station) return { action: "station", item: station, reason: station.reason, ranked };
  // Look-ahead cues and warnings expire quickly, so they also go before stories.
  const announcement = ranked.find((item) => item.priority === "announcement");
  if (announcement) return { action: "announcement", item: announcement, reason: announcement.reason, ranked };
  const next = ranked.find((item) => item.priority !== "station" && item.priority !== "announcement");
  if (!next) return {
    action: "quiet", ranked,
    reason: positioned ? "no-sourced-stories" : "unknown-location",
  };

  const explicit = next.priority === "pointed";
  const endedAt = input.lastPlayback?.endedAt;
  const elapsed = typeof endedAt === "number" && Number.isFinite(endedAt)
    ? input.now - endedAt : Infinity;
  const pauseMs = input.lastPlayback?.kind === "story" ? PODCAST_AUTO_GAP_MS : PODCAST_BREATH_MS;
  if (!explicit && elapsed >= 0 && elapsed < pauseMs) {
    return { action: "quiet", reason: "breathing-room", ranked,
      until: endedAt! + pauseMs };
  }

  // Skip the welcome if the rider just chose a POI; the response should feel
  // immediate. Never insert a welcome in the middle of a journey.
  if (!explicit && !input.playedKeys.size && !input.lastPlayback &&
    !input.playedKeys.has(PODCAST_INTRO_KEY)) {
    return { action: "intro", key: PODCAST_INTRO_KEY, next, ranked,
      reason: "first available sourced story",
      text: "Welcome aboard. As we travel, let's discover some stories along the way." };
  }

  // Topic continuity is a preference among nearby stories, never a source of
  // factual connective claims. The transition is deliberately generic.
  const previousTopic = cleanTopic(input.previousTopic ?? input.lastPlayback?.topic);
  const transitionKey = `podcast:transition:${next.moment.key}`;
  if (!explicit && input.lastPlayback?.kind === "story" &&
    elapsed >= 0 && elapsed <= 180_000 && previousTopic && next.topic &&
    previousTopic !== next.topic && !input.playedKeys.has(transitionKey)) {
    return { action: "transition", key: transitionKey, next, ranked,
      reason: "changing topics", text: "Let's follow a different thread." };
  }
  return { action: "story", item: next, reason: next.reason, ranked };
}
