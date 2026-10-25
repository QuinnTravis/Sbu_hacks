import { describe, expect, it } from "vitest";
import { placeAnnouncement } from "../src/lib/audio-journey";
import type { PendingStation } from "../src/lib/audio-journey";
import {
  planPodcast, podcastCandidatesFromJourney, podcastSiteKey,
  PODCAST_AUTO_GAP_MS, PODCAST_INTRO_KEY,
} from "../src/lib/podcast-director";
import type { PodcastCandidate, PodcastDirectorInput } from "../src/lib/podcast-director";
import type { Place } from "../src/lib/types";

const NOW = 100_000;
const POSITION = { lat: 40.6996, lon: -73.8085, timestamp: NOW, accuracy: 8 };
const STATION = { id: "102", name: "Jamaica", lat: 40.6996, lon: -73.8085 };

function place(id: string, options: Partial<Place> = {}): Place {
  const text = `${id} opened to visitors in 1901.`;
  return {
    id, name: `Museum ${id}`, lat: 40.7001, lon: -73.8085,
    category: "Heritage", routeIds: ["10"], sourceUrl: `https://www.openstreetmap.org/node/${id}`,
    tags: {},
    evidence: [{ id: "source", title: `Museum ${id}`, url: `https://example.org/${id}`,
      text, retrievedAt: "2026-10-24", license: "CC BY-SA 4.0" }],
    story: { summary: text, claims: [{ text, quote: text, evidenceId: "source" }],
      verifiedAt: "2026-10-24", evidenceHash: "hash", generator: "fixture", verifier: "fixture" },
    ...options,
  };
}

function candidate(p: Place, selectedAt?: number, topic?: string): PodcastCandidate {
  return { selectedAt, topic, moment: {
    key: `place:${p.id}`, name: p.name, place: p,
    request: { type: "place", placeId: p.id, context: "nearby" },
    fallback: placeAnnouncement(p),
  } };
}

function station(expiresAt = NOW + 10_000): PodcastCandidate {
  return { moment: {
    key: `station:${STATION.id}`, name: STATION.name, station: STATION,
    request: { type: "station", stationId: STATION.id, routeId: "10" },
    fallback: null, expiresAt,
  } };
}

function input(candidates: PodcastCandidate[] = [], changes: Partial<PodcastDirectorInput> = {}): PodcastDirectorInput {
  return {
    now: NOW, geography: { routeId: "10", position: POSITION },
    candidates, playedKeys: new Set([PODCAST_INTRO_KEY]), ...changes,
  };
}

