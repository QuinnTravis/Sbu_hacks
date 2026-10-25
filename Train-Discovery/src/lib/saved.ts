import { sameDiscoverySite } from "./discovery-targets";
import type { Claim, Evidence, Place, QueueEntry, SavedEntry, Story } from "./types";

const MAX_SAVED = 500;

function storyScore(place: Place): number {
  const story = place.story;
  if (!story) return 0;
  const evidence = place.evidence ?? [];
  const claims = (story.claims ?? []).filter((claim) => claim.text.trim().length >= 12 && claim.quote.trim().length >= 12);
  const fact = story.funFact && story.funFact.text.trim().length >= 12 && story.funFact.quote.trim().length >= 12 ? 1 : 0;
  const summary = (story.summary ?? "").trim().length >= 12 ? 1 : 0;
  const cited = new Set(claims.map((claim) => claim.evidenceId));
  if (fact && story.funFact) cited.add(story.funFact.evidenceId);
  const citedPresent = evidence.filter((item) => cited.has(item.id) && item.text.trim().length > 0).length;
  return claims.length * 100 + fact * 40 + summary * 10 + citedPresent;
}

function unionEvidence(primary: Evidence[], extra: Evidence[]): Evidence[] {
  const seen = new Set(primary.map((item) => item.id));
  return [...primary, ...extra.filter((item) => !seen.has(item.id))].slice(0, 20);
}

const copyClaim = (claim: Claim): Claim => ({ text: claim.text, evidenceId: claim.evidenceId, quote: claim.quote });

function persistStory(story: Story): Story {
  const funFact = story.funFact ? copyClaim(story.funFact) : undefined;
  const narration = story.narration
    ? Object.fromEntries(
        Object.entries(story.narration)
          .filter((entry): entry is [string, Claim] => Boolean(entry[1]))
          .map(([part, claim]) => [part, copyClaim(claim)]),
      )
    : undefined;
  return {
    summary: (story.summary ?? "").slice(0, 1200),
    claims: (story.claims ?? []).slice(0, 4).map(copyClaim),
    ...(funFact ? { funFact } : {}),
    ...(narration && Object.keys(narration).length ? { narration } : {}),
    verifiedAt: story.verifiedAt,
    generator: story.generator,
    verifier: story.verifier,
    evidenceHash: story.evidenceHash,
  };
}

/** Place fields worth keeping. Photo bytes, photo URLs, and audio URLs are omitted. */
export function persistablePlace(place: Place): Place {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(place.tags ?? {})) {
    if (typeof value === "string") tags[key] = value;
  }
  const story = place.story ? persistStory(place.story) : undefined;
  return {
    id: place.id,
    name: place.name.slice(0, 500),
    lat: place.lat,
    lon: place.lon,
    category: place.category,
    routeIds: place.routeIds ?? [],
    ...(place.wikipedia ? { wikipedia: place.wikipedia } : {}),
    ...(place.wikidata ? { wikidata: place.wikidata } : {}),
    sourceUrl: place.sourceUrl,
    tags,
    evidence: (place.evidence ?? []).slice(0, 20).map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      text: item.text.slice(0, 16000),
      retrievedAt: item.retrievedAt,
      license: item.license,
      ...(item.sourceType ? { sourceType: item.sourceType } : {}),
    })),
    ...(story ? { story } : {}),
    ...(place.kind ? { kind: place.kind } : {}),
    ...(typeof place.routeKm === "number" ? { routeKm: place.routeKm } : {}),
    ...(typeof place.lateralM === "number" ? { lateralM: place.lateralM } : {}),
    ...(typeof place.signedLateralM === "number" ? { signedLateralM: place.signedLateralM } : {}),
    ...(place.extentKm ? { extentKm: [place.extentKm[0], place.extentKm[1]] as [number, number] } : {}),
    ...(place.areaKind ? { areaKind: place.areaKind } : {}),
    ...(typeof place.fame === "number" ? { fame: place.fame } : {}),
    ...(place.basic ? { basic: { ...place.basic, sources: place.basic.sources.slice(0, 4) } } : {}),
  };
}

