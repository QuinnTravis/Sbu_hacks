// Probabilistic evaluation of a complete journey: arrival-time distribution,
// per-transfer connection probability, and what happens when a connection
// is missed. Uses the same transfer model as station analysis and Insights.

import { makeTripDelaySampler } from './delays';
import type { World } from './network';
import { mulberry32, hashSeed, summarize, type Summary } from './random';
import { earliestArrival, type Journey, type RaptorQuery, type Ride } from './raptor';
import { positionHint } from './station';
import {
  connectionProbability,
  resolveTransfer,
  sampleTransferSec,
  type ConnectionResult,
  type TransferModel,
} from './transfer';
import type { ModelContext } from './types';

export interface TransferEval {
  index: number;
  model: TransferModel;
  /** Rider who does not know the station (random car). */
  conn: ConnectionResult;
  /** Rider who boards the recommended car. Null when position does not matter. */
  connBestCar: ConnectionResult | null;
  carHint: string | null;
  /** Arrival at destination if this connection is missed and everything else runs to schedule. */
  arrivalIfMissedSec: number | null;
}

export interface JourneyEval {
  journey: Journey;
  transfers: TransferEval[];
  arrival: Summary;
  arrivalSamples: number[];
  expectedArriveSec: number;
  /** Probability of making every planned connection. */
  pAllConnections: number;
  /** Probability of arriving by the deadline (arrive-by mode) or by schedule + 5 min. */
  pOnTime: number;
  onTimeTargetSec: number;
  /** Samples where no later service could complete the trip. */
  strandedShare: number;
  walkingSec: number;
  feasible: boolean;
  infeasibleReason?: string;
}

export interface EvalOptions {
  samples?: number;
  deadlineSec?: number;
  cache?: Map<string, ConnectionResult>;
  recoveryCache?: Map<string, number | null>;
  transferSec?: RaptorQuery['transferSec'];
}

