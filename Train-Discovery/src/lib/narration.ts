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
