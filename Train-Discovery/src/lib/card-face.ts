import { sourceExcerpt } from "./narration";
import type { Place } from "./types";

export type CardSummary = { text: string; kind: "verified" | "source" };

/** Text a rider can read on a card. Verified summary first, then a matched source excerpt. */
export function cardSummary(place: Place): CardSummary | null {
  const written = place.story?.summary?.trim();
  if (written && written.length >= 12) return { text: written, kind: "verified" };
  const claims = (place.story?.claims ?? [])
    .map((claim) => claim.text.trim())
    .filter((text) => text.length >= 12);
  if (claims.length) return { text: claims.join(" "), kind: "verified" };
  const excerpt = sourceExcerpt(place);
  if (excerpt) return { text: excerpt.text, kind: "source" };
  return null;
}
