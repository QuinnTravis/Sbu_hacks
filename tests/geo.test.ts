import { describe, expect, it } from "vitest";
import {
  angleDelta,
  bearing,
  cameraHeading,
  distance,
  isPointedAt,
  routeDistance,
} from "../src/lib/geo";
import rail from "../public/data/lirr.json";
import type { RailData } from "../src/lib/types";

describe("geographic detection", () => {
  const here = { lat: 40.92, lon: -73.1285 };
  const north = { lat: 40.925, lon: -73.1285 };
  it("uses meters and compass bearings", () => {
    expect(distance(here, north)).toBeCloseTo(556, -1);
    expect(bearing(here, north)).toBeCloseTo(0);
    expect(bearing(here, { lat: 40.92, lon: -73.12 })).toBeCloseTo(90, 0);
  });
  it("wraps across north without a false 358 degree difference", () => {
    expect(angleDelta(359, 1)).toBe(-2);
    expect(isPointedAt(here, 359, north)).toBe(true);
    expect(isPointedAt(here, 180, north)).toBe(false);
    expect(isPointedAt(here, null, north)).toBe(false);
    expect(isPointedAt(here, NaN, north)).toBe(false);
    expect(isPointedAt(here, 0, { lat: 41, lon: -73.1285 })).toBe(false);
  });
  it("projects the rear camera direction and rejects a flat phone", () => {
    expect(cameraHeading(0, 90, 0)).toBeCloseTo(0);
    expect(cameraHeading(270, 90, 0)).toBeCloseTo(90);
    expect(cameraHeading(180, 90, 0)).toBeCloseTo(180);
    expect(cameraHeading(0, 0, 0)).toBeNull();
    expect(cameraHeading(0, 90, 90)).toBeCloseTo(270);
  });
  it("measures proximity to the tracks between stations", () => {
    const data = rail as RailData;
    const pj = data.routes.find((r) => r.id === "10")!;
    expect(routeDistance(here, pj)).toBeLessThan(100);
    expect(routeDistance({ lat: 41.05, lon: -73.2 }, pj)).toBeGreaterThan(5000);
  });
  it("contains geometry and candidate data for all 13 services", async () => {
    const places = (await import("../public/data/places.json")).places;
    expect(rail.routes).toHaveLength(13);
    for (const route of rail.routes) {
      expect(route.paths.length, route.name).toBeGreaterThan(0);
      expect(
        places.some((p) => p.routeIds.includes(route.id)),
        route.name,
      ).toBe(true);
    }
  });
});
