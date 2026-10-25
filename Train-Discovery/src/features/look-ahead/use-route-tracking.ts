"use client";

import { useEffect, useMemo, useState } from "react";
import {
  pointAtKm,
  projectOnRoute,
  routeIndex,
  smoothSpeed,
  travelDirection,
  type Direction,
  type RouteIndex,
} from "@/lib/route-geometry";
import type { Coordinate, Position, RailRoute } from "@/lib/types";

export type RouteTracking = {
  index: RouteIndex | null;
  km: number | null;
  speedKmh: number | null;
  direction: Direction | null;
  /** True while the position is dead-reckoned along the track because GPS dropped. */
  estimated: boolean;
  estimatedPosition: Coordinate | null;
};

/** A fix older than this starts dead reckoning, e.g. inside a tunnel. */
export const GPS_STALE_MS = 10_000;
/** Stop estimating after this long without a fix. */
export const MAX_RECKON_MS = 5 * 60_000;

type Fix = { km: number; at: number; speedKmh: number | null; direction: Direction | null };

const NONE: RouteTracking = { index: null, km: null, speedKmh: null, direction: null, estimated: false, estimatedPosition: null };

/** Kilometers along the ride from replay or GPS, with smoothed speed and direction of travel. */
export function useRouteTracking(input: {
  route: RailRoute | undefined;
  enabled: boolean;
  position: Position | null;
  replay: { km: number; speedKmh: number; direction: Direction } | null;
  now: number;
}): RouteTracking {
  const { route, enabled, position, replay, now } = input;
  const index = useMemo(
    () => (enabled && route?.paths.length === 1 ? routeIndex(route.paths[0]) : null),
    [enabled, route],
  );
  const [fix, setFix] = useState<{ index: RouteIndex; fix: Fix } | null>(null);

  useEffect(() => {
    if (!index || replay || !position) return;
    queueMicrotask(() =>
      setFix((current) => {
        const previous = current?.index === index ? current.fix : null;
        if (previous && position.timestamp <= previous.at) return current;
        const projection = projectOnRoute(index, position, previous ? { km: previous.km, windowKm: 6 } : undefined);
        if (!projection || projection.lateralM > 3000) return current;
        let speedKmh = previous?.speedKmh ?? null;
        let direction = previous?.direction ?? null;
        if (previous) {
          const hours = (position.timestamp - previous.at) / 3_600_000;
          if (hours > 0) speedKmh = smoothSpeed(previous.speedKmh, Math.abs(projection.km - previous.km) / hours);
          direction = travelDirection(previous.km, projection.km) ?? direction;
        }
        return { index, fix: { km: projection.km, at: position.timestamp, speedKmh, direction } };
      }),
    );
  }, [index, position, replay]);

  if (!index) return NONE;
  if (replay) {
    return { index, km: replay.km, speedKmh: replay.speedKmh, direction: replay.direction, estimated: false, estimatedPosition: null };
  }
  const last = fix?.index === index ? fix.fix : null;
  if (!last) return { ...NONE, index };
  const age = now - last.at;
  if (age > GPS_STALE_MS && age < MAX_RECKON_MS && last.speedKmh && last.speedKmh > 5 && last.direction) {
    const km = Math.max(0, Math.min(index.totalKm, last.km + last.direction * last.speedKmh * (age / 3_600_000)));
    return { index, km, speedKmh: last.speedKmh, direction: last.direction, estimated: true, estimatedPosition: pointAtKm(index, km) };
  }
  return { index, km: last.km, speedKmh: last.speedKmh, direction: last.direction, estimated: false, estimatedPosition: null };
}
