// SYNTHETIC DEMO TIMETABLE.
// Patterned on the general shape of service in Queens and on the Port
// Jefferson and Port Washington branches, but every time below is invented
// for demonstration. It is not an MTA schedule.

import type { Pattern, Route, ScheduledTransfer, Stop, StopTime, Timetable, Trip } from '../engine/types';

const hm = (h: number, m: number) => h * 3600 + m * 60;

function series(from: [number, number], to: [number, number], everyMin: number): number[] {
  const out: number[] = [];
  for (let t = hm(...from); t <= hm(...to); t += everyMin * 60) out.push(t);
  return out;
}

// ---------- Stops (coordinates approximate, for the schematic map) ----------

const S = (
  id: string,
  name: string,
  mode: Stop['mode'],
  lat: number,
  lon: number,
  extra: Partial<Stop> = {},
): Stop => ({ id, name, mode, lat, lon, ...extra });

const stopList: Stop[] = [
  // 7 (Flushing line)
  S('7-FLU', 'Flushing–Main St', 'subway', 40.7596, -73.8301, { stationId: 'flushing', sameStopChangeSec: 60 }),
  S('7-MWP', 'Mets–Willets Point', 'subway', 40.7546, -73.8456, { stationId: 'mets-willets', sameStopChangeSec: 60 }),
  S('7-111', '111 St', 'subway', 40.7517, -73.8554),
  S('7-JCT', 'Junction Blvd', 'subway', 40.7493, -73.8693),
  S('7-74', '74 St–Broadway', 'subway', 40.7469, -73.8912, { stationId: 'jackson-heights', sameStopChangeSec: 60 }),
  S('7-61', '61 St–Woodside', 'subway', 40.7456, -73.903, { stationId: 'woodside', sameStopChangeSec: 60 }),
  S('7-QBP', 'Queensboro Plaza', 'subway', 40.7509, -73.9402),
  S('7-GC', 'Grand Central–42 St', 'subway', 40.7518, -73.9764),
  // E (Queens Blvd line)
  S('E-JH', 'Jackson Hts–Roosevelt Av', 'subway', 40.7466, -73.8914, { stationId: 'jackson-heights', sameStopChangeSec: 60 }),
  S('E-FH', 'Forest Hills–71 Av', 'subway', 40.7215, -73.8445),
  S('E-KG', 'Kew Gardens–Union Tpke', 'subway', 40.714, -73.831),
  S('E-VW', 'Jamaica–Van Wyck', 'subway', 40.7027, -73.8164),
  S('E-SUT', 'Sutphin Blvd–Archer Av–JFK', 'subway', 40.7004, -73.8077, { stationId: 'jamaica', sameStopChangeSec: 60 }),
  S('E-JC', 'Jamaica Center–Parsons/Archer', 'subway', 40.7022, -73.8009),
  // LIRR
  S('L-PENN', 'Penn Station', 'rail', 40.7506, -73.9935, { sameStopChangeSec: 300 }),
  S('L-WDS', 'Woodside', 'rail', 40.7459, -73.9025, { stationId: 'woodside', sameStopChangeSec: 240 }),
  S('L-JAM', 'Jamaica', 'rail', 40.6996, -73.8086, { stationId: 'jamaica', sameStopChangeSec: 180 }),
  S('L-MIN', 'Mineola', 'rail', 40.7404, -73.6409, { sameStopChangeSec: 180 }),
  S('L-HVL', 'Hicksville', 'rail', 40.7671, -73.5285, { sameStopChangeSec: 180 }),
  S('L-SYO', 'Syosset', 'rail', 40.8248, -73.5005),
  S('L-CSH', 'Cold Spring Harbor', 'rail', 40.8356, -73.4513),
  S('L-HUN', 'Huntington', 'rail', 40.8532, -73.4097, { stationId: 'huntington', sameStopChangeSec: 120 }),
  S('L-GRN', 'Greenlawn', 'rail', 40.8689, -73.3626),
  S('L-NPT', 'Northport', 'rail', 40.8803, -73.3283),
  S('L-KPK', 'Kings Park', 'rail', 40.8834, -73.2565),
  S('L-SMT', 'Smithtown', 'rail', 40.8567, -73.2009),
  S('L-STJ', 'St. James', 'rail', 40.8822, -73.1594),
  S('L-SBK', 'Stony Brook', 'rail', 40.9205, -73.1281),
  S('L-PJ', 'Port Jefferson', 'rail', 40.9343, -73.0526),
  S('L-FLU', 'Flushing–Main Street (LIRR)', 'rail', 40.7577, -73.8292, { stationId: 'flushing', sameStopChangeSec: 180, shortName: 'Flushing LIRR' }),
  S('L-BAY', 'Bayside', 'rail', 40.7632, -73.7717),
  S('L-GNK', 'Great Neck', 'rail', 40.787, -73.7262),
  S('L-PWA', 'Port Washington', 'rail', 40.8297, -73.6872),
  // Q44-SBS (stop positions approximate)
  S('Q44-MAIN', 'Main St / Roosevelt Av', 'bus', 40.7589, -73.8299, { stationId: 'flushing', sameStopChangeSec: 60 }),
  S('Q44-JEWEL', 'Main St / Jewel Av', 'bus', 40.7296, -73.8209),
  S('Q44-UNION', 'Main St / Union Tpke', 'bus', 40.7176, -73.8186),
  S('Q44-ARCHER', 'Sutphin Blvd / Archer Av', 'bus', 40.7009, -73.8083, { stationId: 'jamaica', sameStopChangeSec: 60 }),
];

