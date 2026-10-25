// Generic Dijkstra shortest paths with a binary heap.

export interface WeightedEdge<E> {
  to: string;
  weight: number;
  data: E;
}

export type Adjacency<E> = Map<string, WeightedEdge<E>[]>;

class MinHeap {
  private keys: number[] = [];
  private vals: string[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, v: string) {
    this.keys.push(k);
    this.vals.push(v);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, string] | undefined {
    if (!this.keys.length) return undefined;
    const top: [number, string] = [this.keys[0], this.vals[0]];
    const lk = this.keys.pop()!;
    const lv = this.vals.pop()!;
    if (this.keys.length) {
      this.keys[0] = lk;
      this.vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
  }
}

export interface ShortestPathResult<E> {
  cost: number;
  nodes: string[];
  edges: E[];
}

/**
 * Multi-source, multi-target Dijkstra. Returns the cheapest path from any
 * source to any target, or null when no target is reachable.
 */
export function dijkstra<E>(
  adj: Adjacency<E>,
  sources: string[],
  targets: Iterable<string>,
): ShortestPathResult<E> | null {
  const targetSet = new Set(targets);
  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edge: E } | null>();
  const heap = new MinHeap();
  for (const s of sources) {
    dist.set(s, 0);
    prev.set(s, null);
    heap.push(0, s);
  }
  while (heap.size) {
    const [d, u] = heap.pop()!;
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (targetSet.has(u)) {
      const nodes: string[] = [];
      const edges: E[] = [];
      let cur: string | undefined = u;
      while (cur !== undefined) {
        nodes.push(cur);
        const p = prev.get(cur);
        if (!p) break;
        edges.push(p.edge);
        cur = p.node;
      }
      return { cost: d, nodes: nodes.reverse(), edges: edges.reverse() };
    }
    for (const e of adj.get(u) ?? []) {
      if (e.weight < 0) throw new Error('Negative edge weight');
      const nd = d + e.weight;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { node: u, edge: e.data });
        heap.push(nd, e.to);
      }
    }
  }
  return null;
}
