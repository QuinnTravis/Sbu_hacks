import type { Coordinate, RailRoute } from "./types";

const R = 6371008.8;
const rad = (n: number) => (n * Math.PI) / 180;
export const normalize = (n: number) => ((n % 360) + 360) % 360;
export const angleDelta = (a: number, b: number) => ((a - b + 540) % 360) - 180;

export function distance(a: Coordinate, b: Coordinate): number {
  const dlat = rad(b.lat - a.lat),
    dlon = rad(b.lon - a.lon);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: Coordinate, b: Coordinate): number {
  const l = rad(b.lon - a.lon);
  return normalize(
    (Math.atan2(
      Math.sin(l) * Math.cos(rad(b.lat)),
      Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
        Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(l),
    ) *
      180) /
      Math.PI,
  );
}

export function segmentDistance(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate,
): number {
  const scale = Math.cos(rad(p.lat));
  const ax = (a.lon - p.lon) * scale,
    ay = a.lat - p.lat;
  const bx = (b.lon - p.lon) * scale,
    by = b.lat - p.lat;
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
  );
  return ((Math.hypot(ax + t * dx, ay + t * dy) * Math.PI) / 180) * R;
}

export function routeDistance(p: Coordinate, route: RailRoute): number {
  let best = Infinity;
  for (const path of route.paths)
    for (let i = 1; i < path.length; i++) {
      best = Math.min(
        best,
        segmentDistance(
          p,
          { lat: path[i - 1][0], lon: path[i - 1][1] },
          { lat: path[i][0], lon: path[i][1] },
        ),
      );
    }
  return best;
}

/** Shared with the ride-map cone so the drawn wedge cannot drift from detection. */
export const POINTING_RADIUS_M = 1200;
export const POINTING_HALF_ANGLE_DEG = 22;

export function isPointedAt(
  position: Coordinate,
  heading: number | null,
  place: Coordinate,
  radius = POINTING_RADIUS_M,
  halfAngle = POINTING_HALF_ANGLE_DEG,
): boolean {
  return (
    heading !== null &&
    Number.isFinite(heading) &&
    distance(position, place) <= radius &&
    Math.abs(angleDelta(bearing(position, place), heading)) <= halfAngle
  );
}

const CONE_ARC_STEPS = 24;

export function destination(
  origin: Coordinate,
  bearingDeg: number,
  meters: number,
): Coordinate {
  const angular = meters / R;
  const theta = rad(bearingDeg);
  const lat1 = rad(origin.lat);
  const lon1 = rad(origin.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  const lon = (((lon2 * 180) / Math.PI + 540) % 360) - 180;
  return { lat: (lat2 * 180) / Math.PI, lon };
}

/** Closed ring: rider, then the arc (1200 m by default) from heading−22° to heading+22°. */
export function pointingConeRing(
  origin: Coordinate,
  heading: number,
  radius = POINTING_RADIUS_M,
): Coordinate[] {
  const ring: Coordinate[] = [origin];
  for (let step = 0; step <= CONE_ARC_STEPS; step += 1) {
    const edge =
      heading -
      POINTING_HALF_ANGLE_DEG +
      (2 * POINTING_HALF_ANGLE_DEG * step) / CONE_ARC_STEPS;
    ring.push(destination(origin, edge, radius));
  }
  ring.push(origin);
  return ring;
}

export function pointingConeLngLats(
  origin: Coordinate,
  heading: number,
  radius = POINTING_RADIUS_M,
): [number, number][] {
  return pointingConeRing(origin, heading, radius).map((point) => [point.lon, point.lat]);
}

function localMeters(origin: Coordinate, point: Coordinate): [number, number] {
  return [
    rad(point.lon - origin.lon) * Math.cos(rad(origin.lat)) * R,
    rad(point.lat - origin.lat) * R,
  ];
}

/** Point-in-polygon on the drawn cone, not a second copy of the detection test. */
export function pointingConeContains(
  origin: Coordinate,
  heading: number,
  place: Coordinate,
  radius = POINTING_RADIUS_M,
): boolean {
  if (!Number.isFinite(heading)) return false;
  const polygon = pointingConeRing(origin, heading, radius).map((point) =>
    localMeters(origin, point),
  );
  const [x, y] = localMeters(origin, place);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Zoom so the cone's arc reaches the nearer edge of the ride map, with a small margin. */
export function pointingConeZoom(latitude: number, viewportPx: number, radius = POINTING_RADIUS_M): number {
  const half = Math.max(48, viewportPx / 2);
  const metersPerPixel = radius / (half * 0.86);
  const latitudeRad = rad(Math.min(80, Math.max(-80, latitude)));
  const zoom = Math.log2(
    (156543.03392 * Math.cos(latitudeRad)) / metersPerPixel,
  );
  if (!Number.isFinite(zoom)) return 13;
  return Math.min(15.5, Math.max(8, zoom));
}

// Heading of the rear camera's optical axis projected onto the earth plane.
// DeviceOrientation angles follow the W3C Z-X'-Y'' rotation matrix.
// Screen rotation doesn't change the rear camera's -Z axis.
export function cameraHeading(
  alpha: number,
  beta: number,
  gamma: number,
): number | null {
  const a = rad(alpha),
    b = rad(beta),
    g = rad(gamma);
  const east = -(
    Math.cos(a) * Math.sin(g) +
    Math.sin(a) * Math.sin(b) * Math.cos(g)
  );
  const north = -(
    Math.sin(a) * Math.sin(g) -
    Math.cos(a) * Math.sin(b) * Math.cos(g)
  );
  if (Math.hypot(east, north) < 0.25) return null; // Flat phone: camera points at sky/ground.
  return normalize((Math.atan2(east, north) * 180) / Math.PI);
}

export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${(meters / 1000).toFixed(1)} km`;
}
