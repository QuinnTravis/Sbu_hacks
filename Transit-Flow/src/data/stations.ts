// ILLUSTRATIVE INDOOR STATION GRAPHS.
// Hand-authored prototypes. The topology follows the general arrangement of
// each station (which level each service is on, whether a transfer leaves fare
// control) but node positions, distances and times are NOT surveyed. Replace
// with verified station data before relying on them.

import type { EdgeKind, NodeKind, StationEdge, StationGraph, StationNode } from '../engine/types';

const N = (
  id: string,
  label: string,
  level: number,
  x: number,
  y: number,
  kind: NodeKind,
  position?: StationNode['position'],
): StationNode => ({ id, label, level, x, y, kind, position });

interface EOpts {
  sigma?: number;
  acc?: boolean;
  cs?: number;
  q?: number;
  oneWay?: boolean;
  label?: string;
  instruction?: string;
  instructionReverse?: string;
}

const DEFAULTS: Record<EdgeKind, { sigma: number; acc: boolean; cs: number; q: number }> = {
  walk: { sigma: 0.18, acc: true, cs: 0.5, q: 0 },
  stairs: { sigma: 0.25, acc: false, cs: 0.8, q: 22 },
  escalator: { sigma: 0.2, acc: false, cs: 0.4, q: 30 },
  elevator: { sigma: 0.5, acc: true, cs: 0.3, q: 35 },
  fare: { sigma: 0.4, acc: true, cs: 1, q: 15 },
  crosswalk: { sigma: 0.6, acc: true, cs: 0.3, q: 0 },
  street: { sigma: 0.22, acc: true, cs: 0.4, q: 0 },
};

function E(id: string, from: string, to: string, kind: EdgeKind, medianSec: number, o: EOpts = {}): StationEdge {
  const d = DEFAULTS[kind];
  return {
    id,
    from,
    to,
    kind,
    medianSec,
    sigma: o.sigma ?? d.sigma,
    accessible: o.acc ?? d.acc,
    crowdSensitivity: o.cs ?? d.cs,
    queueSec: o.q ?? d.q,
    oneWay: o.oneWay,
    label: o.label,
    instruction: o.instruction,
    instructionReverse: o.instructionReverse,
  };
}

const NOTE =
  'Illustrative prototype. Level arrangement follows public descriptions of the station; positions and times are assumptions, not surveyed measurements.';

