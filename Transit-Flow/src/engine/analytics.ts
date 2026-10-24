// Network reliability analysis and schedule-intervention simulation.
// Replays synthetic service days through the same station graphs, transfer
// model and delay model that the rider planner uses.

import { crowdAt } from './crowd';
import { rampAt, sampleBaseDelay } from './delays';
import { eventDelayScale } from './crowd';
import { nextTripServing, makeWorld, stopIndex, type World } from './network';
import { hashSeed, mulberry32, summarize, wilson, type Summary } from './random';
import { resolveTransfer, sampleTransferSec, scheduledMinTransfer, type TransferModel } from './transfer';
import type { EventWindow, ModelContext, StationGraph, Timetable, Trip } from './types';

export interface FlowDef {
  id: string;
  label: string;
  fromStop: string;
  toStop: string;
  inRoute: string;
  inDir: 0 | 1;
  outRoute: string;
  outDir: 0 | 1;
  peakPax: number;
  eventMultiplier: number;
}

/** Riders arriving on one inbound trip who want to continue on one flow. */
export interface Cohort {
  id: string;
  flow: FlowDef;
  stationId?: string;
  inTripId: string;
  inIdx: number;
  inArr: number;
  outTripId: string;
  outIdx: number;
  outDep: number;
  windowSec: number;
  schedMinSec: number;
  /** Next departure on the same line if the planned one is missed. */
  nextTripId: string | null;
  missWaitSec: number | null;
  basePax: number;
}

export const TIMED_WINDOW_SEC = 20 * 60;

export function enumerateCohorts(
  world: World,
  flows: FlowDef[],
  hourProfile: (sec: number) => number,
): Cohort[] {
  const { tt, idx } = world;
  const out: Cohort[] = [];
  for (const flow of flows) {
    const mtt = scheduledMinTransfer(world, flow.fromStop, flow.toStop);
    if (mtt === null) continue;
    for (const { pattern, index } of idx.patternsByStop.get(flow.fromStop) ?? []) {
      if (pattern.routeId !== flow.inRoute || pattern.directionId !== flow.inDir || index === 0) continue;
      for (const inTrip of idx.patternTrips.get(pattern.id) ?? []) {
        const inArr = inTrip.stopTimes[index].arr;
        let best: { trip: Trip; i: number } | null = null;
        for (const o of idx.patternsByStop.get(flow.toStop) ?? []) {
          const p = o.pattern;
          if (p.routeId !== flow.outRoute || p.directionId !== flow.outDir || o.index === p.stops.length - 1) continue;
          // Riders only transfer if the inbound trip doesn't already continue to the next stop.
          if (stopIndex(inTrip, p.stops[o.index + 1], index) >= 0) continue;
          for (const t of idx.patternTrips.get(p.id) ?? []) {
            if (t.id === inTrip.id) continue;
            const dep = t.stopTimes[o.index].dep;
            if (dep < inArr + mtt) continue;
            if (!best || dep < best.trip.stopTimes[best.i].dep) best = { trip: t, i: o.index };
            break;
          }
        }
        if (!best) continue;
        const outDep = best.trip.stopTimes[best.i].dep;
        if (outDep - inArr > 2 * 3600) continue;
        const last = best.trip.stopTimes[best.trip.stopTimes.length - 1].stopId;
        const next = nextTripServing(world, flow.outRoute, flow.outDir, flow.toStop, last, outDep + 1, best.trip.id);
        out.push({
          id: `${flow.id}|${inTrip.id}`,
          flow,
          stationId: tt.stops[flow.fromStop]?.stationId,
          inTripId: inTrip.id,
          inIdx: index,
          inArr,
          outTripId: best.trip.id,
          outIdx: best.i,
          outDep,
          windowSec: outDep - inArr,
          schedMinSec: mtt,
          nextTripId: next?.trip.id ?? null,
          missWaitSec: next ? next.trip.stopTimes[next.fromIdx].dep - outDep : null,
          basePax: flow.peakPax * hourProfile(inArr),
        });
      }
    }
  }
  return out;
}

// ---------------- Interventions ----------------

