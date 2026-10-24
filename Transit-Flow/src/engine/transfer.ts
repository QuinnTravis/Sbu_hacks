// Transfer model: physical transfer-time distributions from station graphs,
// and the probability of making a scheduled connection.

import { crowdAt } from './crowd';
import { makeTripDelaySampler } from './delays';
import { nextTripServing, outagesFrom, sameStopChangeSec, type World } from './network';
import { lognormal, mulberry32, summarize, wilson, type Rng, type Summary } from './random';
import { findBinding, sampleTraversal, sampleWalkerFactor, transferPaths, type TransferPaths } from './station';
import type { ModelContext, PlatformBinding, StationGraph, Trip } from './types';

export interface TransferModel {
  fromStop: string;
  toStop: string;
  stationId?: string;
  stationName: string;
  graph?: StationGraph;
  inBinding?: PlatformBinding;
  outBinding?: PlatformBinding;
  paths: TransferPaths | null;
  /** True when an indoor station graph covers both platforms. */
  modeled: boolean;
  feasible: boolean;
  infeasibleReason?: string;
  /** Published minimum transfer time (what a conventional planner uses). */
  schedMinSec: number;
  crowd: number;
  outBoardBufferSec: number;
}

export function scheduledMinTransfer(world: World, fromStop: string, toStop: string): number | null {
  if (fromStop === toStop) return sameStopChangeSec(world, fromStop);
  const t = world.idx.transfersFrom.get(fromStop)?.find((x) => x.to === toStop);
  return t ? t.minTransferSec : null;
}

export function resolveTransfer(
  world: World,
  ctx: ModelContext,
  fromStop: string,
  inTrip: Trip,
  toStop: string,
  outTrip: Trip,
  atSec: number,
): TransferModel {
  const { tt, graphs } = world;
  const stationId = tt.stops[fromStop]?.stationId ?? tt.stops[toStop]?.stationId;
  const graph = stationId ? graphs[stationId] : undefined;
  const schedMinSec = scheduledMinTransfer(world, fromStop, toStop) ?? 300;
  const crowd = crowdAt(stationId, atSec, ctx.events);
  const base: TransferModel = {
    fromStop,
    toStop,
    stationId,
    stationName: graph?.name ?? tt.stops[fromStop]?.name ?? fromStop,
    graph,
    paths: null,
    modeled: false,
    feasible: true,
    schedMinSec,
    crowd,
    outBoardBufferSec: tt.routes[outTrip.routeId].boardBufferSec,
  };
  if (!graph) return base;
  const inBinding = findBinding(graph, fromStop, inTrip.routeId, inTrip.directionId, inTrip.service);
  const outBinding = findBinding(graph, toStop, outTrip.routeId, outTrip.directionId, outTrip.service);
  if (!inBinding || !outBinding) return base;
  const paths = transferPaths(graph, inBinding, outBinding, {
    accessible: ctx.accessible,
    outages: outagesFrom(ctx),
    crowd,
  });
  return {
    ...base,
    inBinding,
    outBinding,
    paths,
    modeled: true,
    feasible: paths !== null,
    infeasibleReason: paths
      ? undefined
      : ctx.accessible
        ? 'No step-free path between these platforms in the station model'
        : 'No path between these platforms in the station model',
  };
}

export type SourceMode = 'random' | 'best';

/** One sample of the physical transfer time in seconds (excludes train delays). */
export function sampleTransferSec(
  m: TransferModel,
  rng: Rng,
  familiarity: 'regular' | 'first-time',
  source: SourceMode = 'random',
): number {
  if (!m.modeled) {
    // No station model: wide distribution centred on the published minimum.
    return lognormal(rng, Math.max(m.schedMinSec, 90), 0.35) * (1 + 0.5 * (m.crowd - 1));
  }
  if (!m.paths) return Infinity;
  const path =
    source === 'best'
      ? m.paths.best.path
      : m.paths.bySource[Math.floor(rng() * m.paths.bySource.length)].path;
  const walker = sampleWalkerFactor(rng, familiarity);
  return sampleTraversal(path, rng, m.crowd, walker, familiarity);
}

