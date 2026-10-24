import { describe, expect, it } from "vitest";
import { narrationText } from "../src/lib/narration";
import type { Place } from "../src/lib/types";

const source = {
  id: "archive",
  title: "Local archive",
  url: "https://example.org/history",
  text: "The building opened in 1901. It was later used as a library.",
  retrievedAt: "2026-10-24",
  license: "CC BY-SA 4.0",
};
const place: Place = {
  id: "history-1",
  name: "Old station",
  lat: 40.7,
  lon: -73.8,
  category: "Heritage",
  routeIds: ["10"],
  sourceUrl: "https://example.org/history",
  tags: { architect: "Unverified person" },
  evidence: [source],
  story: {
    summary: "AI summary that may have extra facts.",
    claims: [{ text: "The building opened in 1901.", evidenceId: "archive", quote: "The building opened in 1901." }],
    verifiedAt: "2026-10-24",
    generator: "test",
    verifier: "test",
    evidenceHash: "test",
  },
};

describe("audio narration", () => {
  it("only speaks the individual sourced claims, without unsourced tags or summary", () => {
    expect(narrationText(place)).toBe("Old station. The building opened in 1901.");
  });

  it("stays silent when there is no verified story", () => {
    expect(narrationText({ ...place, story: undefined })).toBeNull();
  });

  it("rejects an invalid or stale citation", () => {
    expect(narrationText({ ...place, evidence: [{ ...source, text: "The building opened in 1920." }] })).toBeNull();
    expect(narrationText({ ...place, story: { ...place.story!, claims: [{ text: "The building opened in 1901.", quote: "The building opened in 1901.", evidenceId: "invented" }] } })).toBeNull();
  });

  it("reads only the claims that still have matching source passages", () => {
    const story = place.story!;
    const mixed = {
      ...place,
      story: {
        ...story,
        claims: [
          ...story.claims,
          { text: "It stood on the moon in 1830.", evidenceId: "archive", quote: "No evidence supports this claim." },
        ],
      },
    };
    expect(narrationText(mixed)).toBe("Old station. The building opened in 1901.");
  });
});
