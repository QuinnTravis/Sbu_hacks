import { describe, expect, it } from "vitest";
import {
  etaSeconds,
  kmAhead,
  pointAtKm,
  projectOnRoute,
  routeIndex,
  sideOf,
  smoothSpeed,
  travelDirection,
} from "../src/lib/route-geometry";
import { destination } from "../src/lib/geo";

// A straight track running due north from (40, -105): canonical direction is north.
const north = routeIndex([
  [40, -105],
  [40.05, -105],
  [40.1, -105],
]);
const start = { lat: 40, lon: -105 };

describe("route index and projection", () => {
  it("measures cumulative kilometers along the track", () => {
    expect(north.km[0]).toBe(0);
    expect(north.totalKm).toBeCloseTo(11.12, 1);
    const half = pointAtKm(north, north.totalKm / 2)!;
    expect(half.lat).toBeCloseTo(40.05, 3);
    expect(pointAtKm(north, -5)).toEqual({ lat: 40, lon: -105 });
  });

  it("puts a place west of a northbound track on the left, east on the right", () => {
    const west = destination({ lat: 40.05, lon: -105 }, 270, 800);
    const east = destination({ lat: 40.05, lon: -105 }, 90, 800);
    const w = projectOnRoute(north, west)!;
    const e = projectOnRoute(north, east)!;
    expect(w.km).toBeCloseTo(5.56, 1);
    expect(w.lateralM).toBeCloseTo(800, -1);
    expect(w.signedLateralM).toBeGreaterThan(0);
    expect(e.signedLateralM).toBeLessThan(0);
  });

  it("keeps one side for a place outside a bend", () => {
    // East, then north: a place to the southeast of the corner is on the right throughout.
    const bend = routeIndex([[40, -105.1], [40, -105], [40.1, -105]]);
    const outside = destination({ lat: 40, lon: -105 }, 135, 500);
    expect(projectOnRoute(bend, outside)!.signedLateralM).toBeLessThan(0);
  });

  it("searches near a previous position so a doubled-back curve cannot jump", () => {
    const hairpin = routeIndex([[40, -105], [40.05, -105], [40.05, -104.999], [40, -104.999]]);
    const near = projectOnRoute(hairpin, { lat: 40.001, lon: -104.9995 }, { km: 0.3, windowKm: 2 })!;
    expect(near.km).toBeLessThan(2);
  });
});

describe("side of the train", () => {
  const left = { signedLateralM: 900 };
  const right = { signedLateralM: -900 };
  it("follows the geometry for a forward-facing passenger", () => {
    expect(sideOf(left, 1, "forward")).toBe("left");
    expect(sideOf(right, 1, "forward")).toBe("right");
  });
  it("swaps sides when riding the opposite direction", () => {
    expect(sideOf(left, -1, "forward")).toBe("right");
    expect(sideOf(right, -1, "forward")).toBe("left");
  });
  it("swaps sides again for a passenger facing backward", () => {
    expect(sideOf(left, 1, "backward")).toBe("right");
    expect(sideOf(left, -1, "backward")).toBe("left");
  });
  it("says ahead for a point on the line and both sides for features the train runs through", () => {
    expect(sideOf({ signedLateralM: 80 }, 1, "forward")).toBe("ahead");
    expect(sideOf({ signedLateralM: -120, areaKind: "river" }, 1, "forward")).toBe("both");
    expect(sideOf({ signedLateralM: 900, areaKind: "canyon" }, 1, "forward")).toBe("both");
    expect(sideOf({ signedLateralM: 2500, areaKind: "canyon" }, 1, "forward")).toBe("left");
    expect(sideOf({}, 1, "forward")).toBeNull();
  });
});

describe("ETA and speed", () => {
  it("divides the distance still ahead by the smoothed speed", () => {
    expect(etaSeconds(12, 10, 1, 60)).toBeCloseTo(120);
    expect(etaSeconds(8, 10, -1, 120)).toBeCloseTo(60);
    expect(kmAhead(8, 10, 1)).toBe(-2);
  });
  it("gives no time below walking speed", () => {
    expect(etaSeconds(12, 10, 1, 3)).toBeNull();
    expect(etaSeconds(12, 10, 1, null)).toBeNull();
  });
  it("smooths one jittery reading instead of following it", () => {
    let speed = smoothSpeed(null, 80);
    expect(speed).toBe(80);
    speed = smoothSpeed(speed, 200);
    expect(speed).toBeCloseTo(116);
    expect(smoothSpeed(speed, Number.NaN)).toBe(speed);
  });
  it("infers direction only from a real move", () => {
    expect(travelDirection(10, 10.5)).toBe(1);
    expect(travelDirection(10, 9.5)).toBe(-1);
    expect(travelDirection(10, 10.01)).toBeNull();
  });
  it("treats the canonical start as km 0", () => {
    expect(projectOnRoute(north, start)!.km).toBeCloseTo(0, 5);
  });
});