// ---------------------------------------------------------------------------
// Woodside: elevated 7 above Roosevelt Av, LIRR below street level. The
// transfer leaves subway fare control.
// ---------------------------------------------------------------------------
export const woodside: StationGraph = {
  id: 'woodside',
  name: 'Woodside',
  verification: 'illustrative',
  sourceNote: NOTE,
  width: 1000,
  height: 610,
  levels: [
    { level: 2, label: 'Elevated · 7 platforms (61 St–Woodside)', y: 105 },
    { level: 1, label: 'Mezzanine · subway fare control', y: 228 },
    { level: 0, label: 'Street · Roosevelt Av & 61 St', y: 348 },
    { level: -1, label: 'LIRR platforms', y: 505 },
  ],
  nodes: [
    N('7mh-front', 'Manhattan-bound 7 · west end', 2, 110, 82, 'platform', 'front'),
    N('7mh-mid', 'Manhattan-bound 7 · center', 2, 280, 82, 'platform', 'middle'),
    N('7mh-rear', 'Manhattan-bound 7 · east end', 2, 450, 82, 'platform', 'rear'),
    N('7fl-rear', 'Flushing-bound 7 · west end', 2, 110, 128, 'platform', 'rear'),
    N('7fl-mid', 'Flushing-bound 7 · center', 2, 280, 128, 'platform', 'middle'),
    N('7fl-front', 'Flushing-bound 7 · east end', 2, 450, 128, 'platform', 'front'),
    N('mz-w-paid', 'West mezzanine (inside fare control)', 1, 150, 228, 'mezzanine'),
    N('mz-w-free', 'West mezzanine (outside fare control)', 1, 290, 228, 'mezzanine'),
    N('mz-e-paid', 'East mezzanine (inside fare control)', 1, 450, 228, 'mezzanine'),
    N('mz-e-free', 'East mezzanine · elevator lobby', 1, 590, 228, 'mezzanine'),
    N('st-n', 'North sidewalk, Roosevelt Av', 0, 290, 348, 'street'),
    N('st-s', 'South sidewalk, Roosevelt Av', 0, 590, 348, 'street'),
    N('lirr-ov', 'LIRR overpass · ticket machines', 0, 790, 348, 'concourse'),
    N('lirr-eb-w', 'LIRR eastbound · west end', -1, 640, 462, 'platform', 'rear'),
    N('lirr-eb-mid', 'LIRR eastbound · center', -1, 790, 462, 'platform', 'middle'),
    N('lirr-eb-e', 'LIRR eastbound · east end', -1, 940, 462, 'platform', 'front'),
    N('lirr-wb', 'LIRR westbound (to Manhattan)', -1, 790, 512, 'platform'),
    N('lirr-pw', 'Port Washington Branch platform', -1, 790, 562, 'platform'),
  ],
  edges: [
    E('w-p1', '7mh-front', '7mh-mid', 'walk', 35),
    E('w-p2', '7mh-mid', '7mh-rear', 'walk', 35),
    E('w-p3', '7fl-rear', '7fl-mid', 'walk', 35),
    E('w-p4', '7fl-mid', '7fl-front', 'walk', 35),
    E('w-s1', '7mh-front', 'mz-w-paid', 'stairs', 40, { label: 'West stair' }),
    E('w-s2', '7fl-rear', 'mz-w-paid', 'stairs', 40, { label: 'West stair' }),
    E('w-s3', '7mh-rear', 'mz-e-paid', 'stairs', 40, { label: 'East stair' }),
    E('w-s4', '7fl-front', 'mz-e-paid', 'stairs', 40, { label: 'East stair' }),
    E('w-el1', '7mh-rear', 'mz-e-paid', 'elevator', 75, { label: 'Elevator · Manhattan-bound platform' }),
    E('w-el2', '7fl-front', 'mz-e-paid', 'elevator', 75, { label: 'Elevator · Flushing-bound platform' }),
    E('w-f1', 'mz-w-paid', 'mz-w-free', 'fare', 12, { label: 'West turnstiles', instruction: 'Exit through the west turnstiles', instructionReverse: 'Enter through the west turnstiles' }),
    E('w-f2', 'mz-e-paid', 'mz-e-free', 'fare', 12, { label: 'East turnstiles & accessible gate', instruction: 'Exit through the east turnstiles or accessible gate', instructionReverse: 'Enter through the east turnstiles or accessible gate' }),
    E('w-s5', 'mz-w-free', 'st-n', 'stairs', 35, { label: 'Street stair (north side)' }),
    E('w-s6', 'mz-e-free', 'st-s', 'stairs', 35, { label: 'Street stair (south side)' }),
    E('w-el3', 'mz-e-free', 'st-s', 'elevator', 70, { label: 'Street elevator (south side)' }),
    E('w-x1', 'st-n', 'st-s', 'crosswalk', 70, { label: 'Crosswalk across Roosevelt Av', instruction: 'Cross Roosevelt Av at the signal', instructionReverse: 'Cross Roosevelt Av at the signal' }),
    E('w-w1', 'st-s', 'lirr-ov', 'street', 60, { label: 'Sidewalk to LIRR entrance', instruction: 'Follow the sidewalk east to the LIRR station entrance', instructionReverse: 'Follow the sidewalk west to the subway entrance' }),
    E('w-s7', 'lirr-ov', 'lirr-eb-mid', 'stairs', 35, { label: 'Stair to eastbound platform' }),
    E('w-el4', 'lirr-ov', 'lirr-eb-mid', 'elevator', 80, { label: 'Elevator to eastbound platform' }),
    E('w-s8', 'lirr-ov', 'lirr-wb', 'stairs', 35, { label: 'Stair to westbound platform' }),
    E('w-el5', 'lirr-ov', 'lirr-wb', 'elevator', 80, { label: 'Elevator to westbound platform' }),
    E('w-s9', 'lirr-ov', 'lirr-pw', 'stairs', 40, { label: 'Stair to Port Washington platform' }),
    E('w-el6', 'lirr-ov', 'lirr-pw', 'elevator', 80, { label: 'Elevator to Port Washington platform' }),
    E('w-p5', 'lirr-eb-w', 'lirr-eb-mid', 'walk', 40),
    E('w-p6', 'lirr-eb-mid', 'lirr-eb-e', 'walk', 40),
  ],
  bindings: [
    { stopId: '7-61', routeId: '7', directionId: 0, label: '7 · Manhattan-bound platform', nodes: ['7mh-front', '7mh-mid', '7mh-rear'] },
    { stopId: '7-61', routeId: '7', directionId: 1, label: '7 · Flushing-bound platform', nodes: ['7fl-rear', '7fl-mid', '7fl-front'] },
    { stopId: 'L-WDS', routeId: 'LIRR-PJ', directionId: 1, label: 'LIRR · eastbound (Jamaica & Long Island)', nodes: ['lirr-eb-w', 'lirr-eb-mid', 'lirr-eb-e'] },
    { stopId: 'L-WDS', routeId: 'LIRR-PJ', directionId: 0, label: 'LIRR · westbound (Penn Station)', nodes: ['lirr-wb'] },
    { stopId: 'L-WDS', routeId: 'LIRR-PW', directionId: 0, label: 'LIRR Port Washington Branch · to Penn', nodes: ['lirr-pw'] },
    { stopId: 'L-WDS', routeId: 'LIRR-PW', directionId: 1, label: 'LIRR Port Washington Branch · to Flushing', nodes: ['lirr-pw'] },
  ],
};

