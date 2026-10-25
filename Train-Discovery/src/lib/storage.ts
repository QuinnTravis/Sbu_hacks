import { z } from "zod";
import type { Ride, SavedEntry } from "./types";

const dismissedSite = z.object({
  id: z.string(),
  name: z.string().max(500),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const evidence = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url().startsWith("https://"),
  text: z.string().max(16000),
  retrievedAt: z.string(),
  license: z.string(),
  sourceType: z.enum(["search-snippet"]).optional(),
});
const claim = z.object({ text: z.string(), evidenceId: z.string(), quote: z.string() });
export const placeSchema = z.object({
  id: z.string(),
  name: z.string().max(500),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  category: z.string(),
  routeIds: z.array(z.string()),
  wikipedia: z.string().optional(),
  wikidata: z.string().optional(),
  sourceUrl: z.url().startsWith("https://"),
  tags: z.record(z.string(), z.string()),
  evidence: z.array(evidence).max(20),
  story: z
    .object({
      summary: z.string().max(1200).default(""),
      claims: z.array(claim).max(4),
      funFact: claim.optional(),
      narration: z
        .object({
          hook: claim.optional(),
          detail: claim.optional(),
          why: claim.optional(),
          lookFor: claim.optional(),
        })
        .optional(),
      verifiedAt: z.string(),
      generator: z.string(),
      verifier: z.string(),
      evidenceHash: z.string(),
    })
    .optional(),
  kind: z.enum(["poi", "place"]).optional(),
  routeKm: z.number().optional(),
  lateralM: z.number().optional(),
  signedLateralM: z.number().optional(),
  extentKm: z.tuple([z.number(), z.number()]).optional(),
  areaKind: z.string().max(40).optional(),
  fame: z.number().optional(),
  basic: z
    .object({
      type: z.string().max(40),
      elevationM: z.number().optional(),
      population: z.number().optional(),
      sources: z.array(z.object({ title: z.string(), url: z.string(), license: z.string() })).max(4),
    })
    .optional(),
});
const rideSchema = z.object({
  routeId: z.string(),
  networkId: z.string().optional(),
  startedAt: z.number(),
  replay: z.boolean(),
  dismissed: z.array(z.string()).max(10000),
  dismissedSites: z.array(dismissedSite).max(10000).optional(),
  queue: z
    .array(z.object({ place: placeSchema, foundAt: z.number(), distance: z.number() }))
    .max(2000),
});

export const STORAGE_KEY = "gaze:ride:v1";
/** Bookmarks. Saved discoveries from before the rename are migrated into it. */
export const SAVED_KEY = "gaze:bookmarks:v1";
export const LEGACY_RIDE_KEY = "train-discovery:ride:v1";
export const LEGACY_SAVED_KEY = "train-discovery:saved:v1";

const savedSchema = z
  .array(
    z.object({
      savedAt: z.number(),
      place: placeSchema,
      routeId: z.string().optional(),
      networkId: z.string().optional(),
      note: z.string().max(500).optional(),
      discoveredAt: z.number().optional(),
    }),
  )
  .max(500);

/** Read `key`, or move the value from `legacy` to `key` once. */
function readMigrating(key: string, legacy: string, limit: number): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current.length > limit ? null : current;
  const old = localStorage.getItem(legacy);
  if (old === null || old.length > limit) return null;
  try {
    localStorage.setItem(key, old);
    localStorage.removeItem(legacy);
  } catch {
    // Keep reading the legacy key until storage frees up.
  }
  return old;
}

export function readRide(): Ride | null {
  try {
    const raw = readMigrating(STORAGE_KEY, LEGACY_RIDE_KEY, 15_000_000);
    if (!raw) return null;
    const parsed = rideSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function writeRide(ride: Ride | null): boolean {
  try {
    if (ride) localStorage.setItem(STORAGE_KEY, JSON.stringify(ride));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readSaved(): SavedEntry[] {
  try {
    const raw = readMigrating(SAVED_KEY, LEGACY_SAVED_KEY, 8_000_000);
    if (!raw) return [];
    const parsed = savedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // Entries saved before networks existed came from LIRR rides.
    return parsed.data.map((entry) => ({
      ...entry,
      networkId: entry.networkId ?? (entry.place.routeIds.some((id) => /^cz-/.test(id)) ? "california-zephyr" : "lirr"),
      routeId: entry.routeId ?? entry.place.routeIds[0],
    }));
  } catch {
    return [];
  }
}

export function writeSaved(entries: SavedEntry[]): boolean {
  try {
    if (!entries.length) {
      localStorage.removeItem(SAVED_KEY);
      return true;
    }
    const parsed = savedSchema.safeParse(entries);
    if (!parsed.success) return false;
    const payload = JSON.stringify(parsed.data);
    if (payload.length > 8_000_000) return false;
    localStorage.setItem(SAVED_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

export const readBookmarks = readSaved;
export const writeBookmarks = writeSaved;
