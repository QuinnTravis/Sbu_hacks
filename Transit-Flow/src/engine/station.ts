// Indoor station graph: pathfinding, traversal-time sampling, and
// rider-facing instructions.

import { dijkstra, type Adjacency } from './graph';
import { exponential, lognormal, type Rng } from './random';
import type { PlatformBinding, StationEdge, StationGraph, StationNode } from './types';

export interface PathOptions {
  accessible: boolean;
  /** Edge ids that are out of service. */
  outages: ReadonlySet<string>;
  /** Crowd multiplier at the station (1 = normal). */
  crowd: number;
  /** Extra cost per edge id, used to find alternative paths. */
  penalties?: ReadonlyMap<string, number>;
}

export interface DirectedStep {
  edge: StationEdge;
  from: string;
  to: string;
}

export interface StationPath {
  stationId: string;
  nodes: string[];
  steps: DirectedStep[];
  /** Median-based expected traversal time under the given crowding. */
  expectedSec: number;
  stepFree: boolean;
}

export function edgeCostSec(e: StationEdge, crowd: number): number {
  const c = Math.max(0, crowd - 1);
  return e.medianSec * (1 + e.crowdSensitivity * c) + (e.queueSec ?? 0) * c;
}

export function edgeUsable(e: StationEdge, opts: Pick<PathOptions, 'accessible' | 'outages'>): boolean {
  if (opts.outages.has(e.id)) return false;
  if (opts.accessible && !e.accessible) return false;
  return true;
}

export function buildAdjacency(g: StationGraph, opts: PathOptions): Adjacency<DirectedStep> {
  const adj: Adjacency<DirectedStep> = new Map();
  const add = (from: string, to: string, edge: StationEdge) => {
    const w = edgeCostSec(edge, opts.crowd) + (opts.penalties?.get(edge.id) ?? 0);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, weight: w, data: { edge, from, to } });
  };
  for (const e of g.edges) {
    if (!edgeUsable(e, opts)) continue;
    add(e.from, e.to, e);
    if (!e.oneWay) add(e.to, e.from, e);
  }
  return adj;
}

export function findPath(
  g: StationGraph,
  fromNodes: string[],
  toNodes: string[],
  opts: PathOptions,
): StationPath | null {
  const res = dijkstra(buildAdjacency(g, opts), fromNodes, toNodes);
  if (!res) return null;
  const expectedSec = res.edges.reduce((s, st) => s + edgeCostSec(st.edge, opts.crowd), 0);
  return {
    stationId: g.id,
    nodes: res.nodes,
    steps: res.edges,
    expectedSec,
    stepFree: res.edges.every((s) => s.edge.accessible),
  };
}

export function findBinding(
  g: StationGraph,
  stopId: string,
  routeId: string,
  directionId: 0 | 1,
  service?: string,
): PlatformBinding | undefined {
  const matches = g.bindings.filter(
    (b) => b.stopId === stopId && b.routeId === routeId && b.directionId === directionId,
  );
  return matches.find((b) => b.service && b.service === service) ?? matches.find((b) => !b.service);
}

export interface TransferPaths {
  /** One path per alighting position on the inbound platform. */
  bySource: { node: string; path: StationPath }[];
  /** The alighting position that minimises expected transfer time. */
  best: { node: string; path: StationPath };
}

export function transferPaths(
  g: StationGraph,
  inbound: PlatformBinding,
  outbound: PlatformBinding,
  opts: PathOptions,
): TransferPaths | null {
  const bySource: { node: string; path: StationPath }[] = [];
  for (const node of inbound.nodes) {
    const path = findPath(g, [node], outbound.nodes, opts);
    if (path) bySource.push({ node, path });
  }
  if (!bySource.length) return null;
  const best = bySource.reduce((a, b) => (b.path.expectedSec < a.path.expectedSec ? b : a));
  return { bySource, best };
}

/** Per-rider walking-speed factor (1 = typical regular commuter). */
export function sampleWalkerFactor(rng: Rng, familiarity: 'regular' | 'first-time'): number {
  return familiarity === 'first-time' ? lognormal(rng, 1.12, 0.16) : lognormal(rng, 1, 0.12);
}

const SPEED_KINDS = new Set(['walk', 'stairs', 'crosswalk', 'street']);

/**
 * Sample the time to traverse a path. Walking speed is shared across the
 * path (a slow walker is slow everywhere), each edge adds its own noise, and
 * crowding adds slowdown plus queueing at stairs, escalators and fare lines.
 */
export function sampleTraversal(
  path: StationPath,
  rng: Rng,
  crowd: number,
  walker: number,
  familiarity: 'regular' | 'first-time',
): number {
  const c = Math.max(0, crowd - 1);
  let t = 0;
  for (const { edge } of path.steps) {
    const speed = SPEED_KINDS.has(edge.kind) ? walker : 1;
    t += lognormal(rng, edge.medianSec * speed * (1 + edge.crowdSensitivity * c), edge.sigma);
    if (edge.queueSec && c > 0) t += exponential(rng, edge.queueSec * c);
    if (familiarity === 'first-time' && edge.kind !== 'walk') t += exponential(rng, 6);
  }
  return t;
}

// ---------- Rider-facing instructions ----------

export function nodeById(g: StationGraph, id: string): StationNode {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown node ${id} in ${g.id}`);
  return n;
}

export function describeStep(g: StationGraph, step: DirectedStep): string {
  const forward = step.from === step.edge.from;
  const custom = forward ? step.edge.instruction : step.edge.instructionReverse;
  if (custom) return custom;
  const a = nodeById(g, step.from);
  const b = nodeById(g, step.to);
  const dir = b.level > a.level ? 'up' : b.level < a.level ? 'down' : '';
  switch (step.edge.kind) {
    case 'stairs':
      return `Take the stairs ${dir} to ${b.label}`;
    case 'escalator':
      return `Take the escalator ${dir} to ${b.label}`;
    case 'elevator':
      return `Take the elevator ${dir} to ${b.label}`;
    case 'fare':
      return forward ? `Pass through fare control to ${b.label}` : `Pass through fare control to ${b.label}`;
    case 'crosswalk':
      return `Cross at the crosswalk to ${b.label}`;
    case 'street':
      return `Walk to ${b.label}`;
    default:
      return `Walk to ${b.label}`;
  }
}

/** Collapse consecutive same-level walks into one instruction. */
export function instructions(g: StationGraph, path: StationPath): { text: string; kind: string; sec: number }[] {
  const out: { text: string; kind: string; sec: number }[] = [];
  for (const step of path.steps) {
    const sec = step.edge.medianSec;
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'walk' && step.edge.kind === 'walk' && !step.edge.instruction) {
      prev.text = describeStep(g, step);
      prev.sec += sec;
      continue;
    }
    out.push({ text: describeStep(g, step), kind: step.edge.kind, sec });
  }
  return out;
}

export function positionHint(g: StationGraph, nodeId: string): string | null {
  const n = nodeById(g, nodeId);
  if (!n.position) return null;
  return { front: 'Ride near the front of the train', middle: 'Ride in the middle of the train', rear: 'Ride near the rear of the train' }[n.position];
}
