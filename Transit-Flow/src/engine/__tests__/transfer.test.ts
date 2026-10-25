import { describe, expect, it } from 'vitest';
import { connectionProbability, assess, missConsequence } from '../transfer';
import { realtimeDelay, realtimeStatus } from '../delays';
import { lognormal, mulberry32, summarize, wilson } from '../random';
import { ctx, tinyWorld } from './fixtures';
import { demoWorld } from '../../data/world';
import { delayModels } from '../../data/models';
import { makeWorld } from '../network';

const w = tinyWorld();
const T = w.tt.trips;
const conn = (sTrip: string, rTrip: string) => ({ inTrip: T[sTrip], inIdx: 1, outTrip: T[rTrip], outIdx: 0 });

describe('random helpers', () => {
  it('lognormal median is the median', () => {
    const rng = mulberry32(3);
    const xs = Array.from({ length: 4000 }, () => lognormal(rng, 100, 0.4));
    expect(summarize(xs).p50).toBeGreaterThan(95);
    expect(summarize(xs).p50).toBeLessThan(105);
  });
  it('wilson interval contains the estimate', () => {
    const [lo, hi] = wilson(30, 100);
    expect(lo).toBeLessThan(0.3);
    expect(hi).toBeGreaterThan(0.3);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe('connection probability', () => {
  // Subway S-7:30 reaches B at 7:45; rail R-7:30 left RB at 7:30.
  it('is impossible when the train departs before the rider arrives', () => {
    const r = connectionProbability(w, ctx(), conn(`S-${7 * 3600 + 1800}`, `R-${7 * 3600 + 1800}`));
    expect(r.windowSec).toBeLessThan(0);
    expect(r.pSuccess).toBe(0);
    expect(r.assessment).toBe('impossible');
  });

  it('is near zero when the window is shorter than the walk', () => {
    // S-8:13 is not in the timetable; use S-8:10 -> B 8:25, rail at 8:30 gives 5 min window,
    // but the stair path takes ~2 min + 30 s boarding buffer so this should be safe.
    const safe = connectionProbability(w, ctx(), conn(`S-${8 * 3600 + 600}`, `R-${8 * 3600 + 1800}`));
    expect(safe.pSuccess).toBeGreaterThan(0.95);
    // S-8:10 window 5 min with step-free path (elevator ~200 s + queue + 30 s buffer) is tight.
    const access = connectionProbability(w, ctx({ accessible: true }), conn(`S-${8 * 3600 + 600}`, `R-${8 * 3600 + 1800}`));
    expect(access.pSuccess).toBeLessThan(safe.pSuccess);
    // S-8:20 -> B 8:35: the train left at 8:30.
    const gone = connectionProbability(w, ctx(), conn(`S-${8 * 3600 + 1200}`, `R-${8 * 3600 + 1800}`));
    expect(gone.assessment).toBe('impossible');
  });

  it('a delayed incoming service lowers the probability', () => {
    const c = conn(`S-${8 * 3600 + 600}`, `R-${8 * 3600 + 1800}`);
    const base = connectionProbability(w, ctx(), c, { seed: 1 });
    const delayed = connectionProbability(
      w,
      ctx({ realtime: { source: 'demo', feedTimestampSec: 8 * 3600 - 30, tripUpdates: [{ tripId: c.inTrip.id, delaySec: 180 }], alerts: [] } }),
      c,
      { seed: 1 },
    );
    expect(delayed.pSuccess).toBeLessThan(base.pSuccess - 0.3);
  });

  it('stale or missing real-time data falls back to the schedule model', () => {
    const c = conn(`S-${8 * 3600 + 600}`, `R-${8 * 3600 + 1800}`);
    const stale = ctx({
      nowSec: 8 * 3600,
      realtime: { source: 'demo', feedTimestampSec: 8 * 3600 - 1200, tripUpdates: [{ tripId: c.inTrip.id, delaySec: 600 }], alerts: [] },
    });
    expect(realtimeStatus(stale).kind).toBe('stale');
    expect(realtimeDelay(stale, c.inTrip.id)).toBeNull();
    expect(realtimeStatus(ctx()).kind).toBe('none');
    const a = connectionProbability(w, stale, c, { seed: 9 });
    const b = connectionProbability(w, ctx(), c, { seed: 9 });
    expect(a.pSuccess).toBe(b.pSuccess);
  });

  it('is reproducible for a given seed', () => {
    const c = conn(`S-${8 * 3600 + 600}`, `R-${8 * 3600 + 1800}`);
    const dw = tinyWorld({ s: delayModels['nyct-7'], r: delayModels['lirr-pj'], b: delayModels['bus-sbs'] });
    const a = connectionProbability(dw, ctx(), c, { seed: 4 });
    const b = connectionProbability(dw, ctx(), c, { seed: 4 });
    expect(a.pSuccess).toBe(b.pSuccess);
  });

  it('a missed connection on an hourly line costs an hour', () => {
    const m = missConsequence(w, conn(`S-${8 * 3600 + 600}`, `R-${8 * 3600 + 1800}`))!;
    expect(m.extraWaitSec).toBe(3600);
  });

  it('assessment thresholds', () => {
    expect(assess(0.95, 300)).toBe('reliable');
    expect(assess(0.8, 300)).toBe('some-risk');
    expect(assess(0.5, 300)).toBe('high-risk');
    expect(assess(0.1, 300)).toBe('unlikely');
    expect(assess(1, -10)).toBe('impossible');
  });
});

describe('demo network: Woodside', () => {
  const world = demoWorld;
  const seven = (dep: string) => world.tt.trips[`7-W-${dep}`];
  const lirr = world.tt.trips['PJ-EL-W-0806'];
  const idx = (t: typeof lirr, stop: string) => t.stopTimes.findIndex((s) => s.stopId === stop);

  it('the 4-minute 7 → LIRR window is a phantom connection; 8 minutes is reliable', () => {
    const tight = connectionProbability(world, ctx(), { inTrip: seven('0755'), inIdx: idx(seven('0755'), '7-61'), outTrip: lirr, outIdx: idx(lirr, 'L-WDS') });
    const roomy = connectionProbability(world, ctx(), { inTrip: seven('0751'), inIdx: idx(seven('0751'), '7-61'), outTrip: lirr, outIdx: idx(lirr, 'L-WDS') });
    expect(tight.windowSec).toBe(240);
    expect(tight.windowSec).toBeGreaterThanOrEqual(tight.model.schedMinSec); // valid on the timetable
    expect(tight.pSuccess).toBeLessThan(0.6);
    expect(roomy.pSuccess).toBeGreaterThan(0.85);
    expect(tight.miss?.extraWaitSec).toBe(3600);
  });

  it('riding near the recommended car helps', () => {
    const c = { inTrip: seven('0755'), inIdx: idx(seven('0755'), '7-61'), outTrip: lirr, outIdx: idx(lirr, 'L-WDS') };
    expect(connectionProbability(world, ctx(), c, { source: 'best' }).pSuccess).toBeGreaterThan(
      connectionProbability(world, ctx(), c, { source: 'random' }).pSuccess,
    );
  });

  it('an unmodelled station falls back to a wide distribution around the published minimum', () => {
    const noGraphs = makeWorld(world.tt, {}, world.delayModels);
    const c = { inTrip: seven('0751'), inIdx: idx(seven('0751'), '7-61'), outTrip: lirr, outIdx: idx(lirr, 'L-WDS') };
    const r = connectionProbability(noGraphs, ctx(), c);
    expect(r.model.modeled).toBe(false);
    expect(r.physical.p50).toBeGreaterThan(150);
    expect(r.physical.p50).toBeLessThan(210);
  });
});