export const routes: Record<string, Route> = {
  '7': { id: '7', shortName: '7', longName: 'Flushing Local', mode: 'subway', agency: 'NYCT Subway', color: '#8C3D88', textColor: '#fff', boardBufferSec: 10, delayModelId: 'nyct-7' },
  E: { id: 'E', shortName: 'E', longName: 'Queens Blvd Express', mode: 'subway', agency: 'NYCT Subway', color: '#2C5AA0', textColor: '#fff', boardBufferSec: 10, delayModelId: 'nyct-e' },
  'LIRR-PJ': { id: 'LIRR-PJ', shortName: 'LIRR', longName: 'Port Jefferson Branch', mode: 'rail', agency: 'Long Island Rail Road', color: '#1E7566', textColor: '#fff', boardBufferSec: 30, delayModelId: 'lirr-pj' },
  'LIRR-PW': { id: 'LIRR-PW', shortName: 'LIRR', longName: 'Port Washington Branch', mode: 'rail', agency: 'Long Island Rail Road', color: '#B24A2E', textColor: '#fff', boardBufferSec: 30, delayModelId: 'lirr-pw' },
  Q44: { id: 'Q44', shortName: 'Q44', longName: 'Select Bus Service', mode: 'bus', agency: 'MTA Bus', color: '#B9811A', textColor: '#1b1b19', boardBufferSec: 15, delayModelId: 'bus-sbs' },
};

// ---------- Pattern builder ----------

interface PatternSpec {
  id: string;
  routeId: string;
  dir: 0 | 1;
  service: string;
  headsign: string;
  /** [stopId, run seconds from previous stop, dwell seconds] */
  stops: [string, number, number][];
  departures: number[];
}

function build(spec: PatternSpec, trips: Record<string, Trip>): Pattern {
  const tripIds: string[] = [];
  for (const d of spec.departures) {
    const st: StopTime[] = [];
    let t = d;
    spec.stops.forEach(([stopId, run, dwell], i) => {
      if (i === 0) {
        st.push({ stopId, arr: t, dep: t });
        return;
      }
      t += run;
      const arr = t;
      const isLast = i === spec.stops.length - 1;
      t += isLast ? 0 : dwell;
      st.push({ stopId, arr, dep: t });
    });
    const id = `${spec.id}-${String(Math.floor(d / 3600)).padStart(2, '0')}${String(Math.floor((d % 3600) / 60)).padStart(2, '0')}`;
    trips[id] = {
      id,
      routeId: spec.routeId,
      patternId: spec.id,
      directionId: spec.dir,
      headsign: spec.headsign,
      service: spec.service,
      stopTimes: st,
    };
    tripIds.push(id);
  }
  return { id: spec.id, routeId: spec.routeId, directionId: spec.dir, service: spec.service, stops: spec.stops.map((s) => s[0]), tripIds };
}

function reverse(stops: [string, number, number][]): [string, number, number][] {
  const ids = stops.map((s) => s[0]).reverse();
  const runs = stops.map((s) => s[1]).slice(1).reverse();
  const dwells = stops.map((s) => s[2]).reverse();
  return ids.map((id, i) => [id, i === 0 ? 0 : runs[i - 1], dwells[i]]);
}