/** Keep the checked story and the passages it cites when the other record is thinner. */
export function keepRicherStory(local: Place, incoming: Place): Place {
  if (storyScore(incoming) > storyScore(local)) {
    return persistablePlace({
      ...incoming,
      story: incoming.story,
      evidence: unionEvidence(incoming.evidence ?? [], local.evidence ?? []),
    });
  }
  const extra = (incoming.evidence ?? []).filter((item) => !(local.evidence ?? []).some((current) => current.id === item.id));
  if (!extra.length) return local;
  return persistablePlace({
    ...local,
    story: local.story ?? incoming.story,
    evidence: unionEvidence(local.evidence ?? [], extra),
  });
}

export function isSaved(library: SavedEntry[], place: Place): boolean {
  return library.some((entry) => sameDiscoverySite(entry.place, place));
}

export type BookmarkMeta = { routeId?: string; networkId?: string; discoveredAt?: number };

export function savePlace(
  library: SavedEntry[],
  place: Place,
  now = Date.now(),
  meta: BookmarkMeta = {},
): SavedEntry[] {
  const stored = persistablePlace(place);
  const index = library.findIndex((entry) => sameDiscoverySite(entry.place, stored));
  if (index < 0) {
    if (library.length >= MAX_SAVED) return library;
    const extra = Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
    return [...library, { place: stored, savedAt: now, ...extra }];
  }
  const merged = keepRicherStory(library[index].place, stored);
  if (merged === library[index].place) return library;
  const next = library.slice();
  next[index] = { ...library[index], place: merged };
  return next;
}

/** Note that a bookmarked place was pointed at or heard. Unbookmarked places are left alone. */
export function markDiscovered(library: SavedEntry[], place: Place, now = Date.now()): SavedEntry[] {
  const index = library.findIndex((entry) => sameDiscoverySite(entry.place, place));
  if (index < 0 || library[index].discoveredAt) return library;
  const next = library.slice();
  next[index] = { ...library[index], discoveredAt: now };
  return next;
}

export function unsavePlace(library: SavedEntry[], place: Place): SavedEntry[] {
  const next = library.filter((entry) => !sameDiscoverySite(entry.place, place));
  return next.length === library.length ? library : next;
}

/** Copy a story already produced for this place. Does not add a place that was not saved. */
export function mergeSavedNarration(library: SavedEntry[], narrated: Place): SavedEntry[] {
  if (!narrated.story) return library;
  const index = library.findIndex((entry) => sameDiscoverySite(entry.place, narrated));
  if (index < 0) return library;
  const current = library[index].place;
  if (
    current.id === narrated.id &&
    current.story?.verifiedAt === narrated.story.verifiedAt &&
    current.story?.evidenceHash === narrated.story.evidenceHash
  ) return library;
  const next = library.slice();
  next[index] = { ...library[index], place: persistablePlace(narrated) };
  return next;
}

export function refreshSaved(library: SavedEntry[], catalog: Place[]): SavedEntry[] {
  let changed = false;
  const next = library.map((entry) => {
    const incoming = catalog.find((place) => place.id === entry.place.id)
      ?? catalog.find((place) => sameDiscoverySite(place, entry.place));
    if (!incoming) return entry;
    const place = keepRicherStory(entry.place, incoming);
    if (place === entry.place) return entry;
    changed = true;
    return { ...entry, place };
  });
  return changed ? next : library;
}

/** Overlay saved and in-memory stories onto a catalog response without dropping the richer one. */
export function mergeCatalogPlaces(current: Place[], catalog: Place[], saved: SavedEntry[]): Place[] {
  return catalog.map((place) => {
    const previous = current.find((item) => item.id === place.id);
    const withLocal = previous ? keepRicherStory(previous, place) : place;
    const savedPlace = saved.find((entry) => sameDiscoverySite(entry.place, place))?.place;
    return savedPlace ? keepRicherStory(withLocal, savedPlace) : withLocal;
  });
}

export function refreshQueuedPlaces(
  queue: QueueEntry[],
  catalog: Place[],
  saved: SavedEntry[] = [],
): QueueEntry[] {
  const byId = new Map(catalog.map((place) => [place.id, place]));
  let changed = false;
  const next = queue.map((entry) => {
    let place = entry.place;
    const fromCatalog = byId.get(entry.place.id);
    if (fromCatalog) place = keepRicherStory(place, fromCatalog);
    const fromSaved = saved.find((item) => sameDiscoverySite(item.place, place))?.place;
    if (fromSaved) place = keepRicherStory(place, fromSaved);
    if (place === entry.place) return entry;
    changed = true;
    return { ...entry, place };
  });
  return changed ? next : queue;
}
