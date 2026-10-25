export type Coordinate = { lat: number; lon: number };
export type Position = Coordinate & { accuracy: number; timestamp: number };
export type RailRoute = {
  id: string;
  name: string;
  color: string;
  paths: [number, number][][];
  stops: (Coordinate & { id: string; name: string })[];
  geometrySource?: string;
  serviceNote?: string;
  /** Segment rides: "full" carries places and stories, "basic" announces stations. */
  experience?: "full" | "basic";
  /** Timetable minutes from the first stop, canonical direction. */
  schedule?: { stopId: string; minutes: number }[];
};
export type RailData = {
  source: string;
  importedAt: string;
  version: string;
  routes: RailRoute[];
};
export type Evidence = {
  id: string;
  title: string;
  url: string;
  text: string;
  retrievedAt: string;
  license: string;
  sourceType?: "search-snippet";
};
export type Claim = { text: string; evidenceId: string; quote: string };
/** A spoken script in parts; each part is an individually verified claim. */
export type StoryNarration = { hook?: Claim; detail?: Claim; why?: Claim; lookFor?: Claim };
export type Story = {
  summary: string;
  claims: Claim[];
  funFact?: Claim;
  narration?: StoryNarration;
  verifiedAt: string;
  generator: string;
  verifier: string;
  evidenceHash: string;
};
/** Facts for a one-line geography mention, straight from map and Wikidata fields. */
export type BasicFacts = {
  /** Kind of feature, as a locale key suffix: "town", "peak", "river", … */
  type: string;
  elevationM?: number;
  population?: number;
  sources: { title: string; url: string; license: string }[];
};
export type Place = Coordinate & {
  id: string;
  name: string;
  category: string;
  routeIds: string[];
  wikipedia?: string;
  wikidata?: string;
  sourceUrl: string;
  tags: Record<string, string>;
  evidence: Evidence[];
  story?: Story;
  /** "poi" is curated for pointing and look-ahead; "place" is a named place mentioned in passing. */
  kind?: "poi" | "place";
  /** Kilometers along the ride at the closest approach (canonical direction). */
  routeKm?: number;
  /** Meters from the track at the closest approach. */
  lateralM?: number;
  /** Positive when left of a forward-facing passenger traveling in the canonical direction. */
  signedLateralM?: number;
  /** Stretch of the ride a long feature spans, e.g. a canyon or tunnel. */
  extentKm?: [number, number];
  /** Feature shape for side labels: canyon, river, valley, town, lake, forest, park. */
  areaKind?: string;
  /** Wikipedia language editions describing the place (Wikidata sitelinks). */
  fame?: number;
  basic?: BasicFacts;
  /** Building outline as [lat, lon] pairs, for a simplified 3D model. */
  footprint?: [number, number][];
  heightM?: number;
};
export type QueueEntry = { place: Place; foundAt: number; distance: number };
/** Enough of a discarded place to recognize another map node for the same site. */
export type DismissedSite = { id: string; name: string; lat: number; lon: number };
export type Ride = {
  routeId: string;
  networkId?: string;
  startedAt: number;
  replay: boolean;
  queue: QueueEntry[];
  dismissed: string[];
  dismissedSites?: DismissedSite[];
};
/** A bookmark: a place kept on the device, reached or not. No rider location. */
export type SavedEntry = {
  place: Place;
  savedAt: number;
  routeId?: string;
  networkId?: string;
  note?: string;
  /** When the rider pointed at or heard this place. */
  discoveredAt?: number;
};
export type Photo = {
  url: string;
  source: "Google Maps" | "Wikimedia Commons";
  sourceUrl: string;
  authors: { displayName: string; uri: string }[];
  license?: { name: string; url: string };
};
