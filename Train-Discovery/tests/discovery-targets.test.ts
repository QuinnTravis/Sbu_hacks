import { describe, expect, it } from "vitest";
import { chooseReplayTarget, holdCandidateRows, isDismissed, rankPointingCandidates, replayCatalogStatus, replayPriority, sameDiscoverySite } from "../src/lib/discovery-targets";
import { dismiss } from "../src/lib/dismiss";
import { bearing, distance } from "../src/lib/geo";
import type { Place, Ride } from "../src/lib/types";

const center = { lat: 40.6996, lon: -73.8085 };
const source = {
  id: "wiki-1",
  title: "King Manor",
  url: "https://en.wikipedia.org/wiki/King_Manor",
  text: "King Manor is a historic house in Queens, New York City. The house was used as a museum in later years.",
  retrievedAt: "2026-10-24T00:00:00Z",
  license: "CC BY-SA",
};
const jamaicaSource = {
  ...source, title: "Jamaica station",
  text: "Jamaica station is a major rail transit hub in Queens, New York City. Thousands of commuters use its platforms every day.",
};
const place = (id: string, name: string, latOffset: number, category = "History"): Place => ({
  id, name, lat: center.lat + latOffset, lon: center.lon, category,
  routeIds: ["10"], sourceUrl: `https://www.openstreetmap.org/node/${id}`,
  tags: {}, evidence: [],
});
const jamaica = {
  ...place("station-1", "Jamaica", 0.0006, "Railway history"),
  evidence: [jamaicaSource],
  story: {
    summary: "Jamaica station is a major rail transit hub in Queens, New York City.",
    claims: [{ text: "Jamaica station is a major rail transit hub in Queens, New York City.",
      quote: "Jamaica station is a major rail transit hub in Queens, New York City.", evidenceId: "wiki-1" }],
    funFact: { text: "Thousands of commuters use its platforms every day.",
      quote: "Thousands of commuters use its platforms every day.", evidenceId: "wiki-1" },
    verifiedAt: "2026-10-24T00:00:00Z", generator: "test", verifier: "test", evidenceHash: "test",
  },
};
const manor = { ...place("manor-1", "King Manor Museum", 0.0049, "Art & culture"), evidence: [source] };
const subway = { ...place("subway-1", "King Manor station", 0.0005, "Railway history"), evidence: [source] };
const plain = place("plain-1", "Johnson Yard", 0.0004, "Infrastructure");
const duplicate = place("station-2", "Jamaica", 0.0007, "Railway history");
const ride: Ride = { routeId: "10", startedAt: 1, replay: true, dismissed: [] };

describe("demo discovery selection", () => {
  it("prefers verified stories, then a sourced landmark, ahead of closer station metadata", () => {
    const candidates = [plain, duplicate, subway, manor, jamaica];
    const byId = new Map<string, Place>(candidates.map((candidate) => [candidate.id, candidate]));
    expect(replayPriority(jamaica)).toBe(3);
    expect(replayPriority(manor)).toBe(2);
    expect(replayPriority(subway)).toBe(1);
    expect(replayPriority(plain)).toBe(0);
    expect(chooseReplayTarget(candidates, ride, center, byId)?.id).toBe(jamaica.id);
    const afterJamaica = dismiss(ride, jamaica);
    expect(chooseReplayTarget(candidates, afterJamaica, center, byId)?.id).toBe(manor.id);
    const afterManor = dismiss(afterJamaica, manor);
    expect(chooseReplayTarget(candidates, afterManor, center, byId)?.id).toBe(subway.id);
  });

  it("treats nearby same-name nodes as a single discovery, including dismissed nodes", () => {
    expect(sameDiscoverySite(jamaica, duplicate)).toBe(true);
    expect(sameDiscoverySite(jamaica, { ...duplicate, lat: 40.71 })).toBe(false);
    expect(sameDiscoverySite(jamaica, { ...duplicate, name: "Jamaica Avenue" })).toBe(false);
    const catalog = new Map<string, Place>([[jamaica.id, jamaica], [duplicate.id, duplicate]]);
    expect(isDismissed(duplicate, { ...ride, dismissed: [jamaica.id] }, catalog)).toBe(true);
    // A remembered site still hides a sibling node that is not in the loaded catalog.
    expect(isDismissed(duplicate, dismiss(ride, jamaica), new Map())).toBe(true);
    expect(isDismissed(manor, dismiss(ride, jamaica), new Map())).toBe(false);
  });

  it("does not aim at an unsupported place or unrelated Wikipedia article", () => {
    const falseMatch = { ...manor, evidence: [{ ...source, title: "Jamaica station" }] };
    const candidates = [falseMatch, plain];
    expect(chooseReplayTarget(candidates, ride, center, new Map<string, Place>(candidates.map((p) => [p.id, p])))).toBeNull();
  });

  it("stays inside the pointing range and reports loading, failure, and empty aim", () => {
    const north = (meters: number): Place => ({
      ...jamaica,
      id: `north-${meters}`,
      lat: center.lat + (meters / 6371008.8) * (180 / Math.PI),
    });
    const near = north(1100);
    const far = north(1300);
    expect(distance(center, near)).toBeLessThanOrEqual(1200);
    expect(distance(center, far)).toBeGreaterThan(1200);
    const byId = new Map<string, Place>([[near.id, near], [far.id, far]]);
    expect(chooseReplayTarget([far], ride, center, byId)).toBeNull();
    expect(chooseReplayTarget([near, far], ride, center, byId)?.id).toBe(near.id);
    expect(chooseReplayTarget([], ride, center, new Map())).toBeNull();

    expect(replayCatalogStatus(false, true, null, "ready")).toBeNull();
    expect(replayCatalogStatus(true, false, null, "ready")).toBeNull();
    expect(replayCatalogStatus(true, true, null, "idle")).toBe("loading");
    expect(replayCatalogStatus(true, true, null, "loading")).toBe("loading");
    expect(replayCatalogStatus(true, true, jamaica, "error")).toBe("unavailable");
    expect(replayCatalogStatus(true, true, jamaica, "ready")).toBeNull();
    expect(replayCatalogStatus(true, true, null, "ready")).toBe("empty");
    expect(replayCatalogStatus(true, true, null, "cached")).toBe("empty");
  });
});