describe("pure podcast planning", () => {
  it("has intentional silence when no candidates have sourced stories", () => {
    expect(planPodcast(input()).action).toBe("quiet");
    expect(planPodcast(input([candidate(place("bare", { story: undefined, evidence: [] }))])))
      .toMatchObject({ action: "quiet", reason: "no-sourced-stories", ranked: [] });
  });

  it("welcomes once before the first automatic sourced story, then schedules it", () => {
    const chosen = candidate(place("first"));
    const beginning = planPodcast(input([chosen], { playedKeys: new Set(), lastPlayback: null }));
    expect(beginning).toMatchObject({ action: "intro", key: PODCAST_INTRO_KEY,
      next: { moment: { key: "place:first" } } });
    expect(beginning.action === "intro" && beginning.text).toContain("Welcome aboard");
    expect(planPodcast(input([chosen], { playedKeys: new Set([PODCAST_INTRO_KEY]) })))
      .toMatchObject({ action: "story", item: { moment: { key: "place:first" } } });
  });

  it("responds to a point before a better-scored automatic story, without delaying for a welcome", () => {
    const weaker = place("pointed", { category: "Landmark" });
    const stronger = place("nearby", { lat: POSITION.lat, category: "Heritage" });
    const decision = planPodcast(input([candidate(stronger), candidate(weaker, NOW - 500)], {
      playedKeys: new Set(), pointedPlaceId: weaker.id, pointedAt: NOW - 500,
    }));
    expect(decision).toMatchObject({ action: "story", item: { priority: "pointed",
      moment: { key: "place:pointed", request: { context: "pointed" } } } });
    if (decision.action === "story") {
      expect(decision.item.moment.fallback?.text).toMatch(/^You just pointed at Museum pointed\./);
    }
  });

  it("acknowledges an old selection without claiming the rider just pointed", () => {
    const decision = planPodcast(input([candidate(place("older"), NOW - 90_000)]));
    expect(decision.action).toBe("story");
    if (decision.action === "story") {
      expect(decision.item.moment.request).toMatchObject({ context: "pointed-earlier" });
      expect(decision.item.moment.fallback?.text).toMatch(/^That building you pointed at earlier/);
    }
  });

  it("does not call a future or unknown selection a recent gesture", () => {
    const p = place("future");
    for (const selectedAt of [NOW + 10_000, NaN]) {
      const decision = planPodcast(input([candidate(p, selectedAt)], {
        pointedPlaceId: p.id,
      }));
      expect(decision).toMatchObject({ action: "story", item: {
        moment: { request: { context: "pointed-earlier" } },
      } });
    }
  });

  it("keeps the original verified text, citations, and evidence attached to the decision", () => {
    const p = place("archive");
    const decision = planPodcast(input([candidate(p)]));
    expect(decision.action).toBe("story");
    if (decision.action === "story") {
      expect(decision.item.moment.fallback).toMatchObject({ kind: "verified",
        sources: [{ title: "Museum archive", url: "https://example.org/archive", license: "CC BY-SA 4.0" }],
        evidence: p.evidence, story: p.story });
      expect(decision.item.moment.fallback?.text).toContain("archive opened to visitors in 1901.");
      expect(decision.item.moment.fallback?.text).not.toMatch(/visible|outside your window/i);
    }
  });

  it("identifies pointed deep dives using independently checked facts", () => {
    const p = place("deep");
    const nextFact = "The building welcomed its second collection in 1924.";
    const deep = place("deep", {
      evidence: [...p.evidence, { id: "archive2", title: "Town archive",
        url: "https://example.org/second", text: nextFact,
        license: "CC BY-SA 4.0", retrievedAt: "2026-10-24" }],
      story: { ...p.story!, claims: [...p.story!.claims,
        { text: nextFact, quote: nextFact, evidenceId: "archive2" }] },
    });
    const decision = planPodcast(input([candidate(deep, NOW)]));
    expect(decision).toMatchObject({ action: "story", item: {
      depth: "deep", supportedDetails: 2, reason: "user chose a multi-fact deep dive",
    } });
    if (decision.action === "story") {
      expect(decision.item.moment.fallback?.text).toContain(nextFact);
      expect(decision.item.moment.fallback?.sources).toHaveLength(2);
    }
    const oneInvalidClaim = candidate(place("deep", {
      ...deep, evidence: [p.evidence[0]],
    }), NOW);
    const safe = planPodcast(input([oneInvalidClaim]));
    expect(safe).toMatchObject({ action: "story", item: { depth: "brief", supportedDetails: 1 } });
    if (safe.action === "story") expect(safe.item.moment.fallback?.text).not.toContain(nextFact);
  });

  it("rejects forged fallback claims and refuses name-only or unverified place records", () => {
    const p = place("forged", { story: undefined, evidence: [] });
    const forged = candidate(p);
    forged.moment.fallback = { kind: "verified", name: p.name,
      text: "Fictional famous fact.", sources: [{ title: "Made up", url: "https://example.org", license: "CC" }] };
    const noId = candidate(place("id"));
    noId.moment.request = { type: "place", placeId: "different" };
    const invalidCoords = candidate(place("bad-coordinates", { lat: NaN }));
    const invalidOrigin = candidate(place("invalid", { sourceUrl: "javascript:alert(1)" }));
    const invalidQuote = candidate(place("stale", { evidence: [{
      id: "source", title: "Museum stale", url: "https://example.org/stale",
      text: "No matching archived passage.", retrievedAt: "2026-10-24", license: "CC",
    }] }));
    expect(planPodcast(input([forged, noId, invalidCoords, invalidOrigin, invalidQuote])))
      .toMatchObject({ action: "quiet", ranked: [] });
  });

  it("permits a matched Wikipedia excerpt and keeps its source", () => {
    const p = place("excerpt", { story: undefined, evidence: [{
      id: "wiki", title: "Museum excerpt", url: "https://en.wikipedia.org/wiki/Museum_excerpt",
      text: "Museum excerpt served as an educational landmark in the district. It housed a collection of books and maps.",
      retrievedAt: "2026-10-24", license: "CC BY-SA 4.0",
    }] });
    const decision = planPodcast(input([candidate(p)]));
    expect(decision.action).toBe("story");
    if (decision.action === "story") {
      expect(decision.item.moment.fallback?.kind).toBe("source");
      expect(decision.item.moment.fallback?.text).not.toContain("From Wikipedia");
      expect(decision.item.moment.fallback?.sources[0].url).toBe(p.evidence[0].url);
    }
  });

  it("deduplicates played keys, factual repetition, and same-site map records", () => {
    const p = place("main");
    const anotherId = place("shadow", { name: p.name, lat: p.lat + 0.00001, lon: p.lon + 0.00001 });
    const otherFact = place("same-fact", { story: p.story, evidence: p.evidence });
    const all = [candidate(p), candidate(anotherId), candidate(otherFact)];
    expect(planPodcast(input(all)).ranked.map((rank) => rank.moment.key))
      .toEqual(["place:main"]);
    expect(planPodcast(input(all, { playedKeys: new Set([PODCAST_INTRO_KEY, "place:main"]) })).ranked)
      .toHaveLength(2); // Alternate site IDs need the site/fact history as well.
    expect(planPodcast(input([candidate(p)], { playedSiteKeys: new Set([podcastSiteKey(p)]) })).ranked)
      .toEqual([]);
    expect(planPodcast(input([candidate(p)], { playedFacts: new Set(["main opened to visitors in 1901."]) })).ranked)
      .toEqual([]);
  });

  it("replays only on an explicit replay request, and still respects dismissal and evidence", () => {
    const p = place("replay");
    const previous = new Set([PODCAST_INTRO_KEY, `place:${p.id}`]);
    expect(planPodcast(input([candidate(p)], { playedKeys: previous })).ranked).toEqual([]);
    const decision = planPodcast(input([candidate(p)], {
      playedKeys: previous, replayPlaceId: p.id,
    }));
    expect(decision).toMatchObject({ action: "story", item: { moment: { request: { context: "replay" } } } });
    expect(planPodcast(input([candidate(p)], { replayPlaceId: p.id,
      dismissedPlaceIds: new Set([p.id]) })).ranked).toEqual([]);
  });

  it("requires a fresh accurate fix and a matching route for automatic stories", () => {
    const p = place("route");
    const candidates = [candidate(p)];
    for (const position of [null, { ...POSITION, timestamp: NOW - 60_000 },
      { ...POSITION, accuracy: 500 }, { ...POSITION, lat: NaN }]) {
      expect(planPodcast(input(candidates, { geography: { routeId: "10", position } })))
        .toMatchObject({ action: "quiet", reason: "unknown-location" });
    }
    expect(planPodcast(input(candidates, { geography: { routeId: "99", position: POSITION } })).ranked).toEqual([]);
    expect(planPodcast(input([candidate(place("far", { lat: 40.73 }))])).ranked).toEqual([]);
  });

  it("permits an already selected sourced POI with unknown location, without visibility claims", () => {
    const p = place("saved");
    const decision = planPodcast(input([candidate(p, NOW - 30_000)], {
      geography: { routeId: null, position: null },
    }));
    expect(decision).toMatchObject({ action: "story", item: { priority: "pointed" } });
    if (decision.action === "story") expect(decision.item.moment.fallback?.text).not.toMatch(/see|visible|window/i);
  });

  it("prioritizes a timely real station ahead of pointed and nearby stories", () => {
    const decision = planPodcast(input([candidate(place("point"), NOW - 500), station(), candidate(place("near"))]));
    expect(decision).toMatchObject({ action: "station", item: { moment: {
      key: "station:102", fallback: { text: "Station approaching: Jamaica.", kind: "announcement", sources: [] },
    } } });
    expect(decision.ranked.map((item) => item.priority)).toEqual(["station", "pointed", "nearby"]);
  });

  it("inserts a station at a sentence boundary and leaves the current story intact", () => {
    const current = { key: "place:current", kind: "story" as const, boundary: "none" as const,
      sentencesRemaining: 2 };
    expect(planPodcast(input([station(), candidate(place("next"), NOW)], { current })))
      .toMatchObject({ action: "quiet", reason: "playback-in-progress" });
    expect(planPodcast(input([station(), candidate(place("next"), NOW)], {
      current: { ...current, boundary: "sentence" },
    }))).toMatchObject({ action: "station", item: { moment: { key: "station:102" } } });
    expect(planPodcast(input([candidate(place("next"), NOW)], {
      current: { ...current, boundary: "sentence" },
    }))).toMatchObject({ action: "quiet", reason: "continue-current" });
    expect(planPodcast(input([station()], { current: { ...current, boundary: "sentence", sentencesRemaining: 0 } })))
      .toMatchObject({ action: "quiet", reason: "continue-current" });
  });

  it("discards stale, distant, wrongly routed, and forged station announcements", () => {
    const invalidRequest = station();
    invalidRequest.moment.request = { type: "station", stationId: "not-Jamaica", routeId: "10" };
    const invalidStop = station();
    invalidStop.moment.station = { ...STATION, lat: NaN };
    const others = [station(NOW - 1), invalidRequest, invalidStop];
    expect(planPodcast(input(others)).ranked).toEqual([]);
    expect(planPodcast(input([station()], { geography: { routeId: "other", position: POSITION } })).ranked).toEqual([]);
    expect(planPodcast(input([station()], { geography: { routeId: null, position: POSITION } })).ranked).toEqual([]);
    expect(planPodcast(input([station()], { geography: { routeId: "10", position: { ...POSITION, lat: 40.73 } } })).ranked).toEqual([]);
    expect(planPodcast(input([station()], { playedKeys: new Set(["station:102"]) })).ranked).toEqual([]);
  });

  it("paces automatic stories, permits an immediate user choice, and resumes after the gap", () => {
    const c = candidate(place("slow"));
    const lastPlayback = { key: "place:older", kind: "story" as const, endedAt: NOW - 1_000 };
    expect(planPodcast(input([c], { lastPlayback }))).toMatchObject({
      action: "quiet", reason: "breathing-room", until: lastPlayback.endedAt + PODCAST_AUTO_GAP_MS,
    });
    expect(planPodcast(input([candidate(place("urgent"), NOW)], { lastPlayback })).action).toBe("story");
    expect(planPodcast(input([c], { lastPlayback: { ...lastPlayback, endedAt: NOW - 10_000 } })).action)
      .toBe("story");
    expect(planPodcast(input([station()], { lastPlayback })).action).toBe("station");
    expect(planPodcast(input([c], {
      lastPlayback: { key: PODCAST_INTRO_KEY, kind: "intro", endedAt: NOW - 1_000 },
    })).action).toBe("story");
    expect(planPodcast(input([c], {
      lastPlayback: { key: "station:102", kind: "station", endedAt: NOW - 300 },
    }))).toMatchObject({ action: "quiet", reason: "breathing-room", until: NOW + 600 });
  });

  it("prefers a continuing topic and uses a generic transition when changing topics", () => {
    const related = candidate(place("related", { lat: POSITION.lat + 0.005 }), undefined, "rail");
    const different = candidate(place("different", { lat: POSITION.lat }), undefined, "nature");
    const lastPlayback = { key: "place:old", kind: "story" as const, endedAt: NOW - 20_000, topic: "rail" };
    const first = planPodcast(input([different, related], { lastPlayback, previousTopic: "rail" }));
    expect(first).toMatchObject({ action: "story", item: { moment: { key: "place:related" } } });
    const transition = planPodcast(input([different], { lastPlayback, previousTopic: "rail" }));
    expect(transition).toMatchObject({ action: "transition", key: "podcast:transition:place:different" });
    if (transition.action === "transition") {
      expect(transition.text).toBe("Let's follow a different thread.");
      expect(planPodcast(input([different], {
        lastPlayback, previousTopic: "rail", playedKeys: new Set([PODCAST_INTRO_KEY, transition.key]),
      })).action).toBe("story");
    }
  });

  it("exposes a deterministic adapter for the existing scheduler data and never mutates inputs", () => {
    const selected = [{ place: place("chosen"), selectedAt: NOW - 1_000 }];
    const nearby = [selected[0].place, place("other")];
    const stations: PendingStation[] = [{ station: STATION, routeId: "10", key: "station:102", expiresAt: NOW + 2_000 }];
    const candidates = podcastCandidatesFromJourney({ now: NOW, selected, nearby, stations });
    expect(candidates).toHaveLength(4);
    const data = input(candidates);
    const snapshot = JSON.stringify(data.candidates);
    const first = planPodcast(data);
    expect(planPodcast(data)).toEqual(first);
    expect(JSON.stringify(data.candidates)).toBe(snapshot);
    expect(first.ranked.map((r) => r.moment.key)).toEqual(["station:102", "place:chosen", "place:other"]);
  });

  it("rejects missing time rather than issuing a speculative playback", () => {
    expect(planPodcast(input([candidate(place("a"))], { now: NaN })))
      .toMatchObject({ action: "quiet", reason: "invalid-time", ranked: [] });
  });
});
