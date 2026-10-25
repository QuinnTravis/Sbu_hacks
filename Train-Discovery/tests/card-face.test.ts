import { describe, expect, it } from "vitest";
import { cardSummary } from "../src/lib/card-face";
import type { Place } from "../src/lib/types";

const place = (patch: Partial<Place>): Place => ({
  id: "osm-node-1",
  name: "King Manor Museum",
  lat: 40.7,
  lon: -73.8,
  category: "Heritage",
  routeIds: ["10"],
  sourceUrl: "https://example.org/place",
  tags: {},
  evidence: [],
  ...patch,
});

describe("cardSummary", () => {
  it("prefers the verified summary", () => {
    const summary = cardSummary(place({
      story: {
        summary: "King Manor is a historic house in Jamaica.",
        claims: [{ text: "A different claim that is long enough.", evidenceId: "e", quote: "A different claim that is long enough." }],
        verifiedAt: "2026-10-24T00:00:00Z",
        generator: "test",
        verifier: "test",
        evidenceHash: "x",
      },
    }));
    expect(summary).toEqual({ text: "King Manor is a historic house in Jamaica.", kind: "verified" });
  });

  it("uses a matched source excerpt when no story is published", () => {
    const summary = cardSummary(place({
      evidence: [{
        id: "wiki",
        title: "King Manor",
        url: "https://en.wikipedia.org/wiki/King_Manor",
        text: "King Manor is a historic house in Jamaica, Queens, New York City. It houses a museum devoted to local history.",
        retrievedAt: "2026-10-24T00:00:00Z",
        license: "CC BY-SA 4.0",
      }],
    }));
    expect(summary?.kind).toBe("source");
    expect(summary?.text).toContain("historic house");
  });

  it("returns nothing to invent when the place has no sourced text", () => {
    expect(cardSummary(place({}))).toBeNull();
  });
});
