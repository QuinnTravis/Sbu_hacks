import { describe, expect, it } from "vitest";
import {
  highlightScore,
  isHighlight,
  selectCue,
  type CueInput,
} from "../src/features/look-ahead/cues";
import { minutesAt, sideAdvice, sideBalance } from "../src/features/look-ahead/advisor";
import type { Place } from "../src/lib/types";

function place(id: string, routeKm: number, signedLateralM: number, extra: Partial<Place> = {}): Place {
  return {
    id, name: id, lat: 40, lon: -105, category: "Railroad heritage", routeIds: ["cz-rockies"],
    sourceUrl: "https://www.wikidata.org/wiki/Q1", tags: {}, evidence: [], kind: "poi",
    routeKm, lateralM: Math.abs(signedLateralM), signedLateralM, fame: 20, wikipedia: id, ...extra,
  };
}

const base = (overrides: Partial<CueInput>): CueInput => ({
  places: [], km: 0, direction: 1, speedKmh: 120, facing: "forward",
  bookmarked: new Set(), announced: new Set(), current: null, lastStartedAt: null, now: 1_000_000,
  ...overrides,
});

describe("look-ahead cues", () => {
  const tunnel = place("Moffat Tunnel", 4, -40, { basic: { type: "tunnel", sources: [] }, extentKm: [4, 14] });
  const depot = place("Depot", 3, 900);
  it("announces a highlight within its lead time, with side and ETA", () => {
    const { cue, isNew } = selectCue(base({ places: [depot], km: 0 }));
    expect(isNew).toBe(true);
    expect(cue?.poiId).toBe("Depot");
    expect(cue?.side).toBe("left");
    expect(cue?.etaSeconds).toBeCloseTo(90);
    expect(cue?.phase).toBe("upcoming");
  });
  it("gives tunnels and canyons a longer lead", () => {
    // 4.5 km at 120 km/h is 135 s: past the 120 s lead for a depot, within 180 s for a tunnel.
    expect(selectCue(base({ places: [depot], km: -1.5 })).cue).toBeNull();
    expect(selectCue(base({ places: [tunnel], km: -1.5 })).cue?.poiId).toBe("Moffat Tunnel");
  });
  it("never announces a place already reached or passed", () => {
    expect(selectCue(base({ places: [depot], km: 3.2 })).cue).toBeNull();
    expect(selectCue(base({ places: [depot], km: 2.9, direction: -1 })).cue).toBeNull();
  });
  it("switches to now on approach and expires after the place passes", () => {
    const first = selectCue(base({ places: [depot], km: 0 })).cue!;
    const near = selectCue(base({ places: [depot], km: 2.7, current: first }));
    expect(near.cue?.phase).toBe("now");
    expect(near.isNew).toBe(false);
    expect(selectCue(base({ places: [depot], km: 3.5, current: first })).cue).toBeNull();
  });
  it("keeps a minimum gap between new cues and skips places already cued", () => {
    const later = place("Later", 2, 700);
    expect(selectCue(base({ places: [later], lastStartedAt: 1_000_000 - 20_000 })).cue).toBeNull();
    expect(selectCue(base({ places: [later], lastStartedAt: 1_000_000 - 50_000 })).cue?.poiId).toBe("Later");
    expect(selectCue(base({ places: [later], announced: new Set(["Later"]) })).cue).toBeNull();
  });
  it("cannot place a cue without a direction of travel", () => {
    expect(selectCue(base({ places: [depot], direction: null })).cue).toBeNull();
  });
  it("shows a nearby cue without an ETA when the train is stopped", () => {
    const { cue } = selectCue(base({ places: [depot], km: 1.5, speedKmh: 0 }));
    expect(cue?.etaSeconds).toBeNull();
  });
  it("prefers famous, close, high-value places, and always counts bookmarks", () => {
    const obscure = place("Obscure", 2, 4500, { fame: 0, wikipedia: undefined, category: "Town" });
    expect(isHighlight(obscure)).toBe(false);
    expect(isHighlight(obscure, true)).toBe(true);
    expect(highlightScore(depot)).toBeGreaterThan(highlightScore(obscure));
    const { cue } = selectCue(base({ places: [obscure], bookmarked: new Set(["Obscure"]) }));
    expect(cue?.poiId).toBe("Obscure");
  });
  it("flips the cue side for a passenger facing backward", () => {
    expect(selectCue(base({ places: [depot], facing: "backward" })).cue?.side).toBe("right");
  });
});

describe("window-side advisor", () => {
  const places = [
    place("L1", 10, 800), place("L2", 20, 600),
    place("R1", 15, -500), place("R2", 25, -700), place("R3", 35, -400),
    place("Through", 30, 50),
  ];
  const timetable = [{ km: 0, minutes: 0 }, { km: 40, minutes: 60 }];
  it("counts each highlight once per side and ignores places on the line", () => {
    const advice = sideAdvice(places, { fromKm: 0, toKm: 40, direction: 1, facing: "forward" }, new Set(), timetable);
    expect(advice.left.count).toBe(2);
    expect(advice.right.count).toBe(3);
    expect(advice.better).toBe("right");
    expect(advice.right.top.map((p) => p.place.id)).toEqual(["R1", "R2", "R3"]);
    expect(advice.right.top[0].minutesIn).toBeCloseTo(22.5);
  });
  it("matches the side labels after flipping direction or seat", () => {
    const reverse = sideAdvice(places, { fromKm: 40, toKm: 0, direction: -1, facing: "forward" });
    expect(reverse.left.count).toBe(3);
    expect(reverse.better).toBe("left");
    const backward = sideAdvice(places, { fromKm: 0, toKm: 40, direction: 1, facing: "backward" });
    expect(backward.left.count).toBe(3);
  });
  it("only counts the chosen leg", () => {
    const leg = sideAdvice(places, { fromKm: 12, toKm: 40, direction: 1, facing: "forward" });
    expect(leg.left.count).toBe(1);
  });
  it("interpolates timetable minutes between stops", () => {
    expect(minutesAt(timetable, 20)).toBe(30);
    expect(minutesAt([], 20)).toBeNull();
  });
  it("splits the ride into stretches with the better side marked", () => {
    const stretches = [place("A", 12, -300), place("B", 16, -400), place("C", 24, 300), place("D", 27, -2500, { category: "Town" })];
    const bins = sideBalance(stretches, { fromKm: 0, toKm: 40, facing: "forward", direction: 1 }, 4);
    expect(bins).toHaveLength(4);
    expect(bins[0].better).toBe("even");
    expect(bins[1].better).toBe("right");
    expect(bins[2].better).toBe("left");
  });
});
