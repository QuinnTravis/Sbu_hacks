// Deterministic random numbers and small statistics helpers.
// Every simulation in TransitFlow is seeded, so results are reproducible.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of the parts, for deriving independent seeds. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function standardNormal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function lognormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(sigma * standardNormal(rng));
}

export function exponential(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  return -mean * Math.log(1 - rng());
}

export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Summary {
  n: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
}

export function summarize(samples: number[]): Summary {
  const s = Float64Array.from(samples).sort();
  let sum = 0;
  for (const x of s) sum += x;
  return {
    n: s.length,
    mean: s.length ? sum / s.length : NaN,
    p10: quantileSorted(s, 0.1),
    p50: quantileSorted(s, 0.5),
    p90: quantileSorted(s, 0.9),
    min: s[0],
    max: s[s.length - 1],
  };
}

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function histogram(samples: number[], lo: number, hi: number, bins: number): number[] {
  const out = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const x of samples) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w)));
    out[i]++;
  }
  return out;
}