export type Assessment = 'reliable' | 'some-risk' | 'high-risk' | 'unlikely' | 'impossible';

export function assess(p: number, windowSec: number): Assessment {
  if (windowSec < 0) return 'impossible';
  if (p >= 0.9) return 'reliable';
  if (p >= 0.7) return 'some-risk';
  if (p >= 0.4) return 'high-risk';
  return 'unlikely';
}

export interface ConnectionInput {
  inTrip: Trip;
  inIdx: number;
  outTrip: Trip;
  outIdx: number;
  /** Where the rider leaves the outbound trip, for miss consequences. */
  outAlightStop?: string;
}

export interface MissConsequence {
  nextTripId: string;
  nextDepSec: number;
  extraWaitSec: number;
}

export interface ConnectionResult {
  model: TransferModel;
  windowSec: number;
  pSuccess: number;
  ci: [number, number];
  n: number;
  assessment: Assessment;
  /** Physical transfer time distribution (seconds). */
  physical: Summary;
  physicalSamples: number[];
  /** Ready-to-board time minus actual departure, in seconds (negative = made it). */
  marginSamples: number[];
  miss: MissConsequence | null;
}

export interface ConnectionOptions {
  n?: number;
  seed?: number;
  source?: SourceMode;
}

export function missConsequence(world: World, input: ConnectionInput): MissConsequence | null {
  const { outTrip, outIdx } = input;
  const toStop = outTrip.stopTimes[outIdx].stopId;
  const alight = input.outAlightStop ?? outTrip.stopTimes[outTrip.stopTimes.length - 1].stopId;
  const dep = outTrip.stopTimes[outIdx].dep;
  const next = nextTripServing(world, outTrip.routeId, outTrip.directionId, toStop, alight, dep + 1, outTrip.id);
  if (!next) return null;
  const nextDep = next.trip.stopTimes[next.fromIdx].dep;
  return { nextTripId: next.trip.id, nextDepSec: nextDep, extraWaitSec: nextDep - dep };
}

/**
 * Probability that a rider arriving on `inTrip` boards `outTrip`.
 * Monte Carlo over: inbound arrival delay, outbound departure delay, the
 * rider's alighting position, walking speed, per-edge variability and crowd
 * queueing. Seeded, so results are reproducible.
 */
export function connectionProbability(
  world: World,
  ctx: ModelContext,
  input: ConnectionInput,
  opts: ConnectionOptions = {},
): ConnectionResult {
  const n = opts.n ?? 2000;
  const { inTrip, inIdx, outTrip, outIdx } = input;
  const inArr = inTrip.stopTimes[inIdx].arr;
  const outDep = outTrip.stopTimes[outIdx].dep;
  const windowSec = outDep - inArr;
  const model = resolveTransfer(
    world,
    ctx,
    inTrip.stopTimes[inIdx].stopId,
    inTrip,
    outTrip.stopTimes[outIdx].stopId,
    outTrip,
    inArr,
  );
  const miss = missConsequence(world, input);
  const rng = mulberry32(opts.seed ?? 12345);
  const physicalSamples: number[] = [];
  const marginSamples: number[] = [];
  let ok = 0;
  const feasible = model.feasible && windowSec >= 0;
  if (feasible) {
    for (let i = 0; i < n; i++) {
      const delays = makeTripDelaySampler(world.tt, world.delayModels, ctx, rng);
      const arr = inArr + delays.arrDelay(inTrip, inIdx);
      const dep = outDep + delays.depDelay(outTrip, outIdx);
      const walk = sampleTransferSec(model, rng, ctx.familiarity, opts.source);
      physicalSamples.push(walk);
      const margin = arr + walk - (dep - model.outBoardBufferSec);
      marginSamples.push(margin);
      if (margin <= 0) ok++;
    }
  }
  const p = feasible ? ok / n : 0;
  return {
    model,
    windowSec,
    pSuccess: p,
    ci: feasible ? wilson(ok, n) : [0, 0],
    n: feasible ? n : 0,
    assessment: model.feasible ? assess(p, windowSec) : 'impossible',
    physical: summarize(physicalSamples.length ? physicalSamples : [NaN]),
    physicalSamples,
    marginSamples,
    miss,
  };
}
