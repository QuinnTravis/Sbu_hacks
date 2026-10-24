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

export function isPointedAt(
  position: Coordinate,
  heading: number | null,
  place: Coordinate,
  radius = 1200,
  halfAngle = 22,
): boolean {
  return (
    heading !== null &&
    Number.isFinite(heading) &&
    distance(position, place) <= radius &&
    Math.abs(angleDelta(bearing(position, place), heading)) <= halfAngle
  );
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