const peak = (base: number[], ...extra: number[][]) => [...new Set([...base, ...extra.flat()])].sort((a, b) => a - b);

const SEVEN: [string, number, number][] = [
  ['7-FLU', 0, 0], ['7-MWP', 180, 30], ['7-111', 120, 30], ['7-JCT', 180, 30],
  ['7-74', 240, 30], ['7-61', 180, 30], ['7-QBP', 420, 30], ['7-GC', 420, 0],
];
const SEVEN_DEPS = peak(
  series([5, 1], [6, 25], 6), series([6, 31], [9, 31], 4), series([9, 37], [15, 55], 6),
  series([16, 1], [19, 29], 4), series([19, 37], [23, 53], 8),
);
const E_LINE: [string, number, number][] = [
  ['E-JH', 0, 0], ['E-FH', 300, 30], ['E-KG', 180, 30], ['E-VW', 180, 30], ['E-SUT', 120, 30], ['E-JC', 90, 0],
];
const E_DEPS = peak(
  series([5, 2], [6, 26], 6), series([6, 30], [9, 30], 4), series([9, 36], [15, 54], 6),
  series([16, 0], [19, 28], 4), series([19, 36], [23, 52], 8),
);
const PJ_ELECTRIC_WDS: [string, number, number][] = [
  ['L-PENN', 0, 0], ['L-WDS', 540, 60], ['L-JAM', 600, 60], ['L-MIN', 840, 60],
  ['L-HVL', 480, 60], ['L-SYO', 420, 60], ['L-CSH', 300, 60], ['L-HUN', 300, 0],
];
const PJ_ELECTRIC_EXPRESS: [string, number, number][] = [
  ['L-PENN', 0, 0], ['L-JAM', 1140, 60], ['L-MIN', 840, 60],
  ['L-HVL', 480, 60], ['L-SYO', 420, 60], ['L-CSH', 300, 60], ['L-HUN', 300, 0],
];
const PJ_DIESEL: [string, number, number][] = [
  ['L-HUN', 0, 0], ['L-GRN', 300, 60], ['L-NPT', 300, 60], ['L-KPK', 480, 60],
  ['L-SMT', 360, 60], ['L-STJ', 300, 60], ['L-SBK', 360, 60], ['L-PJ', 540, 0],
];
const PJ_THROUGH: [string, number, number][] = [
  ['L-JAM', 0, 0], ['L-MIN', 840, 60], ['L-HVL', 480, 60], ['L-SYO', 420, 60], ['L-CSH', 300, 60],
  ['L-HUN', 300, 60], ['L-GRN', 300, 60], ['L-NPT', 300, 60], ['L-KPK', 480, 60],
  ['L-SMT', 360, 60], ['L-STJ', 300, 60], ['L-SBK', 360, 60], ['L-PJ', 540, 0],
];
const PW_LINE: [string, number, number][] = [
  ['L-PWA', 0, 0], ['L-GNK', 480, 60], ['L-BAY', 420, 60], ['L-FLU', 420, 60], ['L-WDS', 480, 60], ['L-PENN', 780, 0],
];
const Q44_LINE: [string, number, number][] = [
  ['Q44-MAIN', 0, 0], ['Q44-JEWEL', 600, 20], ['Q44-UNION', 480, 20], ['Q44-ARCHER', 900, 0],
];

const hourly = (fromH: number, toH: number, minute: number) => series([fromH, minute], [toH, minute], 60);

