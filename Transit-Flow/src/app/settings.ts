import { demoRealtime, sampleEvent, type EventPreset, type RealtimeScenario } from '../data/models';
import { demoWorld } from '../data/world';
import type { ModelContext, PlatformBinding } from '../engine/types';

export interface Settings {
  /** Demo clock: the "current time" for real-time freshness. */
  nowSec: number;
  event: EventPreset;
  feed: RealtimeScenario;
  accessible: boolean;
  familiarity: 'regular' | 'first-time';
}

export const DEFAULT_SETTINGS: Settings = {
  nowSec: 7 * 3600 + 40 * 60,
  event: 'none',
  feed: 'none',
  accessible: false,
  familiarity: 'regular',
};

const tripIds = Object.keys(demoWorld.tt.trips);

export function buildContext(s: Settings): ModelContext {
  return {
    nowSec: s.nowSec,
    events: sampleEvent(s.event),
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