// ---------------------------------------------------------------------------
// Jackson Heights: elevated 7 at 74 St–Broadway, underground Queens Blvd
// line at Jackson Hts–Roosevelt Av. Free transfer inside fare control.
// ---------------------------------------------------------------------------
export const jacksonHeights: StationGraph = {
  id: 'jackson-heights',
  name: 'Jackson Heights',
  verification: 'illustrative',
  sourceNote: NOTE,
  width: 1000,
  height: 610,
  levels: [
    { level: 2, label: 'Elevated · 7 platforms (74 St–Broadway)', y: 92 },
    { level: 1, label: '7 mezzanine', y: 205 },
    { level: 0, label: 'Station house · Roosevelt Av & 74 St', y: 315 },
    { level: -1, label: 'Underground mezzanine', y: 420 },
    { level: -2, label: 'Queens Blvd line platforms (E · F · M · R)', y: 535 },
  ],
  nodes: [
    N('7mh-front', 'Manhattan-bound 7 · west end', 2, 130, 72, 'platform', 'front'),
    N('7mh-mid', 'Manhattan-bound 7 · center', 2, 310, 72, 'platform', 'middle'),
    N('7mh-rear', 'Manhattan-bound 7 · east end', 2, 490, 72, 'platform', 'rear'),
    N('7fl-rear', 'Flushing-bound 7 · west end', 2, 130, 114, 'platform', 'rear'),
    N('7fl-mid', 'Flushing-bound 7 · center', 2, 310, 114, 'platform', 'middle'),
    N('7fl-front', 'Flushing-bound 7 · east end', 2, 490, 114, 'platform', 'front'),
    N('mz7', '7 mezzanine', 1, 400, 205, 'mezzanine'),
    N('house', 'Station house concourse', 0, 400, 315, 'concourse'),
    N('exit', 'Street exit · 74 St & Roosevelt Av', 0, 640, 315, 'entrance'),
    N('ugm', 'Underground mezzanine', -1, 400, 420, 'mezzanine'),
    N('qeb-1', 'Jamaica-bound E/F · west end', -2, 230, 512, 'platform', 'rear'),
    N('qeb-2', 'Jamaica-bound E/F · center', -2, 400, 512, 'platform', 'middle'),
    N('qeb-3', 'Jamaica-bound E/F · east end', -2, 570, 512, 'platform', 'front'),
    N('qwb', 'Manhattan-bound E/F/M/R', -2, 400, 560, 'platform'),
  ],
  edges: [
    E('j-p1', '7mh-front', '7mh-mid', 'walk', 35),
    E('j-p2', '7mh-mid', '7mh-rear', 'walk', 35),
    E('j-p3', '7fl-rear', '7fl-mid', 'walk', 35),
    E('j-p4', '7fl-mid', '7fl-front', 'walk', 35),
    E('j-s1', '7mh-mid', 'mz7', 'stairs', 38, { label: 'Center stair' }),
    E('j-s2', '7fl-mid', 'mz7', 'stairs', 38, { label: 'Center stair' }),
    E('j-es1', '7mh-rear', 'mz7', 'escalator', 40, { oneWay: true, label: 'Escalator down (east end)' }),
    E('j-el1', '7mh-mid', 'mz7', 'elevator', 75, { label: 'Elevator · Manhattan-bound 7' }),
    E('j-el2', '7fl-mid', 'mz7', 'elevator', 75, { label: 'Elevator · Flushing-bound 7' }),
    E('j-s3', 'mz7', 'house', 'stairs', 30, { label: 'Stair to station house' }),
    E('j-es2', 'mz7', 'house', 'escalator', 34, { oneWay: true, label: 'Escalator down to station house' }),
    E('j-el3', 'mz7', 'house', 'elevator', 70, { label: 'Elevator to station house' }),
    E('j-f1', 'house', 'exit', 'fare', 12, { label: 'Turnstiles to 74 St' }),
    E('j-s4', 'house', 'ugm', 'stairs', 32, { label: 'Stair to underground mezzanine', instruction: 'Follow E · F · M · R signs down to the underground mezzanine' }),
    E('j-es3', 'house', 'ugm', 'escalator', 36, { oneWay: true, label: 'Escalator to underground mezzanine', instruction: 'Take the escalator down, following E · F · M · R signs' }),
    E('j-el4', 'house', 'ugm', 'elevator', 75, { label: 'Elevator to underground mezzanine' }),
    E('j-s5', 'ugm', 'qeb-2', 'stairs', 28, { label: 'Stair to Jamaica-bound platform', instruction: 'Take the stairs marked "Queens-bound / Jamaica" down to the platform' }),
    E('j-s6', 'ugm', 'qeb-1', 'stairs', 30, { label: 'West stair to Jamaica-bound platform' }),
    E('j-el5', 'ugm', 'qeb-2', 'elevator', 70, { label: 'Elevator to Jamaica-bound platform' }),
    E('j-s7', 'ugm', 'qwb', 'stairs', 28, { label: 'Stair to Manhattan-bound platform' }),
    E('j-el6', 'ugm', 'qwb', 'elevator', 70, { label: 'Elevator to Manhattan-bound platform' }),
    E('j-p5', 'qeb-1', 'qeb-2', 'walk', 40),
    E('j-p6', 'qeb-2', 'qeb-3', 'walk', 40),
  ],
  bindings: [
    { stopId: '7-74', routeId: '7', directionId: 0, label: '7 · Manhattan-bound platform', nodes: ['7mh-front', '7mh-mid', '7mh-rear'] },
    { stopId: '7-74', routeId: '7', directionId: 1, label: '7 · Flushing-bound platform', nodes: ['7fl-rear', '7fl-mid', '7fl-front'] },
    { stopId: 'E-JH', routeId: 'E', directionId: 1, label: 'E · Jamaica-bound platform', nodes: ['qeb-1', 'qeb-2', 'qeb-3'] },
    { stopId: 'E-JH', routeId: 'E', directionId: 0, label: 'E · Manhattan-bound platform', nodes: ['qwb'] },
  ],
};

