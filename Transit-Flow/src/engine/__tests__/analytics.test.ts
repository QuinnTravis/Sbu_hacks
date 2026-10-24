import { describe, expect, it } from 'vitest';
import { compare, enumerateCohorts, simulate, totals } from '../analytics';
import { demoWorld } from '../../data/world';
import { demandFlows, hourProfile, onboardLoad, sampleEvent } from '../../data/models';
import { loadGtfs, parseCsv, parseGtfsTime } from '../gtfs';
import { parseProxyPayload } from '../realtime';

const flows = demandFlows.filter((f) => f.id === 'wds-7-lirr' || f.id === 'hun-el-dsl');
const base = { days: 60, seed: 11, events: [], onboardLoad };

describe('operations analysis', () => {
  const cohorts = enumerateCohorts(demoWorld, flows, hourProfile);

  it('enumerates scheduled connections that satisfy the published minimum', () => {
    expect(cohorts.length).toBeGreaterThan(50);
    for (const c of cohorts) expect(c.windowSec).toBeGreaterThanOrEqual(c.schedMinSec);
  });

  it('flags the 4-minute Woodside connections as phantom connections', () => {
    const r = simulate(demoWorld, cohorts, { ...base, intervention: { kind: 'none' } });
    const tight = r.cohorts.filter((s) => s.cohort.flow.id === 'wds-7-lirr' && s.cohort.windowSec === 240);
    expect(tight.length).toBeGreaterThan(5);
    expect(tight.every((s) => s.phantom)).toBe(true);
  });

  it('is reproducible', () => {
    const a = simulate(demoWorld, cohorts, { ...base, intervention: { kind: 'none' } });
    const b = simulate(demoWorld, cohorts, { ...base, intervention: { kind: 'none' } });
    expect(totals(a.cohorts)).toEqual(totals(b.cohorts));
  });

  it('event days miss more connections', () => {
    const n = totals(simulate(demoWorld, cohorts, { ...base, intervention: { kind: 'none' } }).cohorts);
    const e = totals(simulate(demoWorld, cohorts, { ...base, events: sampleEvent('afternoon'), intervention: { kind: 'none' } }).cohorts);
    expect(e.missedPaxPerDay).toBeGreaterThan(n.missedPaxPerDay);
  });

  it('a 90 s hold raises success at Woodside, costs onboard riders, and can affect Huntington', () => {
    const c = compare(demoWorld, flows, hourProfile, base, { kind: 'hold', stopId: 'L-WDS', routeId: 'LIRR-PJ', directionId: 1, maxHoldSec: 90 });
    const wds = (t: typeof c.before) => t.cohorts.filter((s) => s.cohort.flow.id === 'wds-7-lirr' && s.cohort.windowSec === 240);
    const pb = wds(c.before).reduce((s, x) => s + x.pSuccess, 0);
    const pa = wds(c.after).reduce((s, x) => s + x.pSuccess, 0);
    expect(pa).toBeGreaterThan(pb);
    expect(c.after.holdPaxMinPerDay).toBeGreaterThan(0);
    const hunB = totals(c.before.cohorts, (s) => s.cohort.flow.id === 'hun-el-dsl');
    const hunA = totals(c.after.cohorts, (s) => s.cohort.flow.id === 'hun-el-dsl');
    expect(hunA.madePaxPerDay).toBeLessThanOrEqual(hunB.madePaxPerDay);
  });

  it('a timetable shift is applied to the copy, not the shared world', () => {
    const before = demoWorld.tt.trips['PJ-EL-W-0806'].stopTimes[1].dep;
    compare(demoWorld, flows, hourProfile, base, { kind: 'shift', tripId: 'PJ-EL-W-0806', shiftSec: 180 });
    expect(demoWorld.tt.trips['PJ-EL-W-0806'].stopTimes[1].dep).toBe(before);
  });
});

describe('data adapters', () => {
  it('parses quoted CSV and GTFS times past midnight', () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([{ a: 'x, y', b: '2' }]);
    expect(parseGtfsTime('25:10:05')).toBe(25 * 3600 + 605);
  });

  it('loads a minimal GTFS feed into patterns', () => {
    const tt = loadGtfs(
      {
        stops: 'stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,40,-73\nB,Beta,40.1,-73.1\n',
        routes: 'route_id,route_short_name,route_long_name,route_type\nR1,1,One,1\n',
        trips: 'route_id,service_id,trip_id,direction_id\nR1,WKD,T1,0\nR1,WKD,T2,0\n',
        stopTimes:
          'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,A,1\nT1,08:10:00,08:10:00,B,2\nT2,08:05:00,08:05:00,A,1\nT2,08:15:00,08:15:00,B,2\n',
      },
      { id: 't', label: 't' },
    );
    expect(tt.patterns).toHaveLength(1);
    expect(tt.patterns[0].tripIds.sort()).toEqual(['T1', 'T2']);
    expect(tt.trips.T1.stopTimes[1].arr).toBe(8 * 3600 + 600);
  });

  it('rejects malformed real-time payloads', () => {
    expect(() => parseProxyPayload({} as never)).toThrow();
    const s = parseProxyPayload({ feedTimestamp: 1761300000, tripUpdates: [{ tripId: 'x', delaySec: 60 }, { tripId: 'y', delaySec: NaN }], alerts: [] });
    expect(s.tripUpdates).toHaveLength(1);
  });
});
