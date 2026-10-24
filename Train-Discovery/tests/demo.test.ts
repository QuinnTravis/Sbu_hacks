import { describe, expect, it } from "vitest";
import {
  DEMO_LOCATION,
  demoPath,
  pathTimeline,
  pointAlong,
} from "../src/lib/demo";
import { distance } from "../src/lib/geo";
import rail from "../public/data/lirr.json";
import type { RailData } from "../src/lib/types";

describe("distance-based train replay", () => {
  const timeline = pathTimeline([
    [40.7, -73.81],
    [40.71, -73.81],
    [40.73, -73.81],
  ]);
  it("moves by meters across unequal track segments", () => {
    const p = pointAlong(timeline, 600)!;
    expect(distance({ lat: 40.7, lon: -73.81 }, p)).toBeCloseTo(600, 0);
    expect(pointAlong(timeline, timeline.total / 2)!.lat).toBeCloseTo(
      40.715,
      5,
    );
  });
  it("clamps at endpoints without teleporting back to the beginning", () => {
    expect(pointAlong(timeline, -500)).toEqual({ lat: 40.7, lon: -73.81 });
    expect(pointAlong(timeline, timeline.total + 10000)).toEqual({
      lat: 40.73,
      lon: -73.81,
    });
    expect(pointAlong(pathTimeline([]), 1)).toBeNull();
  });
  it("starts the Babylon replay beside Jamaica", () => {
    const { path, startIndex } = demoPath(
      (rail as RailData).routes.find((r) => r.id === "1"),
    );
    expect(
      distance(DEMO_LOCATION, {
        lat: path[startIndex][0],
        lon: path[startIndex][1],
      }),
    ).toBeLessThan(100);
  });
});