function cachedConnection(
  world: World,
  ctx: ModelContext,
  a: Ride,
  b: Ride,
  source: 'random' | 'best',
  cache?: Map<string, ConnectionResult>,
): ConnectionResult {
  const key = `${a.tripId}:${a.toIdx}>${b.tripId}:${b.fromIdx}>${b.toStop}:${source}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  const res = connectionProbability(
    world,
    ctx,
    {
      inTrip: world.tt.trips[a.tripId],
      inIdx: a.toIdx,
      outTrip: world.tt.trips[b.tripId],
      outIdx: b.fromIdx,
      outAlightStop: b.toStop,
    },
    { n: 1500, seed: hashSeed(key), source },
  );
  cache?.set(key, res);
  return res;
}

export type Recover = (stopId: string, afterSec: number) => number | null;

/** Re-plan from a stop after a missed connection (cached per stop and minute). */
export function makeRecover(
  world: World,
  journey: Journey,
  cache: Map<string, number | null>,
  transferSec?: RaptorQuery['transferSec'],
): Recover {
  const egress = [{ stopId: journey.egressStop, sec: journey.egressSec }];
  return (stopId, afterSec) => {
    const minute = Math.ceil(afterSec / 60) * 60;
    const key = `${stopId}@${minute}>${journey.egressStop}`;
    if (!cache.has(key)) cache.set(key, earliestArrival(world, stopId, minute, egress, transferSec));
    return cache.get(key)!;
  };
}

/**
 * Arrival if connection `missIdx` is missed and the rider re-plans from that
 * stop. Every other leg runs to schedule with a typical transfer time.
 */
export function arrivalIfMissed(
  world: World,
  journey: Journey,
  models: TransferModel[],
  missIdx: number,
  recover: Recover,
): number | null {
  const { tt } = world;
  let arrPrev = journey.rides[0].arr;
  for (let i = 1; i < journey.rides.length; i++) {
    const r = journey.rides[i];
    const m = models[i - 1];
    const transfer = m.paths ? m.paths.best.path.expectedSec : m.schedMinSec;
    const ready = arrPrev + transfer;
    const dep = tt.trips[r.tripId].stopTimes[r.fromIdx].dep;
    if (i - 1 === missIdx || ready > dep - m.outBoardBufferSec) {
      return recover(r.fromStop, Math.max(ready, dep + 1));
    }
    arrPrev = r.arr;
  }
  return arrPrev + journey.egressSec;
}

export function evaluateJourney(
  world: World,
  ctx: ModelContext,
  journey: Journey,
  opts: EvalOptions = {},
): JourneyEval {
  const { tt } = world;
  const N = opts.samples ?? 800;
  const rides = journey.rides;
  const models: TransferModel[] = [];
  for (let i = 1; i < rides.length; i++) {
    const a = rides[i - 1];
    const b = rides[i];
    models.push(resolveTransfer(world, ctx, a.toStop, tt.trips[a.tripId], b.fromStop, tt.trips[b.tripId], a.arr));
  }
  const infeasible = models.find((m) => !m.feasible);
  const recover = makeRecover(world, journey, opts.recoveryCache ?? new Map(), opts.transferSec);

  const transfers: TransferEval[] = models.map((model, i) => {
    const conn = cachedConnection(world, ctx, rides[i], rides[i + 1], 'random', opts.cache);
    let connBestCar: ConnectionResult | null = null;
    let carHint: string | null = null;
    if (model.paths && model.paths.bySource.length > 1 && model.graph) {
      connBestCar = cachedConnection(world, ctx, rides[i], rides[i + 1], 'best', opts.cache);
      carHint = positionHint(model.graph, model.paths.best.node);
    }
    return {
      index: i,
      model,
      conn,
      connBestCar,
      carHint,
      arrivalIfMissedSec: arrivalIfMissed(world, journey, models, i, recover),
    };
  });

  const onTimeTargetSec = opts.deadlineSec ?? journey.arriveSec + 300;
  const rng = mulberry32(hashSeed('journey', journey.key));
  const samples: number[] = [];
  let allOk = 0;
  let stranded = 0;
  let onTime = 0;
  if (!infeasible) {
    for (let s = 0; s < N; s++) {
      const delays = makeTripDelaySampler(tt, world.delayModels, ctx, rng);
      const first = tt.trips[rides[0].tripId];
      let arrPrev = rides[0].arr + delays.arrDelay(first, rides[0].toIdx);
      let made = true;
      let recovered: number | null | undefined;
      for (let i = 1; i < rides.length; i++) {
        const r = rides[i];
        const m = models[i - 1];
        const ready = arrPrev + sampleTransferSec(m, rng, ctx.familiarity);
        const trip = tt.trips[r.tripId];
        const dep = trip.stopTimes[r.fromIdx].dep + delays.depDelay(trip, r.fromIdx);
        if (ready > dep - m.outBoardBufferSec) {
          made = false;
          recovered = recover(r.fromStop, Math.max(ready, trip.stopTimes[r.fromIdx].dep + 1));
          break;
        }
        arrPrev = trip.stopTimes[r.toIdx].arr + delays.arrDelay(trip, r.toIdx);
      }
      if (recovered === null) {
        stranded++;
        continue;
      }
      const arrival = recovered ?? arrPrev + journey.egressSec;
      samples.push(arrival);
      if (made) allOk++;
      if (arrival <= onTimeTargetSec) onTime++;
    }
  }

  const arrival = summarize(samples.length ? samples : [NaN]);
  const walkingSec =
    journey.accessSec +
    journey.egressSec +
    models.reduce((s, m) => s + (m.paths ? m.paths.best.path.expectedSec : m.schedMinSec), 0);

  return {
    journey,
    transfers,
    arrival,
    arrivalSamples: samples,
    // Stranded samples are counted at a 3-hour penalty so they are never "cheap".
    expectedArriveSec: samples.length
      ? (arrival.mean * samples.length + (journey.arriveSec + 3 * 3600) * stranded) / (samples.length + stranded)
      : Infinity,
    pAllConnections: infeasible ? 0 : allOk / N,
    pOnTime: infeasible ? 0 : onTime / N,
    onTimeTargetSec,
    strandedShare: infeasible ? 1 : stranded / N,
    walkingSec,
    feasible: !infeasible,
    infeasibleReason: infeasible?.infeasibleReason,
  };
}