export type Intervention =
  | { kind: 'none' }
  | {
      kind: 'hold';
      stopId: string;
      routeId: string;
      directionId: 0 | 1;
      maxHoldSec: number;
      /** Only hold for riders on these flows (default: any flow into this stop). */
      flowIds?: string[];
    }
  | { kind: 'shift'; tripId: string; shiftSec: number }
  | { kind: 'edge'; stationId: string; edgeId: string; reductionPct: number };

export function applyIntervention(world: World, iv: Intervention): World {
  if (iv.kind === 'shift') {
    const trip = world.tt.trips[iv.tripId];
    if (!trip) return world;
    const shifted: Trip = {
      ...trip,
      stopTimes: trip.stopTimes.map((s) => ({ ...s, arr: s.arr + iv.shiftSec, dep: s.dep + iv.shiftSec })),
    };
    const tt: Timetable = { ...world.tt, trips: { ...world.tt.trips, [trip.id]: shifted } };
    return makeWorld(tt, world.graphs, world.delayModels);
  }
  if (iv.kind === 'edge') {
    const g = world.graphs[iv.stationId];
    if (!g) return world;
    const graph: StationGraph = {
      ...g,
      edges: g.edges.map((e) =>
        e.id === iv.edgeId ? { ...e, medianSec: e.medianSec * (1 - iv.reductionPct / 100) } : e,
      ),
    };
    return { ...world, graphs: { ...world.graphs, [iv.stationId]: graph } };
  }
  return world;
}

/** Headway conflicts a shift may create (two trips of a route at a stop within 3 min). */
export function shiftWarnings(world: World, iv: Intervention): string[] {
  if (iv.kind !== 'shift') return [];
  const trip = world.tt.trips[iv.tripId];
  if (!trip) return [];
  const warnings: string[] = [];
  for (const st of trip.stopTimes) {
    const t = st.dep + iv.shiftSec;
    for (const { pattern, index } of world.idx.patternsByStop.get(st.stopId) ?? []) {
      if (pattern.routeId !== trip.routeId || pattern.directionId !== trip.directionId) continue;
      for (const other of world.idx.patternTrips.get(pattern.id) ?? []) {
        if (other.id === trip.id) continue;
        if (Math.abs(other.stopTimes[index].dep - t) < 180) {
          warnings.push(
            `${world.tt.stops[st.stopId].name}: within 3 min of another ${world.tt.routes[trip.routeId].longName} train — track capacity not modelled.`,
          );
        }
      }
    }
  }
  return [...new Set(warnings)];
}

// ---------------- Day replay ----------------

export interface SimOptions {
  days: number;
  seed: number;
  events: EventWindow[];
  intervention: Intervention;
  onboardLoad: (routeId: string, sec: number) => number;
}

export interface CohortStats {
  cohort: Cohort;
  pax: number;
  pSuccess: number;
  ci: [number, number];
  /** Mean seconds from inbound arrival until actually departing on the flow. */
  meanWaitSec: number;
  /** Seconds lost to misses (relative to the planned departure), per rider on average. */
  meanMissLossSec: number;
  physical: Summary;
  crowd: number;
  phantom: boolean;
  model: TransferModel;
}

export interface SimResult {
  cohorts: CohortStats[];
  days: number;
  /** Passenger-minutes of hold delay imposed on riders already on board, per day. */
  holdPaxMinPerDay: number;
  holdsPerDay: number;
}

function ctxFor(events: EventWindow[]): ModelContext {
  return { nowSec: 0, events, realtime: null, staleAfterSec: 300, accessible: false, familiarity: 'regular' };
}

