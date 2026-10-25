// RAPTOR (Round-bAsed Public Transit Optimized Router, Delling et al. 2012).
// Round k finds the earliest arrival at every stop using at most k trips, so
// the result is the Pareto set over (arrival time, number of trips).

import { sameStopChangeSec, type World } from './network';
import type { Trip } from './types';

export interface RaptorQuery {
  access: { stopId: string; sec: number }[];
  egress: { stopId: string; sec: number }[];
  departSec: number;
  maxTrips: number;
  bannedRoutes?: ReadonlySet<string>;
  /**
   * Transfer time between stops (or within one stop when from === to).
   * Return null to forbid. Defaults to the published minimum transfer times.
   */
  transferSec?: (from: string, to: string) => number | null;
}

export interface Ride {
  tripId: string;
  routeId: string;
  fromStop: string;
  toStop: string;
  fromIdx: number;
  toIdx: number;
  dep: number;
  arr: number;
}

export interface Journey {
  key: string;
  rides: Ride[];
  accessStop: string;
  accessSec: number;
  egressStop: string;
  egressSec: number;
  /** Time the rider leaves the origin. */
  departSec: number;
  /** Time the rider reaches the destination. */
  arriveSec: number;
}

type ArrLabel = { trip: Trip; boardStop: string; boardIdx: number; alightIdx: number };
type ReadyLabel =
  | { kind: 'access'; sec: number }
  | { kind: 'same'; round: number; stop: string }
  | { kind: 'walk'; round: number; from: string; sec: number };

function firstTripFrom(trips: Trip[], i: number, t: number): Trip | null {
  let lo = 0;
  let hi = trips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (trips[mid].stopTimes[i].dep < t) lo = mid + 1;
    else hi = mid;
  }
  // Trips in a pattern are FIFO in our data, but guard against overtaking.
  for (let j = lo; j < trips.length; j++) if (trips[j].stopTimes[i].dep >= t) return trips[j];
  return null;
}

export function journeyKey(rides: Ride[]): string {
  return rides.map((r) => `${r.tripId}@${r.fromStop}>${r.toStop}`).join('|');
}

