// SYNTHETIC MODEL INPUTS: delay distributions, a sample event, demo real-time
// scenarios, places, and transfer demand. All values are assumptions chosen
// to be plausible; none are measured.

import type { DelayModel } from '../engine/delays';
import type { Place } from '../engine/planner';
import type { EventWindow, RealtimeSnapshot } from '../engine/types';

const hm = (h: number, m: number) => h * 3600 + m * 60;

export const delayModels: Record<string, DelayModel> = {
  'nyct-7': { id: 'nyct-7', onTimeProb: 0.68, onTimeSdSec: 40, lateOffsetSec: 60, lateMeanSec: 150 },
  'nyct-e': { id: 'nyct-e', onTimeProb: 0.72, onTimeSdSec: 40, lateOffsetSec: 60, lateMeanSec: 140 },
  'lirr-pj': { id: 'lirr-pj', onTimeProb: 0.84, onTimeSdSec: 30, lateOffsetSec: 60, lateMeanSec: 200 },
  'lirr-pw': { id: 'lirr-pw', onTimeProb: 0.86, onTimeSdSec: 30, lateOffsetSec: 60, lateMeanSec: 170 },
  'bus-sbs': { id: 'bus-sbs', onTimeProb: 0.45, onTimeSdSec: 90, lateOffsetSec: 60, lateMeanSec: 300 },
};

export type EventPreset = 'none' | 'afternoon' | 'evening';

export function sampleEvent(preset: EventPreset): EventWindow[] {
  if (preset === 'none') return [];
  const start = preset === 'afternoon' ? hm(13, 10) : hm(19, 10);
  return [
    {
      id: `citi-${preset}`,
      label: `Sample event · Citi Field game, ${preset === 'afternoon' ? '1:10' : '7:10'} PM start`,
      venue: 'Citi Field',
      startSec: start,
      endSec: start + hm(3, 0),
      stationImpact: { 'mets-willets': 2.6, woodside: 1.9, 'jackson-heights': 1.6, flushing: 1.3 },
      routeDelayImpact: { '7': 1.9, 'LIRR-PW': 1.3 },
      provenance: 'synthetic',
    },
  ];
}

export type RealtimeScenario = 'none' | 'seven-delays' | 'stale' | 'elevator-out';

export const realtimeScenarios: Record<RealtimeScenario, { label: string; description: string }> = {
  none: { label: 'Schedule + delay model', description: 'No real-time feed. Delays come from the synthetic delay model.' },
  'seven-delays': { label: 'Demo feed: 7 delays', description: 'Demo feed reports Manhattan-bound 7 trains running about 4 minutes late.' },
  stale: { label: 'Demo feed: stale', description: 'Demo feed last updated 20 minutes ago. Trip updates are ignored.' },
  'elevator-out': { label: 'Demo feed: elevator outage', description: 'Demo alert: Woodside LIRR eastbound elevator out of service.' },
};

/** Demo real-time snapshot for the scenario, generated relative to `nowSec`. */
export function demoRealtime(
  scenario: RealtimeScenario,
  nowSec: number,
  tripIds: string[],
): RealtimeSnapshot | null {
  switch (scenario) {
    case 'none':
      return null;
    case 'seven-delays':
      return {
        source: 'demo',
        feedTimestampSec: nowSec - 40,
        tripUpdates: tripIds
          .filter((id) => id.startsWith('7-W-'))
          .map((id) => ({ tripId: id, delaySec: 240 })),
        alerts: [
          {
            id: 'demo-7-delay',
            header: 'Demo alert · Manhattan-bound 7 trains delayed',
            description: 'Synthetic scenario: trains running about 4 minutes late after an earlier incident.',
            routeIds: ['7'],
          },
        ],
      };
    case 'stale':
      return {
        source: 'demo',
        feedTimestampSec: nowSec - 20 * 60,
        tripUpdates: tripIds.filter((id) => id.startsWith('7-W-')).map((id) => ({ tripId: id, delaySec: 240 })),
        alerts: [],
      };
    case 'elevator-out':
      return {
        source: 'demo',
        feedTimestampSec: nowSec - 40,
        tripUpdates: [],
        alerts: [
          {
            id: 'demo-wds-elevator',
            header: 'Demo alert · Woodside elevator out of service',
            description: 'Synthetic scenario: the elevator to the LIRR eastbound platform at Woodside is out of service.',
            stationId: 'woodside',
            edgeOutages: ['w-el4'],
          },
        ],
      };
  }
}

