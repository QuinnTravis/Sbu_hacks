import type { Coordinate } from "./types";

/**
 * Distance along a route and which side of the track a place is on.
 *
 * The route runs in its canonical direction (increasing km). For the
 * California Zephyr that is westbound, Chicago to Emeryville. All math is
 * local: no request leaves the device.
 */

const R = 6371008.8;
const rad = (n: number) => (n * Math.PI) / 180;

export type RouteIndex = {
  /** Vertices as [lat, lon], in canonical order. */
  path: [number, number][];
  /** Cumulative kilometers at each vertex. */
  km: number[];
  totalKm: number;
};

export type Projection = {
  /** Kilometers from the start of the route to the closest point. */
  km: number;
  /** Meters from the place to the closest point on the track. */
  lateralM: number;
  /** Positive when the place is left of a forward-facing passenger traveling in the canonical direction. */
  signedLateralM: number;
  /** True when the closest point is an end of the route rather than beside it. */
  atEnd: boolean;
};

export type Side = "left" | "right" | "ahead" | "both";
export type Facing = "forward" | "backward";
export type Direction = 1 | -1;

function haversine(a: [number, number], b: [number, number]): number {
  const dlat = rad(b[0] - a[0]);
  const dlon = rad(b[1] - a[1]);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeIndex(path: [number, number][]): RouteIndex {
  const km = [0];
  for (let i = 1; i < path.length; i++) {
    km.push(km[i - 1] + haversine(path[i - 1], path[i]) / 1000);
  }
  return { path, km, totalKm: km[km.length - 1] ?? 0 };
}

/** East/north meters of `point` from `origin`. Accurate at corridor scale. */
function local(origin: [number, number], point: [number, number]): [number, number] {
  return [
    rad(point[1] - origin[1]) * Math.cos(rad(origin[0])) * R,
    rad(point[0] - origin[0]) * R,
  ];
}

/**
 * Closest approach of `point` to the route. `nearKm` limits the search to a
 * window around a previous position, so a curve that doubles back cannot make
 * the train jump to the wrong stretch.
 */
export function projectOnRoute(
  index: RouteIndex,
  point: Coordinate,
  nearKm?: { km: number; windowKm: number },
): Projection | null {
  const { path, km } = index;
  if (path.length < 2) return null;
  const p: [number, number] = [point.lat, point.lon];
  let best: { d2: number; i: number; t: number; x: number; y: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    if (nearKm && (km[i] < nearKm.km - nearKm.windowKm || km[i - 1] > nearKm.km + nearKm.windowKm)) continue;
    const [ax, ay] = local(p, path[i - 1]);
    const [bx, by] = local(p, path[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx;
    const y = ay + t * dy;
    const d2 = x * x + y * y;
    if (!best || d2 < best.d2) best = { d2, i, t, x, y };
  }
  if (!best) return nearKm ? projectOnRoute(index, point) : null;
  const { i, t } = best;
  const along = km[i - 1] + (km[i] - km[i - 1]) * t;
  // Tangent of the track at the closest point. At a vertex, blend both
  // neighbors so a place outside a bend gets one consistent side.
  const tangent = (a: number, b: number): [number, number] => {
    const [x0, y0] = local(path[a], path[a]);
    const [x1, y1] = local(path[a], path[b]);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    return [(x1 - x0) / len, (y1 - y0) / len];
  };
  let [tx, ty] = tangent(i - 1, i);
  if (t === 0 && i - 2 >= 0) {
    const [px, py] = tangent(i - 2, i - 1);
    tx += px;
    ty += py;
  } else if (t === 1 && i + 1 < path.length) {
    const [nx, ny] = tangent(i, i + 1);
    tx += nx;
    ty += ny;
  }
  // V points from the closest track point to the place.
  const vx = -best.x;
  const vy = -best.y;
  const cross = tx * vy - ty * vx;
  const lateralM = Math.sqrt(best.d2);
  const atEnd = (i === 1 && t === 0) || (i === path.length - 1 && t === 1);
  return {
    km: along,
    lateralM,
    signedLateralM: cross >= 0 ? lateralM : -lateralM,
    atEnd,
  };
}

/** Coordinate at a distance along the route, clamped to its ends. */
export function pointAtKm(index: RouteIndex, km: number): Coordinate | null {
  const { path } = index;
  if (!path.length) return null;
  const target = Math.max(0, Math.min(index.totalKm, km));
  let lo = 1;
  let hi = path.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (index.km[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = path[i - 1];
  const b = path[Math.min(i, path.length - 1)];
  const span = index.km[i] - index.km[i - 1];
  const t = span > 0 ? (target - index.km[i - 1]) / span : 0;
  return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t };
}

/** Within this lateral distance a place is on the line rather than to one side. */
export const ON_LINE_M = 150;

/**
 * Features the train runs through rather than past say "both sides", not
 * "ahead". A canyon's or town's recorded point can sit well off the track
 * while the line still runs through it, so their reach is wider.
 */
const THROUGH_M: Record<string, number> = { canyon: 1200, valley: 1200, town: 700, river: 300, lake: ON_LINE_M, forest: ON_LINE_M, park: ON_LINE_M };

export function sideOf(
  place: { signedLateralM?: number; areaKind?: string },
  direction: Direction,
  facing: Facing,
): Side | null {
  const signed = place.signedLateralM;
  if (typeof signed !== "number" || !Number.isFinite(signed)) return null;
  const through = place.areaKind ? THROUGH_M[place.areaKind] : undefined;
  if (through !== undefined && Math.abs(signed) <= through) return "both";
  if (Math.abs(signed) <= ON_LINE_M) return "ahead";
  let left = signed > 0;
  if (direction === -1) left = !left;
  if (facing === "backward") left = !left;
  return left ? "left" : "right";
}

/** Kilometers still to travel to `targetKm`. Negative once it has passed. */
export function kmAhead(targetKm: number, currentKm: number, direction: Direction): number {
  return (targetKm - currentKm) * direction;
}

/** Below this speed an ETA would be meaningless. */
export const MIN_ETA_SPEED_KMH = 5;

export function etaSeconds(
  targetKm: number,
  currentKm: number,
  direction: Direction,
  speedKmh: number | null,
): number | null {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < MIN_ETA_SPEED_KMH) return null;
  const ahead = kmAhead(targetKm, currentKm, direction);
  return (ahead / speedKmh) * 3600;
}

/** Exponential moving average of speed, so one jittery fix does not swing the ETA. */
export function smoothSpeed(previous: number | null, sample: number, alpha = 0.3): number {
  if (!Number.isFinite(sample) || sample < 0) return previous ?? 0;
  if (previous === null || !Number.isFinite(previous)) return sample;
  return previous + (sample - previous) * alpha;
}

/** Infer the direction of travel from two route positions. Null when it is unclear. */
export function travelDirection(fromKm: number, toKm: number, minKm = 0.03): Direction | null {
  const delta = toKm - fromKm;
  if (Math.abs(delta) < minKm) return null;
  return delta > 0 ? 1 : -1;
}
