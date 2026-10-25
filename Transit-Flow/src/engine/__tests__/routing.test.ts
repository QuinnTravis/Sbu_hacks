import { describe, expect, it } from 'vitest';
import { raptor, earliestArrival } from '../raptor';
import { plan, RELIABLE_THRESHOLD } from '../planner';
import { evaluateJourney } from '../evaluate';
import { ctx, tinyWorld } from './fixtures';
import { demoWorld } from '../../data/world';
import { places, sampleEvent, demoRealtime } from '../../data/models';

const H = (h: number, m = 0) => h * 3600 + m * 60;

describe('RAPTOR', () => {
  const w = tinyWorld();
  const q = (depart: number, maxTrips = 3) =>
    raptor(w, { access: [{ stopId: 'A', sec: 0 }], egress: [{ stopId: 'C', sec: 0 }], departSec: depart, maxTrips });

  it('returns the Pareto set over arrival time and number of trips', () => {
    const js = q(H(8));
    // 1 trip: direct bus at 8:20 → 9:30. 2 trips: subway 8:00 → B 8:15, rail 8:30 → 9:00.
    expect(js.map((j) => j.rides.length)).toEqual([1, 2]);
    expect(js[0].arriveSec).toBe(H(9, 30));
    expect(js[1].arriveSec).toBe(H(9));
    expect(js[1].rides.map((r) => r.routeId)).toEqual(['S', 'R']);
  });

  it('respects the minimum transfer time', () => {
    // Leaving at 8:06 the first subway is 8:10 → B 8:25; 2 min transfer → 8:27 ≤ 8:30.
    expect(q(H(8, 6))[1].arriveSec).toBe(H(9));
    // With a 6-minute transfer the 8:30 rail is missed and the next is 9:30 → 10:00,
    // which is later than the direct bus (9:30), so only the bus is Pareto-optimal.
    const js = raptor(w, {
      access: [{ stopId: 'A', sec: 0 }],
      egress: [{ stopId: 'C', sec: 0 }],
      departSec: H(8, 6),
      maxTrips: 3,
      transferSec: (a, b) => (a === b ? 60 : 360),
    });
    expect(js.map((j) => j.arriveSec)).toEqual([H(9, 30)]);
  });

  it('banning a route finds an alternative', () => {
    const js = raptor(w, { access: [{ stopId: 'A', sec: 0 }], egress: [{ stopId: 'C', sec: 0 }], departSec: H(8), maxTrips: 3, bannedRoutes: new Set(['R']) });
    expect(js).toHaveLength(1);
    expect(js[0].rides[0].routeId).toBe('BUS');
  });

  it('earliestArrival re-plans from an intermediate stop', () => {
    expect(earliestArrival(w, 'RB', H(8, 31), [{ stopId: 'C', sec: 0 }])).toBe(H(10));
    // Starting on the subway platform: walk to the rail platform first (2 min).
    expect(earliestArrival(w, 'B', H(8, 27), [{ stopId: 'C', sec: 0 }])).toBe(H(9));
    expect(earliestArrival(w, 'B', H(8, 29), [{ stopId: 'C', sec: 0 }])).toBe(H(10));
    expect(earliestArrival(w, 'C', H(8), [{ stopId: 'C', sec: 0 }])).toBe(H(8));
  });

  it('finds multi-transfer journeys on the demo network', () => {
    const from = places.find((p) => p.id === 'flushing')!;
    const to = places.find((p) => p.id === 'stony-brook')!;
    const js = raptor(demoWorld, { access: from.access, egress: to.access, departSec: H(7, 45), maxTrips: 4 });
    expect(js.length).toBeGreaterThan(0);
    const last = js[js.length - 1];
    expect(last.rides.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < last.rides.length; i++) expect(last.rides[i].dep).toBeGreaterThan(last.rides[i - 1].arr);
  });
});

describe('journey evaluation', () => {
  it('a missed connection re-plans to the next service', () => {
    const w = tinyWorld();
    const j = raptor(w, { access: [{ stopId: 'A', sec: 0 }], egress: [{ stopId: 'C', sec: 0 }], departSec: H(8, 6), maxTrips: 3 })[1];
    const e = evaluateJourney(w, ctx({ accessible: true }), j);
    // Step-free path (elevator ~200 s + queue + 30 s buffer) vs a 5 min window: some misses.
    expect(e.transfers[0].arrivalIfMissedSec).toBe(H(10));
    expect(e.arrival.p90).toBeGreaterThan(e.arrival.p10);
  });
});