const specs: PatternSpec[] = [
  { id: '7-W', routeId: '7', dir: 0, service: '7 local', headsign: 'Manhattan · 34 St–Hudson Yards', stops: SEVEN, departures: SEVEN_DEPS },
  { id: '7-E', routeId: '7', dir: 1, service: '7 local', headsign: 'Flushing–Main St', stops: reverse(SEVEN), departures: SEVEN_DEPS.map((t) => t - 120) },
  { id: 'E-E', routeId: 'E', dir: 1, service: 'E', headsign: 'Jamaica Center', stops: E_LINE, departures: E_DEPS },
  { id: 'E-W', routeId: 'E', dir: 0, service: 'E', headsign: 'Manhattan · World Trade Center', stops: reverse(E_LINE), departures: E_DEPS.map((t) => t + 60) },
  { id: 'PJ-EL-W', routeId: 'LIRR-PJ', dir: 1, service: 'Electric · Penn–Huntington', headsign: 'Huntington', stops: PJ_ELECTRIC_WDS, departures: hourly(5, 22, 6) },
  {
    id: 'PJ-EL-X', routeId: 'LIRR-PJ', dir: 1, service: 'Electric · Penn–Huntington', headsign: 'Huntington (skips Woodside)', stops: PJ_ELECTRIC_EXPRESS,
    departures: [...hourly(6, 9, 36), ...hourly(16, 19, 36)],
  },
  { id: 'PJ-DSL', routeId: 'LIRR-PJ', dir: 1, service: 'Diesel · Huntington–Port Jefferson', headsign: 'Port Jefferson', stops: PJ_DIESEL, departures: hourly(6, 23, 16) },
  { id: 'PJ-THRU', routeId: 'LIRR-PJ', dir: 1, service: 'Through diesel · Jamaica–Port Jefferson', headsign: 'Port Jefferson', stops: PJ_THROUGH, departures: series([6, 50], [20, 50], 120) },
  { id: 'PJ-DSL-W', routeId: 'LIRR-PJ', dir: 0, service: 'Diesel · Huntington–Port Jefferson', headsign: 'Huntington', stops: reverse(PJ_DIESEL), departures: hourly(5, 22, 0) },
  { id: 'PJ-EL-WB', routeId: 'LIRR-PJ', dir: 0, service: 'Electric · Penn–Huntington', headsign: 'Penn Station', stops: reverse(PJ_ELECTRIC_WDS), departures: hourly(5, 22, 56) },
  { id: 'PJ-THRU-W', routeId: 'LIRR-PJ', dir: 0, service: 'Through diesel · Jamaica–Port Jefferson', headsign: 'Jamaica', stops: reverse(PJ_THROUGH), departures: series([6, 30], [20, 30], 120) },
  {
    id: 'PW-W', routeId: 'LIRR-PW', dir: 0, service: 'Port Washington Branch', headsign: 'Penn Station', stops: PW_LINE,
    departures: peak(hourly(5, 22, 0), hourly(6, 9, 30), hourly(16, 19, 30)),
  },
  {
    id: 'PW-E', routeId: 'LIRR-PW', dir: 1, service: 'Port Washington Branch', headsign: 'Port Washington', stops: reverse(PW_LINE),
    departures: peak(hourly(5, 22, 20), hourly(7, 9, 50), hourly(16, 19, 50)),
  },
  {
    id: 'Q44-S', routeId: 'Q44', dir: 1, service: 'Q44-SBS', headsign: 'Jamaica', stops: Q44_LINE,
    departures: peak(series([5, 4], [6, 54], 10), series([7, 0], [9, 30], 7), series([9, 40], [15, 50], 10), series([16, 0], [19, 30], 7), series([19, 45], [23, 45], 15)),
  },
  {
    id: 'Q44-N', routeId: 'Q44', dir: 0, service: 'Q44-SBS', headsign: 'Flushing', stops: reverse(Q44_LINE),
    departures: peak(series([5, 0], [6, 50], 10), series([7, 0], [9, 30], 7), series([9, 40], [15, 50], 10), series([16, 0], [19, 30], 7), series([19, 45], [23, 45], 15)),
  },
];

const pair = (a: string, b: string, sec: number): ScheduledTransfer[] => [
  { from: a, to: b, minTransferSec: sec },
  { from: b, to: a, minTransferSec: sec },
];

/** Synthetic "published" minimum transfer times, like GTFS transfers.txt. */
const transfers: ScheduledTransfer[] = [
  ...pair('7-61', 'L-WDS', 180),
  ...pair('7-74', 'E-JH', 180),
  ...pair('E-SUT', 'L-JAM', 300),
  ...pair('Q44-ARCHER', 'L-JAM', 240),
  ...pair('Q44-ARCHER', 'E-SUT', 180),
  ...pair('7-FLU', 'L-FLU', 300),
  ...pair('7-FLU', 'Q44-MAIN', 120),
  ...pair('L-FLU', 'Q44-MAIN', 240),
];

export function buildDemoTimetable(): Timetable {
  const trips: Record<string, Trip> = {};
  const patterns = specs.map((s) => build(s, trips));
  return {
    id: 'demo-queens-li',
    label: 'Synthetic demo timetable (weekday)',
    provenance: 'synthetic',
    stops: Object.fromEntries(stopList.map((s) => [s.id, s])),
    routes,
    trips,
    patterns,
    transfers,
  };
}