// ---------------------------------------------------------------------------
// Jamaica: E at Sutphin Blvd–Archer Av (underground), elevated LIRR platforms
// reached via the overpass concourse. Q44 stop at street level.
// ---------------------------------------------------------------------------
export const jamaica: StationGraph = {
  id: 'jamaica',
  name: 'Jamaica',
  verification: 'illustrative',
  sourceNote: NOTE,
  width: 1000,
  height: 610,
  levels: [
    { level: 2, label: 'Overpass concourse', y: 85 },
    { level: 1, label: 'LIRR platforms', y: 205 },
    { level: 0, label: 'Street · Sutphin Blvd & Archer Av', y: 330 },
    { level: -1, label: 'Subway mezzanine', y: 435 },
    { level: -2, label: 'E platforms · Sutphin Blvd–Archer Av', y: 540 },
  ],
  nodes: [
    N('conc-w', 'Concourse · Sutphin Blvd side', 2, 450, 85, 'concourse'),
    N('conc', 'Concourse · center', 2, 680, 85, 'concourse'),
    N('lirr-eb-w', 'LIRR eastbound platform · west end', 1, 520, 190, 'platform', 'rear'),
    N('lirr-eb-e', 'LIRR eastbound platform · east end', 1, 780, 190, 'platform', 'front'),
    N('lirr-wb', 'LIRR westbound platform', 1, 680, 235, 'platform'),
    N('sut-ent', 'LIRR entrance · Sutphin Blvd', 0, 450, 330, 'entrance'),
    N('st', 'Sutphin Blvd & Archer Av', 0, 290, 330, 'street'),
    N('q44', 'Q44-SBS stop · Archer Av', 0, 130, 330, 'busstop'),
    N('smz-free', 'Subway mezzanine (outside fare control)', -1, 290, 435, 'mezzanine'),
    N('smz-paid', 'Subway mezzanine (inside fare control)', -1, 450, 435, 'mezzanine'),
    N('e-eb-1', 'E to Jamaica Center · west end', -2, 340, 522, 'platform', 'rear'),
    N('e-eb-2', 'E to Jamaica Center · east end', -2, 560, 522, 'platform', 'front'),
    N('e-wb', 'E to Manhattan', -2, 450, 565, 'platform'),
  ],
  edges: [
    E('m-p1', 'e-eb-1', 'e-eb-2', 'walk', 45),
    E('m-s1', 'e-eb-2', 'smz-paid', 'stairs', 30, { label: 'East stair' }),
    E('m-es1', 'e-eb-1', 'smz-paid', 'escalator', 40, { oneWay: true, label: 'Escalator up (west end)' }),
    E('m-el1', 'e-eb-2', 'smz-paid', 'elevator', 70, { label: 'Elevator · Jamaica Center-bound' }),
    E('m-s2', 'e-wb', 'smz-paid', 'stairs', 30, { label: 'Stair · Manhattan-bound' }),
    E('m-el2', 'e-wb', 'smz-paid', 'elevator', 70, { label: 'Elevator · Manhattan-bound' }),
    E('m-f1', 'smz-paid', 'smz-free', 'fare', 12, { label: 'Turnstiles', instruction: 'Exit through the turnstiles toward LIRR / AirTrain', instructionReverse: 'Enter through the turnstiles' }),
    E('m-es2', 'smz-free', 'st', 'escalator', 45, { oneWay: true, label: 'Escalator to street' }),
    E('m-s3', 'smz-free', 'st', 'stairs', 45, { label: 'Stair to street' }),
    E('m-el3', 'smz-free', 'st', 'elevator', 75, { label: 'Street elevator' }),
    E('m-w1', 'st', 'q44', 'street', 50, { label: 'Sidewalk to Q44 stop' }),
    E('m-x1', 'st', 'sut-ent', 'crosswalk', 60, { label: 'Cross Archer Av', instruction: 'Cross Archer Av to the LIRR entrance on Sutphin Blvd', instructionReverse: 'Cross Archer Av toward the subway entrance' }),
    E('m-es3', 'sut-ent', 'conc-w', 'escalator', 45, { oneWay: true, label: 'Escalator up to concourse' }),
    E('m-s4', 'sut-ent', 'conc-w', 'stairs', 50, { label: 'Stair to concourse' }),
    E('m-el4', 'sut-ent', 'conc-w', 'elevator', 70, { label: 'Elevator to concourse' }),
    E('m-w2', 'conc-w', 'conc', 'walk', 50, { label: 'Concourse' }),
    E('m-s5', 'conc-w', 'lirr-eb-w', 'stairs', 30, { label: 'Stair to eastbound platform (west)', instruction: 'Check the board for your train, then take the stairs down to its platform' }),
    E('m-s6', 'conc', 'lirr-eb-e', 'stairs', 30, { label: 'Stair to eastbound platform (east)', instruction: 'Check the board for your train, then take the stairs down to its platform' }),
    E('m-el5', 'conc', 'lirr-eb-e', 'elevator', 70, { label: 'Elevator to eastbound platform' }),
    E('m-s7', 'conc', 'lirr-wb', 'stairs', 30, { label: 'Stair to westbound platform' }),
    E('m-el6', 'conc', 'lirr-wb', 'elevator', 70, { label: 'Elevator to westbound platform' }),
    E('m-p2', 'lirr-eb-w', 'lirr-eb-e', 'walk', 60),
  ],
  bindings: [
    { stopId: 'E-SUT', routeId: 'E', directionId: 1, label: 'E · Jamaica Center-bound platform', nodes: ['e-eb-1', 'e-eb-2'] },
    { stopId: 'E-SUT', routeId: 'E', directionId: 0, label: 'E · Manhattan-bound platform', nodes: ['e-wb'] },
    { stopId: 'L-JAM', routeId: 'LIRR-PJ', directionId: 1, label: 'LIRR · eastbound (Port Jefferson Branch)', nodes: ['lirr-eb-w', 'lirr-eb-e'] },
    { stopId: 'L-JAM', routeId: 'LIRR-PJ', directionId: 0, label: 'LIRR · westbound', nodes: ['lirr-wb'] },
    { stopId: 'Q44-ARCHER', routeId: 'Q44', directionId: 1, label: 'Q44-SBS · arriving from Flushing', nodes: ['q44'] },
    { stopId: 'Q44-ARCHER', routeId: 'Q44', directionId: 0, label: 'Q44-SBS · to Flushing', nodes: ['q44'] },
  ],
};

