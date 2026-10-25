import type { DelayModel } from '../delays';
import { makeWorld, type World } from '../network';
import type { ModelContext, Route, StationGraph, Timetable, Trip } from '../types';

export const ctx = (over: Partial<ModelContext> = {}): ModelContext => ({
  nowSec: 8 * 3600,
  events: [],
  realtime: null,
  staleAfterSec: 300,
  accessible: false,
  familiarity: 'regular',
  ...over,
});

const route = (id: string, mode: Route['mode'], delayModelId: string): Route => ({
  id,
  shortName: id,
  longName: id,
  mode,
  agency: 'test',
  color: '#000',
  textColor: '#fff',
  boardBufferSec: mode === 'rail' ? 30 : 10,
  delayModelId,
});

export const NO_DELAY: DelayModel = { id: 'none', onTimeProb: 1, onTimeSdSec: 0, lateOffsetSec: 0, lateMeanSec: 0 };

/**
 * A -> B by subway "S" (every 10 min), B -> C by rail "R" (hourly), plus a
 * slow direct bus A -> C. Station "hub" links subway B and rail B with a
 * stair-only path and a step-free elevator path.
 */
export function tinyWorld(delays: Record<string, DelayModel> = { s: NO_DELAY, r: NO_DELAY, b: NO_DELAY }): World {
  const trips: Record<string, Trip> = {};
  const mk = (id: string, routeId: string, pattern: string, dir: 0 | 1, times: [string, number][]) => {
    trips[id] = {
      id,
      routeId,
      patternId: pattern,
      directionId: dir,
      headsign: '',
      service: '',
      stopTimes: times.map(([stopId, t]) => ({ stopId, arr: t, dep: t })),
    };
    return id;
  };
  const sIds: string[] = [];
  for (let t = 7 * 3600; t <= 9 * 3600; t += 600) sIds.push(mk(`S-${t}`, 'S', 'PS', 0, [['A', t], ['B', t + 900]]));
  const rIds = [7 * 3600 + 1800, 8 * 3600 + 1800, 9 * 3600 + 1800].map((t) => mk(`R-${t}`, 'R', 'PR', 0, [['RB', t], ['C', t + 1800]]));
  const bIds = [7 * 3600 + 1200, 8 * 3600 + 1200].map((t) => mk(`BUS-${t}`, 'BUS', 'PB', 0, [['A', t], ['C', t + 4200]]));
  const tt: Timetable = {
    id: 'tiny',
    label: 'tiny',
    provenance: 'synthetic',
    stops: {
      A: { id: 'A', name: 'A', mode: 'subway', lat: 0, lon: 0 },
      B: { id: 'B', name: 'B', mode: 'subway', lat: 0, lon: 0, stationId: 'hub', sameStopChangeSec: 60 },
      RB: { id: 'RB', name: 'B rail', mode: 'rail', lat: 0, lon: 0, stationId: 'hub', sameStopChangeSec: 120 },
      C: { id: 'C', name: 'C', mode: 'rail', lat: 0, lon: 0 },
    },
    routes: { S: route('S', 'subway', 's'), R: route('R', 'rail', 'r'), BUS: route('BUS', 'bus', 'b') },
    trips,
    patterns: [
      { id: 'PS', routeId: 'S', directionId: 0, service: '', stops: ['A', 'B'], tripIds: sIds },
      { id: 'PR', routeId: 'R', directionId: 0, service: '', stops: ['RB', 'C'], tripIds: rIds },
      { id: 'PB', routeId: 'BUS', directionId: 0, service: '', stops: ['A', 'C'], tripIds: bIds },
    ],
    transfers: [{ from: 'B', to: 'RB', minTransferSec: 120 }],
  };
  const hub: StationGraph = {
    id: 'hub',
    name: 'Hub',
    verification: 'illustrative',
    sourceNote: 'test',
    width: 100,
    height: 100,
    levels: [],
    nodes: [
      { id: 'sp', label: 'Subway platform', level: 1, x: 0, y: 0, kind: 'platform' },
      { id: 'mz', label: 'Mezzanine', level: 0, x: 0, y: 0, kind: 'mezzanine' },
      { id: 'rp', label: 'Rail platform', level: -1, x: 0, y: 0, kind: 'platform' },
    ],
    edges: [
      { id: 'stairs1', from: 'sp', to: 'mz', kind: 'stairs', medianSec: 60, sigma: 0.2, accessible: false, crowdSensitivity: 1, queueSec: 20 },
      { id: 'stairs2', from: 'mz', to: 'rp', kind: 'stairs', medianSec: 60, sigma: 0.2, accessible: false, crowdSensitivity: 1, queueSec: 20 },
      { id: 'lift', from: 'sp', to: 'rp', kind: 'elevator', medianSec: 200, sigma: 0.3, accessible: true, crowdSensitivity: 0.2 },
    ],
    bindings: [
      { stopId: 'B', routeId: 'S', directionId: 0, label: 'S', nodes: ['sp'] },
      { stopId: 'RB', routeId: 'R', directionId: 0, label: 'R', nodes: ['rp'] },
    ],
  };
  return makeWorld(tt, { hub }, delays);
}