describe('planner on the demo network', () => {
  const from = places.find((p) => p.id === 'flushing')!;
  const to = places.find((p) => p.id === 'stony-brook')!;
  const base = ctx({ nowSec: H(7, 40) });

  it('prefers a reliable route over the timetable-fastest risky one', () => {
    const r = plan(demoWorld, base, { from, to, mode: 'depart', timeSec: H(7, 45) });
    expect(r.options.length).toBeGreaterThan(1);
    const rec = r.options[0].rep;
    expect(rec.pAllConnections).toBeGreaterThanOrEqual(RELIABLE_THRESHOLD);
    // The schedule-fastest journey connects on paper but is risky, and is not what we recommend.
    const fastest = r.options.flatMap((o) => [o.rep, ...o.tight]).find((e) => e.journey.key === r.scheduleFastest!.journeyKey)!;
    expect(fastest.journey.key).not.toBe(rec.journey.key);
    expect(fastest.journey.departSec).toBeGreaterThan(rec.journey.departSec);
    expect(fastest.pAllConnections).toBeLessThan(0.6);
    expect(rec.expectedArriveSec).toBeLessThan(fastest.expectedArriveSec);
    expect(r.why.length).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    const a = plan(demoWorld, base, { from, to, mode: 'depart', timeSec: H(7, 45) });
    const b = plan(demoWorld, base, { from, to, mode: 'depart', timeSec: H(7, 45) });
    expect(a.options.map((o) => [o.rep.journey.key, o.rep.pAllConnections])).toEqual(
      b.options.map((o) => [o.rep.journey.key, o.rep.pAllConnections]),
    );
  });

  it('real-time 7 delays push the recommendation away from the 7 via Woodside', () => {
    const tripIds = Object.keys(demoWorld.tt.trips);
    const r = plan(demoWorld, ctx({ nowSec: H(7, 40), realtime: demoRealtime('seven-delays', H(7, 40), tripIds) }), {
      from,
      to,
      mode: 'depart',
      timeSec: H(7, 45),
    });
    const rec = r.options[0].rep;
    const sevenToWoodside = rec.journey.rides.some((x) => x.routeId === '7' && x.toStop === '7-61');
    expect(sevenToWoodside && rec.pAllConnections < 0.85).toBe(false);
  });

  it('event crowding lowers subway transfer estimates near Citi Field', () => {
    const at = { from, to, mode: 'depart' as const, timeSec: H(16, 5) };
    const normal = plan(demoWorld, ctx({ nowSec: H(16) }), at);
    const event = plan(demoWorld, ctx({ nowSec: H(16), events: sampleEvent('afternoon') }), at);
    const woodsideP = (r: typeof normal) =>
      Math.min(
        ...r.options.flatMap((o) => [o.rep, ...o.tight]).flatMap((e) => e.transfers.filter((t) => t.model.fromStop === '7-61' || t.model.fromStop === '7-74').map((t) => t.conn.pSuccess)),
      );
    expect(woodsideP(event)).toBeLessThan(woodsideP(normal));
  });

  it('arrive-by mode keeps a high on-time probability', () => {
    const r = plan(demoWorld, base, { from, to, mode: 'arrive', timeSec: H(10) });
    expect(r.options[0].rep.journey.arriveSec).toBeLessThanOrEqual(H(10));
    expect(r.options[0].rep.pOnTime).toBeGreaterThan(0.8);
  });

  it('step-free mode never uses stairs or escalators', () => {
    const r = plan(demoWorld, ctx({ accessible: true }), { from, to, mode: 'depart', timeSec: H(7, 45) });
    for (const o of r.options)
      for (const t of o.rep.transfers)
        if (t.model.paths) for (const s of t.model.paths.best.path.steps) expect(['stairs', 'escalator']).not.toContain(s.edge.kind);
  });

  it('reports an empty result instead of failing', () => {
    const r = plan(demoWorld, base, { from, to, mode: 'arrive', timeSec: H(5, 10) });
    expect(r.options).toHaveLength(0);
    expect(r.emptyReason).toBeTruthy();
  });
});
