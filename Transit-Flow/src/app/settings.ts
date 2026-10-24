import { demoRealtime, type RealtimeScenario } from '../data/models';
import type { Detection } from '../engine/events';
import { demoWorld } from '../data/world';
import type { EventWindow, ModelContext, PlatformBinding } from '../engine/types';

export interface Settings {
  /** Demo clock: the "current time" for real-time freshness. */
  nowSec: number;
  /** Events detected around the network today; never set by the rider. */
  detected: EventDetection;
  feed: RealtimeScenario;
  accessible: boolean;
  familiarity: 'regular' | 'first-time';
}

export type EventDetection = { kind: 'loading' } | ({ kind: 'ok' } & Detection) | { kind: 'error'; message: string };

export const DEFAULT_SETTINGS: Settings = {
  nowSec: 7 * 3600 + 40 * 60,
  detected: { kind: 'loading' },
  feed: 'none',
  accessible: false,
  familiarity: 'regular',
};

const tripIds = Object.keys(demoWorld.tt.trips);

export function activeEvents(s: Settings): EventWindow[] {
  return s.detected.kind === 'ok' ? s.detected.events : [];
}

export function buildContext(s: Settings): ModelContext {
  return {
    nowSec: s.nowSec,
    events: activeEvents(s),
    realtime: demoRealtime(s.feed, s.nowSec, tripIds),
    staleAfterSec: 5 * 60,
    accessible: s.accessible,
    familiarity: s.familiarity,
  };
}

export const bindingKey = (b: Pick<PlatformBinding, 'stopId' | 'routeId' | 'directionId' | 'service'>) =>
  `${b.stopId}|${b.routeId}|${b.directionId}|${b.service ?? ''}`;

export interface StationFocus {
  stationId: string;
  fromKey?: string;
  toKey?: string;
  timeSec?: number;
}

export interface InsightsFocus {
  fromStop: string;
  toStop: string;
  inTripId: string;
}

export type Tab = 'plan' | 'stations' | 'insights';
