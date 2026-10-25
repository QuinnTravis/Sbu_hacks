import { describe, expect, it } from "vitest";
import { MercatorCoordinate } from "maplibre-gl";
import {
  POINTING_HALF_ANGLE_DEG,
  POINTING_RADIUS_M,
  angleDelta,
  bearing,
  cameraHeading,
  destination,
  distance,
  isPointedAt,
  normalize,
  pointingConeContains,
  pointingConeRing,
  pointingConeZoom,
  routeDistance,
} from "../src/lib/geo";
import rail from "../public/data/lirr.json";
import type { RailData } from "../src/lib/types";

describe("pointing map zoom", () => {
  it.each([
    { name: "portrait", width: 320, height: 480 },
    { name: "landscape", width: 660, height: 240 },
    { name: "short frame minus attribution", width: 320, height: 180 - 32 },
  ])(
    "fits the entire circle with marker padding in $name",
    ({ width, height }) => {
      for (const lat of [0, 40.7, -40.7, 70, -80, 84]) {
        // Also exercise a wrapped circle at the antimeridian.
        const origin = { lat, lon: 179.999 };
        const span = Math.min(width, height);
        const zoom = pointingConeZoom(lat, span);
        const worldSize = 512 * 2 ** zoom;
        const center = MercatorCoordinate.fromLngLat([origin.lon, origin.lat]);
        const padding = Math.max(16, (span / 2) * 0.14);
        let largestOffset = 0;
        for (let heading = 0; heading < 360; heading += 1) {
          const point = destination(origin, heading, POINTING_RADIUS_M);
          const projected = MercatorCoordinate.fromLngLat([
            point.lon,
            point.lat,
          ]);
          const dx = projected.x - center.x;
          const x = Math.abs(dx - Math.round(dx)) * worldSize;
          const y = Math.abs(projected.y - center.y) * worldSize;
          expect(
            x + padding,
            `lat ${lat}, heading ${heading}: horizontal`,
          ).toBeLessThanOrEqual(width / 2);
          expect(
            y + padding,
            `lat ${lat}, heading ${heading}: vertical`,
          ).toBeLessThanOrEqual(height / 2);
          largestOffset = Math.max(largestOffset, x, y);
        }
        // Catch an excessively distant view as well as a clipped one.
        expect(largestOffset).toBeGreaterThan((span / 2 - padding) * 0.98);
      }
    },
  );

  it("zooms out as drawable space shrinks or absolute latitude grows", () => {
    expect(pointingConeZoom(40.7, 148)).toBeLessThan(
      pointingConeZoom(40.7, 320),
    );
    expect(pointingConeZoom(80, 148)).toBeLessThan(pointingConeZoom(40.7, 148));
    expect(pointingConeZoom(80, 148)).toBeLessThan(10);
    expect(pointingConeZoom(-80, 148)).toBe(pointingConeZoom(80, 148));
  });

  it("uses a finite wide fallback before valid dimensions are available", () => {
    for (const span of [0, -1, NaN, Infinity]) {
      expect(pointingConeZoom(40.7, span)).toBe(0);
    }
    expect(pointingConeZoom(NaN, 320)).toBe(0);
  });
});

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
  it("draws the pointing cone at 1200 m and ±22° along the heading", () => {
    expect(POINTING_RADIUS_M).toBe(1200);
    expect(POINTING_HALF_ANGLE_DEG).toBe(22);
    const origin = { lat: 40.69960817, lon: -73.80852987 };
    for (const heading of [20, 350]) {
      const ring = pointingConeRing(origin, heading);
      expect(ring[0]).toEqual(origin);
      expect(ring.at(-1)).toEqual(origin);
      const arc = ring.slice(1, -1);
      expect(arc.length).toBeGreaterThan(2);
      for (const point of arc) {
        expect(distance(origin, point)).toBeCloseTo(1200, 1);
      }
      expect(bearing(origin, arc[0]!)).toBeCloseTo(normalize(heading - 22), 4);
      expect(bearing(origin, arc.at(-1)!)).toBeCloseTo(
        normalize(heading + 22),
        4,
      );
      const mid = arc[Math.floor((arc.length - 1) / 2)]!;
      expect(Math.abs(angleDelta(bearing(origin, mid), heading))).toBeLessThan(
        0.05,
      );
      const inside = destination(origin, heading, 600);
      const wide = destination(origin, heading + 40, 600);
      const far = destination(origin, heading, 1400);
      expect(pointingConeContains(origin, heading, inside)).toBe(true);
      expect(pointingConeContains(origin, heading, wide)).toBe(false);
      expect(pointingConeContains(origin, heading, far)).toBe(false);
      expect(isPointedAt(origin, heading, inside)).toBe(true);
      expect(isPointedAt(origin, heading, wide)).toBe(false);
      expect(isPointedAt(origin, heading, far)).toBe(false);
    }
    expect(pointingConeContains(origin, NaN, destination(origin, 0, 100))).toBe(
      false,
    );
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
