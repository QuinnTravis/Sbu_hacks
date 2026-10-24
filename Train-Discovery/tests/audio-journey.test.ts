import { describe, expect, it } from "vitest";
import { chooseAudioMoment, placeAnnouncement, reachedStation, stationAnnouncement } from "../src/lib/audio-journey";
import type { AudioMoment } from "../src/lib/audio-journey";
import type { Place } from "../src/lib/types";

const stop = { id: "102", name: "Jamaica", lat: 40.6996, lon: -73.8085 };
const fix = (lat: number, timestamp = 10000) => ({ lat, lon: stop.lon, accuracy: 5, timestamp });
const station: AudioMoment = { key: "station:102", name: "Jamaica", station: stop,
  request: { type: "station", stationId: "102", routeId: "10" }, fallback: stationAnnouncement(stop), expiresAt: 20000 };
const place: AudioMoment = { key: "place:landmark", name: "Landmark",
  place: { id: "landmark" } as Place, request: { type: "place", placeId: "landmark" }, fallback: station.fallback };

describe("journey audio scheduling", () => {
  it("triggers a nearby station even on the first GPS fix", () => {
    expect(reachedStation(stop, fix(stop.lat), null)).toBe(true);
    expect(reachedStation(stop, fix(stop.lat + 0.004), null)).toBe(false);
  });
  it("catches passing a station between two fresh GPS fixes", () => {
    expect(reachedStation(stop, fix(stop.lat + 0.003, 14000), fix(stop.lat - 0.003))).toBe(true);
  });
  it("does not narrate intervening stations after a stale fix or a replay jump", () => {
    expect(reachedStation(stop, fix(stop.lat + 0.003, 30000), fix(stop.lat - 0.003))).toBe(false);
    expect(reachedStation(stop, fix(stop.lat + 0.02, 14000), fix(stop.lat - 0.02))).toBe(false);
  });
  it("does not confuse passing nearby on a parallel line with crossing the station", () => {
    const a = { ...fix(stop.lat - 0.003), lon: stop.lon + 0.008 };
    const b = { ...fix(stop.lat + 0.003, 14000), lon: stop.lon + 0.008 };
    expect(reachedStation(stop, b, a)).toBe(false);
  });
  it("deduplicates station encounters and drops expired announcements", () => {
    expect(chooseAudioMoment([station], new Set([station.key]), new Set(), 10000)).toBeUndefined();
    expect(chooseAudioMoment([station], new Set(), new Set(), 21000)).toBeUndefined();
  });
  it("honors explicit replay but never replays a discarded place", () => {
    const spoken = new Set([place.key]);
    expect(chooseAudioMoment([station, place], spoken, new Set(), 10000, place.key)).toBe(place);
    expect(chooseAudioMoment([place], spoken, new Set(["landmark"]), 10000, place.key)).toBeUndefined();
  });
  it("announces the known station identity without inventing stop predictions or history", () => {
    expect(stationAnnouncement(stop).text).toBe("Station approaching: Jamaica.");
    expect(stationAnnouncement({ ...stop, name: "Atlantic Terminal" }).text).toBe("Station approaching: Atlantic Terminal.");
  });
});

describe("POI narration contract", () => {
  const quote = "The building opened in 1901.";
  const landmark: Place = { id: "osm-node-1", name: "Old Library", lat: 40.7, lon: -73.8,
    category: "Heritage", routeIds: ["10"], sourceUrl: "https://example.org/history", tags: {},
    evidence: [{ id: "archive", title: "Town archive", url: "https://example.org/history", text: quote,
      retrievedAt: "2026-10-24", license: "CC BY-SA 4.0" }],
    story: { summary: quote, claims: [{ text: quote, quote, evidenceId: "archive" }],
      verifiedAt: "2026-10-24", evidenceHash: "fixture", generator: "fixture", verifier: "fixture" } };

  it("acknowledges pointing and always includes the supported fact", () => {
    const script = placeAnnouncement(landmark, "pointed")!;
    expect(script.text).toMatch(/^(You just pointed at|You're pointing at|That's) Old Library/);
    expect(script.text).toContain(quote);
    expect(script.kind).toBe("verified");
  });
  it("uses varied acknowledgments without adding them to nearby or replay stories", () => {
    const variants = new Set(["p0", "p1", "p2"].map((id) => placeAnnouncement({ ...landmark, id }, "pointed")!.text));
    expect(variants.size).toBe(3);
    for (const context of ["nearby", "replay"] as const)
      expect(placeAnnouncement(landmark, context)!.text).toBe(`Old Library. ${quote}`);
  });
  it("refuses a name-only POI and stale citations, including device fallback", () => {
    expect(placeAnnouncement({ ...landmark, story: undefined, evidence: [] }, "pointed")).toBeNull();
    expect(placeAnnouncement({ ...landmark, evidence: [{ ...landmark.evidence[0], text: "No matching fact." }] }, "pointed")).toBeNull();
  });
  it("allows a clearly attributed source fact when a verified story is unavailable", () => {
    const script = placeAnnouncement({ ...landmark, story: undefined, evidence: [{ ...landmark.evidence[0],
      title: "Old Library", url: "https://en.wikipedia.org/wiki/Old_Library",
      text: "Old Library is a historic building used for education. It opened in 1901." }] }, "pointed")!;
    expect(script.kind).toBe("source");
    expect(script.text).toContain("From Wikipedia:");
    expect(script.text).toContain("It opened in 1901.");
  });
});