export function simulate(world: World, cohorts: Cohort[], opts: SimOptions): SimResult {
  const { tt } = world;
  const ctx = ctxFor(opts.events);
  const iv = opts.intervention;
  const models = new Map<string, TransferModel>();
  for (const c of cohorts) {
    models.set(
      c.id,
      resolveTransfer(world, ctx, c.flow.fromStop, tt.trips[c.inTripId], c.flow.toStop, tt.trips[c.outTripId], c.inArr),
    );
  }
  // Process in order of planned outbound departure so holds propagate downstream.
  const groups = new Map<string, Cohort[]>();
  for (const c of [...cohorts].sort((a, b) => a.outDep - b.outDep)) {
    const k = `${c.outTripId}@${c.outIdx}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  const success = new Map<string, number>();
  const waitSum = new Map<string, number>();
  const lossSum = new Map<string, number>();
  const physical = new Map<string, number[]>();
  let holdPaxSec = 0;
  let holds = 0;

  for (let d = 0; d < opts.days; d++) {
    const baseDelay = new Map<string, number>();
    const hold = new Map<string, { idx: number; sec: number }>();
    const delayOf = (trip: Trip) => {
      let v = baseDelay.get(trip.id);
      if (v === undefined) {
        const m = world.delayModels[tt.routes[trip.routeId].delayModelId];
        v = sampleBaseDelay(m, mulberry32(hashSeed(opts.seed, d, trip.id)), eventDelayScale(trip, tt, opts.events));
        baseDelay.set(trip.id, v);
      }
      return v;
    };
    const holdAt = (trip: Trip, i: number, inclusive: boolean) => {
      const h = hold.get(trip.id);
      if (!h) return 0;
      return (inclusive ? i >= h.idx : i > h.idx) ? h.sec : 0;
    };
    const arrAt = (trip: Trip, i: number) =>
      trip.stopTimes[i].arr + Math.max(-60, delayOf(trip) * rampAt(trip, i)) + holdAt(trip, i, false);
    const depAt = (trip: Trip, i: number) =>
      trip.stopTimes[i].dep + Math.max(0, delayOf(trip) * rampAt(trip, i)) + holdAt(trip, i, true);

    for (const group of groups.values()) {
      const outTrip = tt.trips[group[0].outTripId];
      const outIdx = group[0].outIdx;
      const depBefore = depAt(outTrip, outIdx);
      const needs = group.map((c) => {
        const m = models.get(c.id)!;
        const rng = mulberry32(hashSeed(opts.seed, d, c.id, 'walk'));
        const walk = sampleTransferSec(m, rng, 'regular');
        let ph = physical.get(c.id);
        if (!ph) physical.set(c.id, (ph = []));
        ph.push(walk);
        const ready = arrAt(tt.trips[c.inTripId], c.inIdx) + walk;
        return { c, need: ready - (depBefore - m.outBoardBufferSec), ready };
      });
      let holdSec = 0;
      if (
        iv.kind === 'hold' &&
        outTrip.routeId === iv.routeId &&
        outTrip.directionId === iv.directionId &&
        outTrip.stopTimes[outIdx].stopId === iv.stopId
      ) {
        for (const { c, need } of needs) {
          if (iv.flowIds && !iv.flowIds.includes(c.flow.id)) continue;
          if (need > 0 && need <= iv.maxHoldSec) holdSec = Math.max(holdSec, need);
        }
        if (holdSec > 0) {
          hold.set(outTrip.id, { idx: outIdx, sec: holdSec });
          holdPaxSec += opts.onboardLoad(outTrip.routeId, outTrip.stopTimes[outIdx].dep) * holdSec;
          holds++;
        }
      }
      for (const { c, need, ready } of needs) {
        const ok = need <= holdSec;
        const actualDep = depBefore + holdSec;
        if (ok) {
          success.set(c.id, (success.get(c.id) ?? 0) + 1);
          waitSum.set(c.id, (waitSum.get(c.id) ?? 0) + Math.max(0, actualDep - c.inArr));
        } else {
          // Next departure on the same line, with its own simulated delay.
          let wait: number;
          if (c.nextTripId) {
            const nt = tt.trips[c.nextTripId];
            const ni = stopIndex(nt, c.flow.toStop);
            wait = Math.max(depAt(nt, ni), ready) - c.inArr;
          } else wait = 3 * 3600;
          waitSum.set(c.id, (waitSum.get(c.id) ?? 0) + wait);
          lossSum.set(c.id, (lossSum.get(c.id) ?? 0) + (c.missWaitSec ?? 3 * 3600));
        }
      }
    }
  }

  const stats: CohortStats[] = cohorts.map((c) => {
    const k = success.get(c.id) ?? 0;
    const p = k / opts.days;
    const crowd = crowdAt(c.stationId, c.inArr, opts.events);
    const pax = c.basePax * (crowd > 1.05 ? c.flow.eventMultiplier : 1);
    return {
      cohort: c,
      pax,
      pSuccess: p,
      ci: wilson(k, opts.days),
      meanWaitSec: (waitSum.get(c.id) ?? 0) / opts.days,
      meanMissLossSec: (lossSum.get(c.id) ?? 0) / opts.days,
      physical: summarize(physical.get(c.id) ?? [NaN]),
      crowd,
      phantom: c.windowSec >= c.schedMinSec && c.windowSec <= TIMED_WINDOW_SEC && p < 0.7,
      model: models.get(c.id)!,
    };
  });
  return {
    cohorts: stats,
    days: opts.days,
    holdPaxMinPerDay: holdPaxSec / 60 / opts.days,
    holdsPerDay: holds / opts.days,
  };
}

// ---------------- Aggregation ----------------

export interface Totals {
  cohorts: number;
  timedConnections: number;
  phantom: number;
  paxPerDay: number;
  madePaxPerDay: number;
  missedPaxPerDay: number;
  /** Passenger-minutes lost to missed connections per day. */
  missPaxMinPerDay: number;
  /** Passenger-minutes spent waiting at the transfer per day (planned wait + misses). */
  waitPaxMinPerDay: number;
}

export function totals(stats: CohortStats[], filter: (s: CohortStats) => boolean = () => true): Totals {
  const t: Totals = { cohorts: 0, timedConnections: 0, phantom: 0, paxPerDay: 0, madePaxPerDay: 0, missedPaxPerDay: 0, missPaxMinPerDay: 0, waitPaxMinPerDay: 0 };
  for (const s of stats) {
    if (!filter(s)) continue;
    t.cohorts++;
    if (s.cohort.windowSec <= TIMED_WINDOW_SEC) t.timedConnections++;
    if (s.phantom) t.phantom++;
    t.paxPerDay += s.pax;
    t.madePaxPerDay += s.pax * s.pSuccess;
    t.missedPaxPerDay += s.pax * (1 - s.pSuccess);
    t.missPaxMinPerDay += (s.pax * s.meanMissLossSec) / 60;
    t.waitPaxMinPerDay += (s.pax * s.meanWaitSec) / 60;
  }
  return t;
}

export interface Comparison {
  before: SimResult;
  after: SimResult;
  beforeTotals: Totals;
  afterTotals: Totals;
  /** Net passenger-minutes saved per day (positive = better), including hold costs. */
  netPaxMinPerDay: number;
  changed: { flowLabel: string; inTripId: string; inArr: number; before: CohortStats; after: CohortStats }[];
  warnings: string[];
}

export function compare(
  world: World,
  flows: FlowDef[],
  hourProfile: (sec: number) => number,
  base: Omit<SimOptions, 'intervention'>,
  iv: Intervention,
  filter: (s: CohortStats) => boolean = () => true,
): Comparison {
  const beforeCohorts = enumerateCohorts(world, flows, hourProfile);
  const before = simulate(world, beforeCohorts, { ...base, intervention: { kind: 'none' } });
  const w2 = applyIntervention(world, iv);
  const afterCohorts = enumerateCohorts(w2, flows, hourProfile);
  const after = simulate(w2, afterCohorts, { ...base, intervention: iv });
  const beforeTotals = totals(before.cohorts, filter);
  const afterTotals = totals(after.cohorts, filter);
  const byId = new Map(after.cohorts.map((s) => [s.cohort.id, s]));
  const changed: Comparison['changed'] = [];
  for (const b of before.cohorts) {
    const a = byId.get(b.cohort.id);
    if (!a || !filter(b)) continue;
    if (Math.abs(a.pSuccess - b.pSuccess) >= 0.02 || Math.abs(a.meanWaitSec - b.meanWaitSec) >= 30)
      changed.push({ flowLabel: b.cohort.flow.label, inTripId: b.cohort.inTripId, inArr: b.cohort.inArr, before: b, after: a });
  }
  changed.sort(
    (x, y) =>
      Math.abs(y.after.pax * (y.after.meanWaitSec - y.before.meanWaitSec)) -
      Math.abs(x.after.pax * (x.after.meanWaitSec - x.before.meanWaitSec)),
  );
  const holdCost = after.holdPaxMinPerDay - before.holdPaxMinPerDay;
  return {
    before,
    after,
    beforeTotals,
    afterTotals,
    netPaxMinPerDay: beforeTotals.waitPaxMinPerDay - afterTotals.waitPaxMinPerDay - holdCost,
    changed,
    warnings: shiftWarnings(world, iv),
  };
}