// ---------------------------------------------------------------------------
// Flushing: 7 terminal underground at Main St; LIRR station a short walk
// south on Main St; Q44 stop on Main St.
// ---------------------------------------------------------------------------
export const flushing: StationGraph = {
  id: 'flushing',
  name: 'Flushing–Main St',
  verification: 'illustrative',
  sourceNote: NOTE,
  width: 1000,
  height: 610,
  levels: [
    { level: 1, label: 'LIRR platforms (raised)', y: 110 },
    { level: 0, label: 'Street · Main St', y: 255 },
    { level: -1, label: '7 mezzanine', y: 380 },
    { level: -2, label: '7 platform (terminal)', y: 505 },
  ],
  nodes: [
    N('lirr-wb', 'LIRR platform · to Woodside & Penn', 1, 760, 92, 'platform'),
    N('lirr-eb', 'LIRR platform · to Port Washington', 1, 760, 136, 'platform'),
    N('st-41', 'Main St & 41 Av', 0, 680, 255, 'street'),
    N('st-roos', 'Main St & Roosevelt Av', 0, 390, 255, 'street'),
    N('q44', 'Q44-SBS stop · Main St', 0, 170, 255, 'busstop'),
    N('mz-free', 'Mezzanine (outside fare control)', -1, 390, 380, 'mezzanine'),
    N('mz-paid', 'Mezzanine (inside fare control)', -1, 560, 380, 'mezzanine'),
    N('p7-a', '7 platform · west end', -2, 450, 505, 'platform', 'front'),
    N('p7-b', '7 platform · east end', -2, 690, 505, 'platform', 'rear'),
  ],
  edges: [
    E('f-p1', 'p7-a', 'p7-b', 'walk', 50),
    E('f-s1', 'p7-a', 'mz-paid', 'stairs', 35, { label: 'West stair' }),
    E('f-es1', 'p7-b', 'mz-paid', 'escalator', 40, { oneWay: true, label: 'Escalator up (east end)' }),
    E('f-el1', 'p7-a', 'mz-paid', 'elevator', 70, { label: 'Platform elevator' }),
    E('f-f1', 'mz-paid', 'mz-free', 'fare', 12, { label: 'Turnstiles', cs: 1.3, q: 20 }),
    E('f-s2', 'mz-free', 'st-roos', 'stairs', 30, { label: 'Street stair' }),
    E('f-el2', 'mz-free', 'st-roos', 'elevator', 70, { label: 'Street elevator' }),
    E('f-w1', 'st-roos', 'q44', 'street', 40, { label: 'Sidewalk to Q44 stop' }),
    E('f-w2', 'st-roos', 'st-41', 'street', 150, { sigma: 0.3, cs: 0.6, label: 'Main St sidewalk (often crowded)', instruction: 'Walk south on Main St to 41 Av', instructionReverse: 'Walk north on Main St to Roosevelt Av' }),
    E('f-s3', 'st-41', 'lirr-wb', 'stairs', 35, { label: 'Stair to westbound platform' }),
    E('f-r1', 'st-41', 'lirr-wb', 'walk', 70, { label: 'Ramp to westbound platform' }),
    E('f-s4', 'st-41', 'lirr-eb', 'stairs', 35, { label: 'Stair to eastbound platform' }),
    E('f-r2', 'st-41', 'lirr-eb', 'walk', 70, { label: 'Ramp to eastbound platform' }),
  ],
  bindings: [
    { stopId: '7-FLU', routeId: '7', directionId: 0, label: '7 · departing for Manhattan', nodes: ['p7-a', 'p7-b'] },
    { stopId: '7-FLU', routeId: '7', directionId: 1, label: '7 · arriving from Manhattan', nodes: ['p7-a', 'p7-b'] },
    { stopId: 'L-FLU', routeId: 'LIRR-PW', directionId: 0, label: 'LIRR · to Woodside & Penn', nodes: ['lirr-wb'] },
    { stopId: 'L-FLU', routeId: 'LIRR-PW', directionId: 1, label: 'LIRR · to Port Washington', nodes: ['lirr-eb'] },
    { stopId: 'Q44-MAIN', routeId: 'Q44', directionId: 1, label: 'Q44-SBS · to Jamaica', nodes: ['q44'] },
    { stopId: 'Q44-MAIN', routeId: 'Q44', directionId: 0, label: 'Q44-SBS · arriving from Jamaica', nodes: ['q44'] },
  ],
};

