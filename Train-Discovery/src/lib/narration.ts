import type { Evidence, Place } from "./types";

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

  const supported = place.story.claims.filter((claim) => narrationClaimSupported(place, claim));

  if (!supported.length) return null;
  return `${place.name}. ${supported.map((claim) => claim.text.trim()).join(" ")}`;
}

export function narrationClaimSupported(place: Place, claim: NonNullable<Place["story"]>["claims"][number]): boolean {
  const evidence = place.evidence.find((item) => item.id === claim.evidenceId);
  return Boolean(
    evidence?.text &&
    claim.quote.length >= 12 &&
    normalizeQuote(evidence.text).includes(normalizeQuote(claim.quote)) &&
    claim.text.trim().length >= 12
  );
}

export type Narration = {
  text: string;
  kind: "verified" | "source";
};

export type SourceExcerpt = { text: string; evidence: Evidence };

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

/** Source identity gate, independent of how short a reading can be made. */
export function audioEvidence(place: Place): Evidence[] {
  // A story whose citation went stale must fail closed until it is reverified.
  if (place.story) return [];

  const placeWords = titleWords(place.name);
  if (!placeWords.size) return [];
  return place.evidence.filter((source) => {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      return false;
    }
    if (url.hostname !== "en.wikipedia.org" || !url.pathname.startsWith("/wiki/"))
      return false;
    const sourceWords = titleWords(source.title);
    const overlapping = [...placeWords].filter((word) => sourceWords.has(word));
    return overlapping.length >= Math.min(placeWords.size, 2);
  });
}

/** Return a short, attributed excerpt only when the Wikipedia title matches. */
export function sourceExcerpt(place: Place, maxWords = 35): SourceExcerpt | null {
  for (const source of audioEvidence(place)) {
    const sentences = source.text
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+(?=[A-Z“"0-9])/);
    const fullExcerpt = sentences.slice(0, 2).join(" ");
    if (
      fullExcerpt.length < 50 ||
      fullExcerpt.length > 420 ||
      !/[.!?]$/.test(fullExcerpt)
    )
      continue;
    let excerpt = fullExcerpt;
    if (fullExcerpt.split(/\s+/).length > maxWords) {
      const excerptSentences = sentences.slice(0, 2);
      const start = excerptSentences.findIndex(
        (sentence) => sentence.split(/\s+/).length <= maxWords,
      );
      if (start < 0) continue;
      excerpt = excerptSentences[start];
      const next = excerptSentences[start + 1];
      if (next && `${excerpt} ${next}`.split(/\s+/).length <= maxWords)
        excerpt = `${excerpt} ${next}`;
    }
    if (!/[.!?]$/.test(excerpt) || excerpt.length > 420) continue;
    return { text: excerpt, evidence: source };
  }
  return null;
}

export function audioNarration(place: Place): Narration | null {
  const verified = narrationText(place);
  if (verified) return { text: verified, kind: "verified" };
  const excerpt = sourceExcerpt(place, Infinity);
  if (excerpt) {
    return {
      text: `${place.name}. From Wikipedia: ${excerpt.text}`,
      kind: "source",
    };
  }
  return null;
}