export function raptor(world: World, q: RaptorQuery): Journey[] {
  const { idx } = world;
  const transferSec =
    q.transferSec ??
    ((from: string, to: string) => {
      if (from === to) return sameStopChangeSec(world, from);
      return idx.transfersFrom.get(from)?.find((x) => x.to === to)?.minTransferSec ?? null;
    });

  const ready: Map<string, number>[] = [new Map()];
  const readyLab: Map<string, ReadyLabel>[] = [new Map()];
  const arrLab: Map<string, ArrLabel>[] = [new Map()];
  const bestArr = new Map<string, number>();
  let marked = new Set<string>();

  for (const a of q.access) {
    const t = q.departSec + a.sec;
    if (t < (ready[0].get(a.stopId) ?? Infinity)) {
      ready[0].set(a.stopId, t);
      readyLab[0].set(a.stopId, { kind: 'access', sec: a.sec });
      marked.add(a.stopId);
    }
  }
  // Footpaths from access stops (e.g. a rider re-planning from a subway
  // platform can walk to the adjoining rail station).
  for (const a of q.access) {
    for (const tr of idx.transfersFrom.get(a.stopId) ?? []) {
      const sec = transferSec(a.stopId, tr.to);
      if (sec === null) continue;
      const t = q.departSec + a.sec + sec;
      if (t < (ready[0].get(tr.to) ?? Infinity)) {
        ready[0].set(tr.to, t);
        readyLab[0].set(tr.to, { kind: 'access', sec: a.sec + sec });
        marked.add(tr.to);
      }
    }
  }

  let bestTarget = Infinity;
  const journeys: Journey[] = [];

  for (let k = 1; k <= q.maxTrips && marked.size; k++) {
    const readyPrev = ready[k - 1];
    const arrK = new Map<string, number>();
    const arrLabK = new Map<string, ArrLabel>();

    const queue = new Map<string, { patternIdx: number; i: number }>();
    for (const s of marked) {
      for (const { pattern, index } of idx.patternsByStop.get(s) ?? []) {
        if (q.bannedRoutes?.has(pattern.routeId)) continue;
        const cur = queue.get(pattern.id);
        if (!cur || index < cur.i) queue.set(pattern.id, { patternIdx: world.tt.patterns.indexOf(pattern), i: index });
      }
    }

    const arrivedThisRound = new Set<string>();
    for (const [pid, { patternIdx, i: start }] of queue) {
      const pattern = world.tt.patterns[patternIdx];
      const trips = idx.patternTrips.get(pid)!;
      let trip: Trip | null = null;
      let boardIdx = -1;
      for (let i = start; i < pattern.stops.length; i++) {
        const stop = pattern.stops[i];
        if (trip) {
          const a = trip.stopTimes[i].arr;
          if (a < (bestArr.get(stop) ?? Infinity) && a < bestTarget) {
            arrK.set(stop, a);
            arrLabK.set(stop, { trip, boardStop: pattern.stops[boardIdx], boardIdx, alightIdx: i });
            bestArr.set(stop, a);
            arrivedThisRound.add(stop);
          }
        }
        const r = readyPrev.get(stop);
        if (r !== undefined && (!trip || r <= trip.stopTimes[i].dep)) {
          const t = firstTripFrom(trips, i, r);
          if (t && (!trip || t.stopTimes[i].dep < trip.stopTimes[i].dep)) {
            trip = t;
            boardIdx = i;
          }
        }
      }
    }

    const readyK = new Map(readyPrev);
    const readyLabK = new Map(readyLab[k - 1]);
    const nextMarked = new Set<string>();
    for (const s of arrivedThisRound) {
      const a = arrK.get(s)!;
      const same = transferSec(s, s);
      if (same !== null && a + same < (readyK.get(s) ?? Infinity)) {
        readyK.set(s, a + same);
        readyLabK.set(s, { kind: 'same', round: k, stop: s });
        nextMarked.add(s);
      }
      for (const tr of idx.transfersFrom.get(s) ?? []) {
        const sec = transferSec(s, tr.to);
        if (sec === null) continue;
        if (a + sec < (readyK.get(tr.to) ?? Infinity)) {
          readyK.set(tr.to, a + sec);
          readyLabK.set(tr.to, { kind: 'walk', round: k, from: s, sec });
          nextMarked.add(tr.to);
        }
      }
    }
    ready.push(readyK);
    readyLab.push(readyLabK);
    arrLab.push(arrLabK);

    let roundBest = Infinity;
    let roundStop: { stopId: string; sec: number } | null = null;
    for (const e of q.egress) {
      const a = arrK.get(e.stopId);
      if (a !== undefined && a + e.sec < roundBest) {
        roundBest = a + e.sec;
        roundStop = e;
      }
    }
    if (roundStop && roundBest < bestTarget) {
      bestTarget = roundBest;
      journeys.push(extract(k, roundStop.stopId, roundStop.sec));
    }
    marked = nextMarked;
  }
  return journeys;

  function extract(k: number, stop: string, egressSec: number): Journey {
    const rides: Ride[] = [];
    let round = k;
    let s = stop;
    let accessStop = '';
    let accessSec = 0;
    for (;;) {
      const lab = arrLab[round].get(s)!;
      const st = lab.trip.stopTimes;
      rides.unshift({
        tripId: lab.trip.id,
        routeId: lab.trip.routeId,
        fromStop: lab.boardStop,
        toStop: s,
        fromIdx: lab.boardIdx,
        toIdx: lab.alightIdx,
        dep: st[lab.boardIdx].dep,
        arr: st[lab.alightIdx].arr,
      });
      const rl = readyLab[round - 1].get(lab.boardStop)!;
      if (rl.kind === 'access') {
        accessStop = lab.boardStop;
        accessSec = rl.sec;
        break;
      }
      round = rl.round;
      s = rl.kind === 'same' ? rl.stop : rl.from;
    }
    const arriveSec = rides[rides.length - 1].arr + egressSec;
    return {
      key: journeyKey(rides),
      rides,
      accessStop,
      accessSec,
      egressStop: stop,
      egressSec,
      departSec: rides[0].dep - accessSec,
      arriveSec,
    };
  }
}

/**
 * Earliest arrival at the egress stops when starting from `stopId` at `afterSec`.
 * Used to re-plan after a missed connection.
 */
export function earliestArrival(
  world: World,
  stopId: string,
  afterSec: number,
  egress: { stopId: string; sec: number }[],
  transferSec?: RaptorQuery['transferSec'],
): number | null {
  const direct = egress.find((e) => e.stopId === stopId);
  const js = raptor(world, { access: [{ stopId, sec: 0 }], egress, departSec: afterSec, maxTrips: 4, transferSec });
  let best = direct ? afterSec + direct.sec : Infinity;
  for (const j of js) best = Math.min(best, j.arriveSec);
  return best === Infinity ? null : best;
}
