import type { Place } from "./types";

// A quote must still exist in its attributed passage before it is read aloud.
// This mirrors the publication gate, including typographic punctuation.
function normalizeQuote(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function narrationText(place: Place): string | null {
  if (!place.story?.claims.length) return null;

  const supported = place.story.claims.filter((claim) => {
    const evidence = place.evidence.find((item) => item.id === claim.evidenceId);
    return (
      evidence?.text &&
      claim.quote.length >= 12 &&
      normalizeQuote(evidence.text).includes(normalizeQuote(claim.quote)) &&
      claim.text.trim().length >= 12
    );
  });

  if (!supported.length) return null;
  return `${place.name}. ${supported.map((claim) => claim.text.trim()).join(" ")}`;
}

export type Narration = {
  text: string;
  kind: "verified" | "source";
};

const GENERIC_WORDS = new Set([
  "a", "and", "at", "building", "center", "church", "collection", "company",
  "county", "house", "historic", "historical", "in", "museum", "new", "of",
  "old", "on", "park", "post", "office", "station", "state", "the", "village",
]);

function titleWords(title: string) {
  return new Set(
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word)),
  );
}

/**
 * A clearly attributed reading of a source's own text. It is intentionally
 * marked unverified and requires a name/title match to avoid unrelated wiki hits.
 */
export function audioNarration(place: Place): Narration | null {
  const verified = narrationText(place);
  if (verified) return { text: verified, kind: "verified" };
  // A story whose citation went stale must fail closed until it is reverified.
  if (place.story) return null;

  const placeWords = titleWords(place.name);
  if (!placeWords.size) return null;
  for (const source of place.evidence) {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      continue;
    }
    if (url.hostname !== "en.wikipedia.org" || !url.pathname.startsWith("/wiki/"))
      continue;
    const sourceWords = titleWords(source.title);
    const overlapping = [...placeWords].filter((word) => sourceWords.has(word));
    if (overlapping.length < Math.min(placeWords.size, 2)) continue;

    const sentences = source.text
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+(?=[A-Z“"0-9])/);
    const excerpt = sentences.slice(0, 2).join(" ");
    if (excerpt.length < 50 || excerpt.length > 420 || !/[.!?]$/.test(excerpt))
      continue;
    return {
      text: `${place.name}. From Wikipedia: ${excerpt}`,
      kind: "source",
    };
  }
  return null;
}
