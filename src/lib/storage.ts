import { z } from "zod";
import type { Ride } from "./types";

const evidence = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url().startsWith("https://"),
  text: z.string().max(16000),
  retrievedAt: z.string(),
  license: z.string(),
});
const place = z.object({
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
      claims: z
        .array(
          z.object({
            text: z.string(),
            evidenceId: z.string(),
            quote: z.string(),
          }),
        )
        .max(4),
      verifiedAt: z.string(),
      generator: z.string(),
      verifier: z.string(),
      evidenceHash: z.string(),
    })
    .optional(),
});
const rideSchema = z.object({
  routeId: z.string(),
  startedAt: z.number(),
  replay: z.boolean(),
  dismissed: z.array(z.string()).max(10000),
  queue: z
    .array(z.object({ place, foundAt: z.number(), distance: z.number() }))
    .max(2000),
});
export const STORAGE_KEY = "train-discovery:ride:v1";

export function readRide(): Ride | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 15_000_000) return null;
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
