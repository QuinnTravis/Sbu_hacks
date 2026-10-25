import { describe, expect, it } from "vitest";
import {
  chooseAudioMoment, deviceSpeechResume, isActivePlayback, journeyMoment, narrationFact, nextNarration, placeAnnouncement, playbackSegments,
  playNowSelection, pointingContext, preparationOrder, reachedStation, sentenceGapElapsed, stationAnnouncement,
} from "../src/lib/audio-journey";
import type { AudioMoment, PendingStation } from "../src/lib/audio-journey";
import type { Place } from "../src/lib/types";

const stop = { id: "102", name: "Jamaica", lat: 40.6996, lon: -73.8085 };
const fix = (lat: number, timestamp = 10000) => ({ lat, lon: stop.lon, accuracy: 5, timestamp });
const station: AudioMoment = { key: "station:102", name: "Jamaica", station: stop,
  request: { type: "station", stationId: "102", routeId: "10" }, fallback: stationAnnouncement(stop), expiresAt: 20000 };
const place: AudioMoment = { key: "place:landmark", name: "Landmark",
  place: { id: "landmark" } as Place, request: { type: "place", placeId: "landmark" }, fallback: station.fallback };

describe("journey audio scheduling", () => {
  it("makes a stable, identifiable journey opener with coordinates and an offline script", () => {
    const position = { lat: 40.7, lon: -73.8 };
    const moment = journeyMoment("10", "Port Jefferson Branch", false, position);
    expect(moment.key).toBe("journey:10:live");
    expect(moment.request).toEqual({ type: "journey", routeId: "10", simulation: false, ...position });
    expect(moment.fallback?.text).toContain("Port Jefferson Branch route");
    expect(moment.fallback?.text).not.toContain("forecast");
    expect(moment.fallback?.kind).toBe("announcement");
    expect(journeyMoment("10", "Port Jefferson Branch", false, { lat: 40.8, lon: -73.7 }).key).toBe(moment.key);
    const replay = journeyMoment("10", "Port Jefferson Branch", true, position);
    expect(replay.key).toBe("journey:10:simulation");
    expect(replay.request).toMatchObject({ simulation: true });
    expect(replay.fallback?.text).toMatch(/simulated ride/i);
    expect(journeyMoment("10", "Port Jefferson Branch", true, null).request)
      .toEqual({ type: "journey", routeId: "10", simulation: true });
  });
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

describe("device speech pause", () => {
  it("holds the next sentence when the gap elapses while paused", () => {
    expect(sentenceGapElapsed({ canceled: false, paused: true, nextIndex: 2 })).toEqual({ action: "hold", index: 2 });
  });

  it("continues that sentence when the gap elapses while playing", () => {
    expect(sentenceGapElapsed({ canceled: false, paused: false, nextIndex: 2 })).toEqual({ action: "speak", index: 2 });
  });

  it("does not restart a sentence after the clip is canceled", () => {
    expect(sentenceGapElapsed({ canceled: true, paused: true, nextIndex: 2 })).toEqual({ action: "stop" });
    expect(sentenceGapElapsed({ canceled: true, paused: false, nextIndex: 1 })).toEqual({ action: "stop" });
  });

  it("speaks a held sentence on resume and does not start a second clip over speech", () => {
    expect(deviceSpeechResume(2, false)).toEqual({ action: "speak", index: 2 });
    expect(deviceSpeechResume(2, true)).toEqual({ action: "resume", dropHeld: true });
    expect(deviceSpeechResume(null, false)).toEqual({ action: "resume", dropHeld: false });
    expect(deviceSpeechResume(null, true)).toEqual({ action: "resume", dropHeld: false });
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

  it("acknowledges a timely point and a delayed point without using that line for nearby or replay", () => {
    const timely = placeAnnouncement(landmark, "pointed")!;
    const delayed = placeAnnouncement(landmark, "pointed-earlier")!;
    expect(timely.text).toMatch(/^You just pointed at Old Library\./);
    expect(delayed.text).toMatch(/^That building you pointed at earlier, Old Library\./);
    const delayedNoun = (category: string) =>
      placeAnnouncement({ ...landmark, category }, "pointed-earlier")!.text;
    expect(delayedNoun("Landmark")).toMatch(/^That landmark you pointed at earlier, Old Library\./);
    expect(delayedNoun("Station")).toMatch(/^That station you pointed at earlier, Old Library\./);
    expect(delayedNoun("Railway history")).toMatch(/^That station you pointed at earlier, Old Library\./);
    expect(delayedNoun("Nature")).toMatch(/^That place you pointed at earlier, Old Library\./);
    expect(delayedNoun("Former use")).toMatch(/^That place you pointed at earlier, Old Library\./);
    expect(delayedNoun("Art & culture")).toMatch(/^That place you pointed at earlier, Old Library\./);
    expect(placeAnnouncement({ ...landmark, category: "Nature" }, "pointed")!.text).toMatch(/^You just pointed at Old Library\./);
    expect(delayed.text).not.toContain("You just pointed");
    expect(timely.text).toContain(quote);
    expect(delayed.text).toContain(quote);
    expect(timely.kind).toBe("verified");
    expect(pointingContext(1_000, 20_000)).toBe("pointed");
    expect(pointingContext(1_000, 50_000)).toBe("pointed-earlier");
    expect(placeAnnouncement(landmark, "nearby")!.text).toBe(`Old Library. ${quote}`);
    expect(placeAnnouncement(landmark, "replay")!.text).toBe(`Once more, Old Library. ${quote}`);
    for (const context of ["nearby", "replay"] as const)
      expect(placeAnnouncement(landmark, context)!.text).not.toContain("pointed");
  });
  it("refuses a name-only POI and stale citations, including device fallback", () => {
    expect(placeAnnouncement({ ...landmark, story: undefined, evidence: [] }, "pointed")).toBeNull();
    expect(placeAnnouncement({ ...landmark, evidence: [{ ...landmark.evidence[0], text: "No matching fact." }] }, "pointed")).toBeNull();
  });
  it("reads a matched source fact plainly when no story exists", () => {
    const script = placeAnnouncement({ ...landmark, story: undefined, evidence: [{ ...landmark.evidence[0],
      title: "Old Library", url: "https://en.wikipedia.org/wiki/Old_Library",
      text: "Old Library is a historic building used for education. It opened in 1901." }] }, "pointed")!;
    expect(script.kind).toBe("source");
    expect(script.text).not.toContain("From Wikipedia");
    expect(script.text).toContain("It opened in 1901.");
  });
});

describe("narration order and preparation", () => {
  const quote = "The building opened in 1901.";
  const sourced = (id: string, name: string): Place => ({
    id, name, lat: 40.7, lon: -73.8, category: "Heritage", routeIds: ["10"],
    sourceUrl: "https://example.org/history", tags: {},
    evidence: [{ id: "archive", title: name, url: "https://example.org/history", text: quote,
      retrievedAt: "2026-10-24", license: "CC BY-SA 4.0" }],
    story: { summary: quote, claims: [{ text: quote, quote, evidenceId: "archive" }],
      verifiedAt: "2026-10-24", evidenceHash: "fixture", generator: "fixture", verifier: "fixture" },
  });
  const selected = sourced("selected", "Selected hall");
  const nearby = sourced("nearby", "Nearby hall");
  const bare: Place = { ...sourced("bare", "Bare hall"), story: undefined, evidence: [] };
  const pending = (expiresAt: number): PendingStation => ({
    key: "station:102", station: stop, routeId: "10", expiresAt,
  });
  const base = {
    now: 10_000,
    position: { lat: stop.lat, lon: stop.lon },
    stations: [] as PendingStation[],
    spoken: new Set<string>(),
    dismissed: new Set<string>(),
    spokenFacts: new Set<string>(),
  };

  it("finishes the current story before a selection, and plays that selection before nearby narration", () => {
    const during = nextNarration({
      ...base, boundary: "sentence",
      current: { key: "place:playing", kind: "story", sentencesRemaining: 2 },
      selected: [{ place: selected, selectedAt: 9_000 }],
      nearby: [nearby],
    });
    expect(during.resume).toBe(true);
    expect(during.next).toBeNull();
    const ready = nextNarration({
      ...base, boundary: "story", current: null,
      selected: [{ place: selected, selectedAt: 9_000 }],
      nearby: [nearby],
    });
    expect(ready.next?.place?.id).toBe("selected");
    expect(ready.next?.request).toMatchObject({ context: "pointed" });
    const later = nextNarration({
      ...base, now: 80_000, boundary: "story", current: null,
      selected: [{ place: selected, selectedAt: 9_000 }],
      nearby: [nearby],
    });
    expect(later.next?.request).toMatchObject({ context: "pointed-earlier" });
  });

  it("inserts a timely station at a sentence boundary and discards a stale or distant one", () => {
    const inserted = nextNarration({
      ...base, boundary: "sentence",
      current: { key: "place:playing", kind: "story", sentencesRemaining: 1 },
      selected: [{ place: selected, selectedAt: 9_000 }],
      nearby: [],
      stations: [pending(20_000)],
    });
    expect(inserted.next?.key).toBe("station:102");
    expect(inserted.next?.fallback?.text).toBe("Station approaching: Jamaica.");
    expect(inserted.resume).toBe(false);
    const stale = nextNarration({
      ...base, now: 21_000, boundary: "story", current: null,
      selected: [], nearby: [], stations: [pending(20_000)],
    });
    expect(stale.discardedStationKeys).toContain("station:102");
    expect(stale.next).toBeNull();
    const distant = nextNarration({
      ...base, boundary: "story", current: null, position: { lat: stop.lat + 0.03, lon: stop.lon },
      selected: [], nearby: [], stations: [pending(20_000)],
    });
    expect(distant.discardedStationKeys).toContain("station:102");
    expect(distant.next?.key).not.toBe("station:102");
  });

  it("prepares selected places before nearby ones and skips a name-only place", () => {
    const order = preparationOrder([selected, bare], [nearby, selected], new Set(), null);
    expect(order.map((item) => item.id)).toEqual(["selected", "nearby"]);
    expect(preparationOrder([selected], [nearby], new Set(["place:selected"]), "nearby").map((item) => item.id)).toEqual([]);
  });

  it("interrupts toward the queued selection and ignores a canceled generation", () => {
    const target = playNowSelection(
      [{ place: selected, selectedAt: 9_000 }, { place: nearby, selectedAt: 9_500 }],
      "station:102",
      new Set(["place:nearby"]),
    );
    expect(target?.place.id).toBe("selected");
    expect(playNowSelection([{ place: selected, selectedAt: 9_000 }], "place:selected", new Set())).toBeNull();
    expect(isActivePlayback(3, null)).toBe(false);
    expect(isActivePlayback(3, 4)).toBe(false);
    expect(isActivePlayback(4, 4)).toBe(true);
  });

  it("does not repeat a place or the same fact", () => {
    const repeat = nextNarration({
      ...base, boundary: "story", current: null,
      selected: [{ place: selected, selectedAt: 9_000 }],
      nearby: [],
      spoken: new Set(["place:selected"]),
    });
    expect(repeat.next).toBeNull();
    const sameFact = nextNarration({
      ...base, boundary: "story", current: null, selected: [], nearby: [nearby],
      spokenFacts: new Set([narrationFact(selected)!]),
    });
    expect(sameFact.next).toBeNull();
    expect(playbackSegments("One sentence.", true)).toEqual(["One sentence."]);
    expect(playbackSegments("First sentence. Second sentence.", true)).toEqual(["First sentence.", "Second sentence."]);
    expect(playbackSegments("First sentence. Second sentence.", false)).toEqual(["First sentence. Second sentence."]);
  });

  it("offers an unsourced story as recoverable silence, then continues", () => {
    const blocked = nextNarration({
      ...base, boundary: "story", current: null,
      selected: [{ place: bare, selectedAt: 9_000 }],
      nearby: [nearby],
    });
    expect(blocked.next?.place?.id).toBe("bare");
    expect(blocked.next?.fallback).toBeNull();
    const continued = nextNarration({
      ...base, boundary: "story", current: null,
      selected: [{ place: bare, selectedAt: 9_000 }],
      nearby: [nearby],
      spoken: new Set(["place:bare"]),
    });
    expect(continued.next?.place?.id).toBe("nearby");
    const recovered = nextNarration({
      ...base, boundary: "story", current: null,
      selected: [{ place: bare, selectedAt: 9_000 }],
      nearby: [],
      spoken: new Set(),
    });
    expect(recovered.next?.place?.id).toBe("bare");
    expect(recovered.next?.fallback).toBeNull();
  });
});
