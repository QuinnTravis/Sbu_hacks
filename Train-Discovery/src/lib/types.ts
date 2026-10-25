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
export type Story = {
  summary: string;
  claims: Claim[];
  funFact?: Claim;
  verifiedAt: string;
  generator: string;
  verifier: string;
  evidenceHash: string;
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
};
export type QueueEntry = { place: Place; foundAt: number; distance: number };
/** Enough of a discarded place to recognize another map node for the same site. */
export type DismissedSite = { id: string; name: string; lat: number; lon: number };
export type Ride = {
  routeId: string;
  startedAt: number;
  replay: boolean;
  queue: QueueEntry[];
  dismissed: string[];
  dismissedSites?: DismissedSite[];
};
/** A place kept on the device after the ride. No rider location. */
export type SavedEntry = { place: Place; savedAt: number };
export type Photo = {
  url: string;
  source: "Google Maps" | "Wikimedia Commons";
  sourceUrl: string;
  authors: { displayName: string; uri: string; photoUri?: string }[];
  license?: { name: string; url: string };
};
