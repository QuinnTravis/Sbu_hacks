// Indexed view of a timetable plus the station graphs and delay models that
// together form the shared "world" every feature runs on.

import type { DelayModel } from './delays';
import type { ModelContext, Pattern, StationGraph, Timetable, Trip } from './types';

export interface World {
  tt: Timetable;
  graphs: Record<string, StationGraph>;
  delayModels: Record<string, DelayModel>;
  idx: NetworkIndex;
}

export interface NetworkIndex {
  patternsByStop: Map<string, { pattern: Pattern; index: number }[]>;
  transfersFrom: Map<string, { to: string; minTransferSec: number }[]>;
  /** Trips per pattern as objects, sorted by departure from the first stop. */
  patternTrips: Map<string, Trip[]>;
}

export function buildIndex(tt: Timetable): NetworkIndex {
  const patternsByStop = new Map<string, { pattern: Pattern; index: number }[]>();
  const patternTrips = new Map<string, Trip[]>();
  for (const p of tt.patterns) {
    p.stops.forEach((s, i) => {
      if (!patternsByStop.has(s)) patternsByStop.set(s, []);
      patternsByStop.get(s)!.push({ pattern: p, index: i });
    });
    const trips = p.tripIds.map((id) => tt.trips[id]);
    trips.sort((a, b) => a.stopTimes[0].dep - b.stopTimes[0].dep);
    patternTrips.set(p.id, trips);
  }
  const transfersFrom = new Map<string, { to: string; minTransferSec: number }[]>();
  for (const t of tt.transfers) {
    if (!transfersFrom.has(t.from)) transfersFrom.set(t.from, []);
    transfersFrom.get(t.from)!.push({ to: t.to, minTransferSec: t.minTransferSec });
  }
  return { patternsByStop, transfersFrom, patternTrips };
}

export function makeWorld(
  tt: Timetable,
  graphs: Record<string, StationGraph>,
  delayModels: Record<string, DelayModel>,
): World {
  return { tt, graphs, delayModels, idx: buildIndex(tt) };
}

export function stopIndex(trip: Trip, stopId: string, from = 0): number {
  for (let i = from; i < trip.stopTimes.length; i++) if (trip.stopTimes[i].stopId === stopId) return i;
  return -1;
}

export function sameStopChangeSec(world: World, stopId: string): number {
  return world.tt.stops[stopId]?.sameStopChangeSec ?? 120;
}

/**
 * Next trip of a route/direction that departs `fromStop` at or after `after`
 * and later reaches `toStop`. This is how a rider recovers from a missed
 * connection: wait for the next train on the same line.
 */
export function nextTripServing(
  world: World,
  routeId: string,
  directionId: 0 | 1,
  fromStop: string,
  toStop: string,
  after: number,
  excludeTripId?: string,
): { trip: Trip; fromIdx: number; toIdx: number } | null {
  let best: { trip: Trip; fromIdx: number; toIdx: number } | null = null;
  for (const { pattern, index } of world.idx.patternsByStop.get(fromStop) ?? []) {
    if (pattern.routeId !== routeId || pattern.directionId !== directionId) continue;
    const toIdx = pattern.stops.indexOf(toStop, index + 1);
    if (toIdx < 0) continue;
    for (const trip of world.idx.patternTrips.get(pattern.id) ?? []) {
      if (trip.id === excludeTripId) continue;
      const dep = trip.stopTimes[index].dep;
      if (dep < after) continue;
      if (!best || dep < best.trip.stopTimes[best.fromIdx].dep) best = { trip, fromIdx: index, toIdx };
      break;
    }
  }
  return best;
}

export function outagesFrom(ctx: ModelContext): Set<string> {
  const s = new Set<string>();
  for (const a of ctx.realtime?.alerts ?? []) for (const e of a.edgeOutages ?? []) s.add(e);
  return s;
}
