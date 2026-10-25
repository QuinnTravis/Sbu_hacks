import { distance } from "./geo";
import type { Coordinate, RailRoute } from "./types";

// Official MTA GTFS coordinate for Jamaica station (stop 102), the LIRR demo start.
export const DEMO_LOCATION = { lat: 40.69960817, lon: -73.80852987 };

/** The path through `location` and the vertex nearest it, where a replay starts. */
export function demoPath(route: RailRoute | undefined, location: Coordinate = DEMO_LOCATION) {
  let path: [number, number][] = [];
  let startIndex = 0;
  let nearest = Infinity;
  for (const candidate of route?.paths ?? []) {
    for (let index = 0; index < candidate.length; index++) {
      const [lat, lon] = candidate[index];
      const meters = distance(location, { lat, lon });
      if (
        meters < nearest - 1 ||
        (Math.abs(meters - nearest) <= 1 && candidate.length > path.length)
      ) {
        nearest = meters;
        path = candidate;
        startIndex = index;
      }
    }
  }
  return { path, startIndex };
}

export function pathTimeline(path: [number, number][]) {
  const meters = [0];
  for (let i = 1; i < path.length; i++) {
    meters.push(
      meters[i - 1] +
        distance(
          { lat: path[i - 1][0], lon: path[i - 1][1] },
          { lat: path[i][0], lon: path[i][1] },
        ),
    );
  }
  return { path, meters, total: meters[meters.length - 1] ?? 0 };
}

export function pointAlong(
  timeline: ReturnType<typeof pathTimeline>,
  traveled: number,
) {
  if (!timeline.path.length) return null;
  const offset = Math.max(0, Math.min(timeline.total, traveled));
  let i = 1;
  while (i < timeline.meters.length - 1 && timeline.meters[i] < offset) i++;
  const a = timeline.path[Math.max(0, i - 1)],
    b = timeline.path[Math.min(i, timeline.path.length - 1)];
  const t =
    (offset - timeline.meters[Math.max(0, i - 1)]) /
    (timeline.meters[i] - timeline.meters[Math.max(0, i - 1)] || 1);
  return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t };
}
