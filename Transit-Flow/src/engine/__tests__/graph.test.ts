import { describe, expect, it } from 'vitest';
import { dijkstra, type Adjacency } from '../graph';
import { buildAdjacency, findPath, sampleTraversal } from '../station';
import { mulberry32 } from '../random';
import { woodside, jacksonHeights } from '../../data/stations';

const adj = (edges: [string, string, number][]): Adjacency<string> => {
  const m: Adjacency<string> = new Map();
  for (const [a, b, w] of edges) {
    if (!m.has(a)) m.set(a, []);
    m.get(a)!.push({ to: b, weight: w, data: `${a}${b}` });
  }
  return m;
};

describe('dijkstra', () => {
  it('finds the cheapest path, not the one with fewest edges', () => {
    const g = adj([['a', 'd', 10], ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1]]);
    const r = dijkstra(g, ['a'], ['d'])!;
    expect(r.cost).toBe(3);
    expect(r.nodes).toEqual(['a', 'b', 'c', 'd']);
    expect(r.edges).toEqual(['ab', 'bc', 'cd']);
  });

  it('returns null when the target is unreachable', () => {
    expect(dijkstra(adj([['a', 'b', 1]]), ['a'], ['z'])).toBeNull();
  });

  it('supports multiple sources and targets', () => {
    const g = adj([['s1', 'x', 5], ['s2', 'x', 1], ['x', 't1', 4], ['x', 't2', 2]]);
    const r = dijkstra(g, ['s1', 's2'], ['t1', 't2'])!;
    expect(r.cost).toBe(3);
    expect(r.nodes).toEqual(['s2', 'x', 't2']);
  });

  it('rejects negative weights', () => {
    expect(() => dijkstra(adj([['a', 'b', -1]]), ['a'], ['b'])).toThrow();
  });
});

describe('station graphs', () => {
  const none = new Set<string>();

  it('every edge references existing nodes and every binding node exists', () => {
    for (const g of [woodside, jacksonHeights]) {
      const ids = new Set(g.nodes.map((n) => n.id));
      for (const e of g.edges) {
        expect(ids.has(e.from), `${g.id}:${e.id}`).toBe(true);
        expect(ids.has(e.to), `${g.id}:${e.id}`).toBe(true);
      }
      for (const b of g.bindings) for (const n of b.nodes) expect(ids.has(n)).toBe(true);
    }
  });

  it('Woodside 7 to LIRR leaves fare control and changes three levels', () => {
    const p = findPath(woodside, ['7mh-mid'], ['lirr-eb-w', 'lirr-eb-mid', 'lirr-eb-e'], { accessible: false, outages: none, crowd: 1 })!;
    expect(p.steps.some((s) => s.edge.kind === 'fare')).toBe(true);
    expect(p.expectedSec).toBeGreaterThan(150);
    expect(p.expectedSec).toBeLessThan(400);
  });

  it('accessible routing uses elevators only', () => {
    const p = findPath(woodside, ['7mh-front'], ['lirr-eb-mid'], { accessible: true, outages: none, crowd: 1 })!;
    expect(p.stepFree).toBe(true);
    expect(p.steps.some((s) => s.edge.kind === 'elevator')).toBe(true);
    expect(p.steps.every((s) => s.edge.kind !== 'stairs' && s.edge.kind !== 'escalator')).toBe(true);
  });

  it('an elevator outage makes the step-free path impossible (inaccessible path)', () => {
    const p = findPath(woodside, ['7mh-front'], ['lirr-eb-mid', 'lirr-eb-w', 'lirr-eb-e'], {
      accessible: true,
      outages: new Set(['w-el4']),
      crowd: 1,
    });
    expect(p).toBeNull();
  });

  it('one-way escalators are not used in reverse', () => {
    const a = buildAdjacency(jacksonHeights, { accessible: false, outages: none, crowd: 1 });
    expect((a.get('mz7') ?? []).some((e) => e.data.edge.id === 'j-es1')).toBe(false);
    expect((a.get('7mh-rear') ?? []).some((e) => e.data.edge.id === 'j-es1')).toBe(true);
  });

  it('crowding increases sampled traversal time', () => {
    const p = findPath(woodside, ['7mh-mid'], ['lirr-eb-mid'], { accessible: false, outages: none, crowd: 1 })!;
    const mean = (crowd: number) => {
      const rng = mulberry32(1);
      let s = 0;
      for (let i = 0; i < 2000; i++) s += sampleTraversal(p, rng, crowd, 1, 'regular');
      return s / 2000;
    };
    expect(mean(1.9)).toBeGreaterThan(mean(1) * 1.3);
  });
});