describe("pointing candidates", () => {
  const heading = bearing(center, jamaica);
  const by = (places: Place[]) => new Map(places.map((item) => [item.id, item]));

  it("ranks by angular alignment, then distance, and keeps at most four", () => {
    const aligned = { ...jamaica, id: "aligned", lat: center.lat + 0.004, lon: center.lon };
    const closer = { ...place("closer", "Closer hall", 0.0009), lon: center.lon + 0.00035 };
    const outside = { ...place("outside", "Side yard", 0.0004), lon: center.lon + 0.003 };
    const extras = [0, 1, 2, 3].map((index) => ({
      ...place(`extra-${index}`, `Extra ${index}`, 0.002 + index * 0.0004),
      lon: center.lon + index * 0.00004,
    }));
    const candidates = [closer, outside, aligned];
    const ranked = rankPointingCandidates(candidates, center, heading, ride, by(candidates));
    expect(ranked.map((item) => item.place.id)).not.toContain("outside");
    expect(ranked[0]?.place.id).toBe("aligned");
    expect(ranked[0]!.alignment).toBeLessThan(ranked.find((item) => item.place.id === "closer")!.alignment);
    expect(ranked[0]!.meters).toBeGreaterThan(ranked.find((item) => item.place.id === "closer")!.meters);
    expect(rankPointingCandidates([aligned, ...extras], center, heading, ride, by([aligned, ...extras]))).toHaveLength(4);
    expect(ride.dismissed).toHaveLength(0);
  });

  it("lists the sourced node for a duplicate site and hides a place the rider is not interested in", () => {
    const candidates = [duplicate, jamaica, manor];
    const ranked = rankPointingCandidates(candidates, center, heading, ride, by(candidates));
    expect(ranked.map((item) => item.place.id)).toContain("station-1");
    expect(ranked.map((item) => item.place.id)).not.toContain("station-2");
    expect(ranked.every((item) => item.place.id !== "plain-1")).toBe(true);
    const chosen = ranked.find((item) => item.place.id === jamaica.id)!;
    expect(rankPointingCandidates(candidates, center, heading, ride, by(candidates)).map((item) => item.place.id)).toContain(chosen.place.id);
    const hidden = dismiss(ride, chosen.place);
    expect(rankPointingCandidates(candidates, center, heading, hidden, by(candidates)).map((item) => item.place.id)).not.toContain(jamaica.id);
    expect(rankPointingCandidates(candidates, center, null, ride, by(candidates))).toEqual([]);
  });

  it("keeps the engaged rows when the live aim changes", () => {
    const first = [
      { place: jamaica, meters: 60, alignment: 2 },
      { place: manor, meters: 400, alignment: 8 },
    ];
    const moved = [{ place: manor, meters: 380, alignment: 1 }];
    expect(holdCandidateRows(moved, first, true)).toEqual(first);
    expect(holdCandidateRows(moved, first, false)).toEqual(moved);
    expect(holdCandidateRows(moved, null, true)).toEqual(moved);
  });
});