export const places: Place[] = [
  { id: 'flushing', name: 'Flushing–Main St', area: 'Queens', access: [{ stopId: '7-FLU', sec: 60 }, { stopId: 'L-FLU', sec: 240 }, { stopId: 'Q44-MAIN', sec: 90 }], aliases: ['main street', 'flushing'] },
  { id: 'stony-brook', name: 'Stony Brook', area: 'Suffolk · LIRR', access: [{ stopId: 'L-SBK', sec: 0 }], aliases: ['sbu', 'stony brook university'] },
  { id: 'woodside', name: 'Woodside', area: 'Queens', access: [{ stopId: '7-61', sec: 60 }, { stopId: 'L-WDS', sec: 120 }] },
  { id: 'jackson-heights', name: 'Jackson Heights–Roosevelt Av', area: 'Queens', access: [{ stopId: '7-74', sec: 60 }, { stopId: 'E-JH', sec: 90 }], aliases: ['74 st', 'roosevelt'] },
  { id: 'jamaica', name: 'Jamaica', area: 'Queens', access: [{ stopId: 'L-JAM', sec: 60 }, { stopId: 'E-SUT', sec: 120 }, { stopId: 'Q44-ARCHER', sec: 120 }], aliases: ['sutphin'] },
  { id: 'citi-field', name: 'Mets–Willets Point (Citi Field)', area: 'Queens', access: [{ stopId: '7-MWP', sec: 120 }], aliases: ['citi field', 'mets'] },
  { id: 'grand-central', name: 'Grand Central–42 St', area: 'Manhattan', access: [{ stopId: '7-GC', sec: 60 }] },
  { id: 'penn', name: 'Penn Station', area: 'Manhattan · LIRR', access: [{ stopId: 'L-PENN', sec: 120 }] },
  { id: 'forest-hills', name: 'Forest Hills–71 Av', area: 'Queens', access: [{ stopId: 'E-FH', sec: 60 }] },
  { id: 'kew-gardens', name: 'Kew Gardens–Union Tpke', area: 'Queens', access: [{ stopId: 'E-KG', sec: 60 }] },
  { id: 'mineola', name: 'Mineola', area: 'Nassau · LIRR', access: [{ stopId: 'L-MIN', sec: 0 }] },
  { id: 'hicksville', name: 'Hicksville', area: 'Nassau · LIRR', access: [{ stopId: 'L-HVL', sec: 0 }] },
  { id: 'huntington', name: 'Huntington', area: 'Suffolk · LIRR', access: [{ stopId: 'L-HUN', sec: 0 }] },
  { id: 'smithtown', name: 'Smithtown', area: 'Suffolk · LIRR', access: [{ stopId: 'L-SMT', sec: 0 }] },
  { id: 'port-jefferson', name: 'Port Jefferson', area: 'Suffolk · LIRR', access: [{ stopId: 'L-PJ', sec: 0 }] },
  { id: 'port-washington', name: 'Port Washington', area: 'Nassau · LIRR', access: [{ stopId: 'L-PWA', sec: 0 }] },
  { id: 'bayside', name: 'Bayside', area: 'Queens · LIRR', access: [{ stopId: 'L-BAY', sec: 0 }] },
];

/**
 * Synthetic transfer demand: average passengers making each kind of
 * connection per scheduled connection at the AM/PM peak. Shaped by
 * `hourProfile`. Invented for demonstration.
 */
export interface DemandFlow {
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

export const demandFlows: DemandFlow[] = [
  { id: 'wds-7-lirr', label: 'Woodside · 7 → LIRR eastbound', fromStop: '7-61', toStop: 'L-WDS', inRoute: '7', inDir: 0, outRoute: 'LIRR-PJ', outDir: 1, peakPax: 40, eventMultiplier: 1.6 },
  { id: 'wds-pw-lirr', label: 'Woodside · Port Washington → LIRR eastbound', fromStop: 'L-WDS', toStop: 'L-WDS', inRoute: 'LIRR-PW', inDir: 0, outRoute: 'LIRR-PJ', outDir: 1, peakPax: 22, eventMultiplier: 1.3 },
  { id: 'wds-lirr-7', label: 'Woodside · LIRR westbound → 7 to Flushing', fromStop: 'L-WDS', toStop: '7-61', inRoute: 'LIRR-PJ', inDir: 0, outRoute: '7', outDir: 1, peakPax: 30, eventMultiplier: 1.4 },
  { id: 'jh-7-e', label: 'Jackson Heights · 7 → E to Jamaica', fromStop: '7-74', toStop: 'E-JH', inRoute: '7', inDir: 0, outRoute: 'E', outDir: 1, peakPax: 110, eventMultiplier: 1.5 },
  { id: 'jam-e-lirr', label: 'Jamaica · E → LIRR eastbound', fromStop: 'E-SUT', toStop: 'L-JAM', inRoute: 'E', inDir: 1, outRoute: 'LIRR-PJ', outDir: 1, peakPax: 35, eventMultiplier: 1.1 },
  { id: 'jam-q44-lirr', label: 'Jamaica · Q44 → LIRR eastbound', fromStop: 'Q44-ARCHER', toStop: 'L-JAM', inRoute: 'Q44', inDir: 1, outRoute: 'LIRR-PJ', outDir: 1, peakPax: 14, eventMultiplier: 1 },
  { id: 'hun-el-dsl', label: 'Huntington · electric → diesel to Port Jefferson', fromStop: 'L-HUN', toStop: 'L-HUN', inRoute: 'LIRR-PJ', inDir: 1, outRoute: 'LIRR-PJ', outDir: 1, peakPax: 85, eventMultiplier: 1 },
  { id: 'hun-dsl-el', label: 'Huntington · diesel → electric westbound', fromStop: 'L-HUN', toStop: 'L-HUN', inRoute: 'LIRR-PJ', inDir: 0, outRoute: 'LIRR-PJ', outDir: 0, peakPax: 80, eventMultiplier: 1 },
];

export function hourProfile(sec: number): number {
  const h = sec / 3600;
  if (h < 6) return 0.25;
  if (h < 7) return 0.6;
  if (h < 9.5) return 1;
  if (h < 15.5) return 0.45;
  if (h < 19) return 0.9;
  if (h < 21) return 0.5;
  return 0.25;
}

/** Synthetic onboard load (passengers) of a trip at a stop — used to cost holds. */
export function onboardLoad(routeId: string, sec: number): number {
  const base = routeId.startsWith('LIRR') ? 420 : routeId === 'Q44' ? 60 : 700;
  return Math.round(base * hourProfile(sec));
}
