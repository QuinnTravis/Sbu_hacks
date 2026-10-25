import type { Place } from "./types";

/** Data contracts for a route package (spec §13.1), adapted to the existing Place type. */

export type ConnectivityZone = {
  id: string;
  startKm: number;
  endKm: number;
  reason: "tunnel" | "canyon" | "remote" | "observed";
  confidence: "high" | "medium" | "low";
  source: string;
  poiIds: string[];
  /** Area name for the warning, e.g. "Moffat Tunnel". */
  name?: string;
};

export type AirQualityZone = {
  id: string;
  startKm: number;
  endKm: number;
  aqi: number;
  category: AqiCategory;
  dominantPollutant?: string;
  fetchedAt: string;
  source: string;
  simulated?: boolean;
};

export type AqiCategory = "good" | "moderate" | "usg" | "unhealthy" | "veryUnhealthy" | "hazardous";

export type AirQualitySnapshot = {
  zones: AirQualityZone[];
  fetchedAt: string;
  source: string;
  attribution: { label: string; url: string }[];
};

export type HistoricImage = {
  id: string;
  poiId: string;
  url: string;
  thumbUrl?: string;
  year?: number;
  /** e.g. "c. 1930" */
  yearLabel: string;
  caption: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  focal?: { x: number; y: number; scale: number };
  /** A modern photo of the same view, when one was curated. */
  present?: { url: string; credit: string; license: string; licenseUrl?: string; sourceUrl: string; focal?: { x: number; y: number; scale: number } };
};

export type ModelManifest = {
  poiId: string;
  kind: "curated" | "procedural" | "ai";
  url?: string;
  license?: string;
  author?: string;
  sourceUrl?: string;
  illustrative: boolean;
};

export type ContentClaim = { id: string; text: string; evidence: { sourceUrl: string; passage: string }[] };

/** One per (poiId, locale). English content is derived from the verified story. */
export type PoiContent = {
  poiId: string;
  locale: string;
  title: string;
  summary: string;
  /** Spoken story body: hook, detail, why it matters. */
  transcript: string;
  /** What to look for, as a phrase; the side comes from geometry at runtime. */
  lookFor?: string;
  claims: ContentClaim[];
  sources: { title: string; url: string }[];
};

export type NarratorClip = { url: string; voiceId: string; durationS: number; text: string; language: string };

export type Thumbnail = { url: string; credit: string; license: string; sourceUrl: string };

export type JourneyPackage = {
  places: Place[];
  updatedAt: string;
  networkId: string;
  routeId: string;
  /** Stops in ride order with timetable minutes, for side-advisor timing. */
  timetable?: { stopId: string; km: number; minutes: number }[];
  connectivity?: ConnectivityZone[];
  airQuality?: AirQualitySnapshot | null;
  history?: HistoricImage[];
  models?: ModelManifest[];
  thumbnails?: Record<string, Thumbnail>;
  locale?: string;
  /** Localized content for `locale`, keyed by POI id. English comes from the verified story. */
  content?: Record<string, PoiContent>;
  /** Pre-generated narrator clips, keyed by clipKey(text, language). */
  clips?: Record<string, NarratorClip>;
};
