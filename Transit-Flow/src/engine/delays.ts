// Service delay model and real-time data handling.

import { eventDelayScale } from './crowd';
import { exponential, standardNormal, type Rng } from './random';
import type { ModelContext, Timetable, Trip } from './types';

/**
 * Mixture model of a trip's lateness: with probability `onTimeProb` the trip
 * runs close to schedule (normal noise), otherwise it is late by an offset
 * plus an exponential tail.
 */
export interface DelayModel {
  id: string;
  onTimeProb: number;
  onTimeSdSec: number;
  lateOffsetSec: number;
  lateMeanSec: number;
}

export function sampleBaseDelay(m: DelayModel, rng: Rng, lateScale = 1): number {
  if (rng() < m.onTimeProb) return standardNormal(rng) * m.onTimeSdSec;
  return m.lateOffsetSec + exponential(rng, m.lateMeanSec * lateScale);
}

/** Delays build along a trip: 30% at the origin terminal, 100% at the end. */
export function rampAt(trip: Trip, stopIndex: number): number {
  const n = trip.stopTimes.length;
  if (n <= 1) return 1;
  return 0.3 + (0.7 * stopIndex) / (n - 1);
}

export type RealtimeStatus =
  | { kind: 'none' }
  | { kind: 'fresh'; ageSec: number; source: string }
  | { kind: 'stale'; ageSec: number; source: string };

export function realtimeStatus(ctx: ModelContext): RealtimeStatus {
  if (!ctx.realtime) return { kind: 'none' };
  const ageSec = ctx.nowSec - ctx.realtime.feedTimestampSec;
  if (ageSec > ctx.staleAfterSec || ageSec < -60)
    return { kind: 'stale', ageSec, source: ctx.realtime.source };
  return { kind: 'fresh', ageSec, source: ctx.realtime.source };
}

/** Real-time delay for a trip if a fresh feed reports one. Stale feeds are ignored. */
export function realtimeDelay(ctx: ModelContext, tripId: string): number | null {
  if (realtimeStatus(ctx).kind !== 'fresh') return null;
  const u = ctx.realtime!.tripUpdates.find((x) => x.tripId === tripId);
  return u ? u.delaySec : null;
}

/** Residual uncertainty around a reported real-time delay. */
const REALTIME_RESIDUAL_SD = 45;

export interface TripDelaySampler {
  /** Delay in seconds at a stop index of the trip. Departures never leave early. */
  arrDelay(trip: Trip, stopIndex: number): number;
  depDelay(trip: Trip, stopIndex: number): number;
}

/**
 * Draws one consistent delay realisation per trip (common across all the
 * stops of that trip) for one simulated day or one simulated journey.
 */
export function makeTripDelaySampler(
  tt: Timetable,
  models: Record<string, DelayModel>,
  ctx: ModelContext,
  rng: Rng,
): TripDelaySampler {
  const base = new Map<string, number>();
  const get = (trip: Trip) => {
    let d = base.get(trip.id);
    if (d === undefined) {
      const rt = realtimeDelay(ctx, trip.id);
      if (rt !== null) {
        d = rt + standardNormal(rng) * REALTIME_RESIDUAL_SD;
        base.set(trip.id, d);
        return { d, rt: true };
      }
      const route = tt.routes[trip.routeId];
      const m = models[route.delayModelId];
      d = m ? sampleBaseDelay(m, rng, eventDelayScale(trip, tt, ctx.events)) : 0;
      base.set(trip.id, d);
    }
    return { d, rt: realtimeDelay(ctx, trip.id) !== null };
  };
  return {
    arrDelay(trip, i) {
      const { d, rt } = get(trip);
      return Math.max(-60, rt ? d : d * rampAt(trip, i));
    },
    depDelay(trip, i) {
      const { d, rt } = get(trip);
      return Math.max(0, rt ? d : d * rampAt(trip, i));
    },
  };
}
