import "server-only";
import { evidenceHash, verifyPlace } from "./verification";
import type { Evidence, Place, Story } from "./types";

export type CheckedStory = { story: Story; evidence: Evidence[] };

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { expiresAt: number; result: CheckedStory | null }>();
const pending = new Map<string, Promise<CheckedStory | null>>();

/** A published story when it still matches its sources; otherwise one checked now and kept for a day. */
export async function storyFor(place: Place, timeoutMs = 25000): Promise<CheckedStory | null> {
  if (place.story && place.story.evidenceHash === evidenceHash(place.evidence))
    return { story: place.story, evidence: place.evidence };
  const cached = cache.get(place.id);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const running = pending.get(place.id);
  if (running) return running;
  const work = verifyPlace({ ...place, story: undefined }, timeoutMs)
    .then((result) => result ?? null)
    .catch((error: unknown) => {
      console.warn(`Story check failed for ${place.id}: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`);
      return null;
    })
    .then((result) => {
      cache.set(place.id, { result, expiresAt: Date.now() + (result ? STORY_TTL_MS : FAILURE_TTL_MS) });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      return result;
    });
  pending.set(place.id, work);
  try {
    return await work;
  } finally {
    pending.delete(place.id);
  }
}

/** The place with its checked story merged in, or unchanged when none could be checked. */
export async function withStory(place: Place): Promise<Place> {
  const found = await storyFor(place);
  return found ? { ...place, story: found.story, evidence: found.evidence } : place;
}