// ---------------------------------------------------------------------------
// Huntington: electric trains terminate across the island platform from the
// diesel trains to Port Jefferson.
// ---------------------------------------------------------------------------
export const huntington: StationGraph = {
  id: 'huntington',
  name: 'Huntington',
  verification: 'illustrative',
  sourceNote: NOTE,
  width: 1000,
  height: 610,
  levels: [
    { level: 1, label: 'Island platform', y: 210 },
    { level: 0, label: 'Station building · parking', y: 420 },
  ],
  nodes: [
    N('e-rear', 'Electric track · west end', 1, 220, 180, 'platform', 'rear'),
    N('e-mid', 'Electric track · center', 1, 480, 180, 'platform', 'middle'),
    N('e-front', 'Electric track · east end', 1, 740, 180, 'platform', 'front'),
    N('d-rear', 'Diesel track · west end', 1, 220, 245, 'platform'),
    N('d-mid', 'Diesel track · center', 1, 480, 245, 'platform'),
    N('d-front', 'Diesel track · east end', 1, 740, 245, 'platform'),
    N('bldg', 'Station building', 0, 480, 420, 'entrance'),
  ],
  edges: [
    E('h-p1', 'e-rear', 'e-mid', 'walk', 60),
    E('h-p2', 'e-mid', 'e-front', 'walk', 60),
    E('h-p3', 'd-rear', 'd-mid', 'walk', 60),
    E('h-p4', 'd-mid', 'd-front', 'walk', 60),
    E('h-x1', 'e-rear', 'd-rear', 'walk', 20, { label: 'Across the platform', instruction: 'Cross the platform to the diesel train' }),
    E('h-x2', 'e-mid', 'd-mid', 'walk', 20, { label: 'Across the platform', instruction: 'Cross the platform to the diesel train' }),
    E('h-x3', 'e-front', 'd-front', 'walk', 20, { label: 'Across the platform', instruction: 'Cross the platform to the diesel train' }),
    E('h-s1', 'd-mid', 'bldg', 'stairs', 35, { label: 'Stair to station building' }),
    E('h-r1', 'd-mid', 'bldg', 'walk', 80, { label: 'Ramp to station building' }),
  ],
  bindings: [
    { stopId: 'L-HUN', routeId: 'LIRR-PJ', directionId: 1, service: 'Electric · Penn–Huntington', label: 'Electric train from Penn / Jamaica', nodes: ['e-rear', 'e-mid', 'e-front'] },
    { stopId: 'L-HUN', routeId: 'LIRR-PJ', directionId: 1, service: 'Diesel · Huntington–Port Jefferson', label: 'Diesel train to Port Jefferson', nodes: ['d-rear', 'd-mid', 'd-front'] },
    { stopId: 'L-HUN', routeId: 'LIRR-PJ', directionId: 1, service: 'Through diesel · Jamaica–Port Jefferson', label: 'Through diesel to Port Jefferson', nodes: ['d-rear', 'd-mid', 'd-front'] },
    { stopId: 'L-HUN', routeId: 'LIRR-PJ', directionId: 0, service: 'Diesel · Huntington–Port Jefferson', label: 'Diesel train from Port Jefferson', nodes: ['d-rear', 'd-mid', 'd-front'] },
    { stopId: 'L-HUN', routeId: 'LIRR-PJ', directionId: 0, service: 'Electric · Penn–Huntington', label: 'Electric train to Jamaica / Penn', nodes: ['e-rear', 'e-mid', 'e-front'] },
    { stopId: 'L-HUN', routeId: 'LIRR-PJ', directionId: 0, service: 'Through diesel · Jamaica–Port Jefferson', label: 'Through diesel to Jamaica', nodes: ['d-rear', 'd-mid', 'd-front'] },
  ],
};

export const stationGraphs: Record<string, StationGraph> = {
  woodside,
  'jackson-heights': jacksonHeights,
  jamaica,
  flushing,
  huntington,
};
