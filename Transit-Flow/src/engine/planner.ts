// Journey planner: candidate generation (range RAPTOR + route elimination for
// diversity), probabilistic evaluation, grouping of near-identical journeys,
// and an explainable ranking.

import { evaluateJourney, type JourneyEval } from './evaluate';
import { sameStopChangeSec, type World } from './network';
import { raptor, type Journey } from './raptor';
import { findPath } from './station';
import { outagesFrom } from './network';
import { scheduledMinTransfer } from './transfer';
import type { ConnectionResult } from './transfer';
import type { ModelContext } from './types';

export interface Place {
  id: string;
  name: string;
  area: string;
  access: { stopId: string; sec: number }[];
  aliases?: string[];
}

export interface PlanQuery {
  from: Place;
  to: Place;
  mode: 'depart' | 'arrive';
  timeSec: number;
}

export interface RouteOption {
  id: string;
  /** The journey we recommend for this route (latest departure that is still reliable). */
  rep: JourneyEval;
  /** Later departures on the same onward trains that connect only on paper. */
  tight: JourneyEval[];
  costMin: number;
  costBreakdown: { label: string; min: number }[];
  tags: string[];
}

export interface PlanResult {
  query: PlanQuery;
  options: RouteOption[];
  /** Candidate with the earliest scheduled arrival (what a timetable-only planner shows first). */
  scheduleFastest: { optionId: string; journeyKey: string } | null;
  why: string[];
  stats: { raptorRuns: number; candidates: number; evaluated: number };
  emptyReason?: string;
}

/** Share of samples making every connection for a variant to count as reliable. */
export const RELIABLE_THRESHOLD = 0.85;
/** Planning penalty per transfer, in minutes. */
export const TRANSFER_PENALTY_MIN = 3;
const WALK_PENALTY_PER_MIN = 0.5;
const FREE_WALK_MIN = 6;

/** Transfer times RAPTOR should use. Accessible mode uses step-free paths only. */
export function transferFunction(world: World, ctx: ModelContext) {
  if (!ctx.accessible) return undefined;
  const cache = new Map<string, number | null>();
  const outages = outagesFrom(ctx);
  return (from: string, to: string): number | null => {
    const key = `${from}>${to}`;
    if (cache.has(key)) return cache.get(key)!;
    const sched = from === to ? sameStopChangeSec(world, from) : scheduledMinTransfer(world, from, to);
    let result: number | null = sched;
    const stationId = world.tt.stops[from]?.stationId;
    const g = stationId ? world.graphs[stationId] : undefined;
    if (g && sched !== null) {
      const ins = g.bindings.filter((b) => b.stopId === from);
      const outs = g.bindings.filter((b) => b.stopId === to);
      if (ins.length && outs.length) {
        let best = Infinity;
        for (const a of ins)
          for (const b of outs) {
            if (a === b) continue;
            const p = findPath(g, a.nodes, b.nodes, { accessible: true, outages, crowd: 1 });
            if (p) best = Math.min(best, p.expectedSec);
          }
        result = best === Infinity ? null : Math.max(sched, Math.round(best));
      }
    }
    cache.set(key, result);
    return result;
  };
}

function candidateDepartures(world: World, q: PlanQuery, lo: number, hi: number): number[] {
  const times = new Set<number>([lo]);
  for (const a of q.from.access) {
    for (const { pattern, index } of world.idx.patternsByStop.get(a.stopId) ?? []) {
      for (const trip of world.idx.patternTrips.get(pattern.id) ?? []) {
        const t = trip.stopTimes[index].dep - a.sec;
        if (t >= lo && t <= hi) times.add(t);
      }
    }
  }
  return [...times].sort((x, y) => x - y);
}

/**
 * Journeys that use the same lines through the same transfer points and end
 * on the same final train are variants of one route: they differ only in
 * which earlier train you catch.
 */
function groupKey(j: Journey): string {
  const legs = j.rides.map((r) => `${r.routeId}:${r.fromStop}>${r.toStop}`);
  return [j.accessStop, ...legs, j.rides[j.rides.length - 1].tripId].join('|');
}

export function plan(world: World, ctx: ModelContext, q: PlanQuery): PlanResult {
  const transferSec = transferFunction(world, ctx);
  const egress = q.to.access;
  const lo = q.mode === 'depart' ? q.timeSec : q.timeSec - 3 * 3600;
  const hi = q.mode === 'depart' ? q.timeSec + 75 * 60 : q.timeSec;
  const deps = candidateDepartures(world, q, lo, hi);
  const found = new Map<string, Journey>();
  let runs = 0;

  const sweep = (banned: Set<string>) => {
    for (const d of deps) {
      runs++;
      for (const j of raptor(world, { access: q.from.access, egress, departSec: d, maxTrips: 4, bannedRoutes: banned, transferSec })) {
        if (!found.has(j.key)) found.set(j.key, j);
      }
    }
  };
  sweep(new Set());
  const routesUsed = new Set<string>();
  for (const j of found.values()) for (const r of j.rides) routesUsed.add(r.routeId);
  for (const r of routesUsed) sweep(new Set([r]));

  let candidates = [...found.values()].filter((j) => j.departSec >= lo - 60);
  if (q.mode === 'arrive') candidates = candidates.filter((j) => j.arriveSec <= q.timeSec);
  if (!candidates.length) {
    return {
      query: q,
      options: [],
      scheduleFastest: null,
      why: [],
      stats: { raptorRuns: runs, candidates: 0, evaluated: 0 },
      emptyReason:
        q.mode === 'arrive'
          ? 'No scheduled service reaches the destination by that time in the demo timetable.'
          : ctx.accessible
            ? 'No step-free journey found in the next 75 minutes with the current station models.'
            : 'No scheduled service found in the next 75 minutes in the demo timetable.',
    };
  }
  const earliest = Math.min(...candidates.map((j) => j.arriveSec));
  if (q.mode === 'depart') candidates = candidates.filter((j) => j.arriveSec <= earliest + 100 * 60);
  candidates.sort((a, b) => a.arriveSec - b.arriveSec || b.departSec - a.departSec);
  candidates = candidates.slice(0, 40);

  const cache = new Map<string, ConnectionResult>();
  const recoveryCache = new Map<string, number | null>();
  const evals = candidates.map((j) =>
    evaluateJourney(world, ctx, j, {
      samples: 700,
      deadlineSec: q.mode === 'arrive' ? q.timeSec : undefined,
      cache,
      recoveryCache,
      transferSec,
    }),
  );

  const groups = new Map<string, JourneyEval[]>();
  for (const e of evals) {
    if (!e.feasible) continue;
    const k = groupKey(e.journey);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }

  let options: RouteOption[] = [];
  for (const [k, members] of groups) {
    members.sort((a, b) => a.journey.departSec - b.journey.departSec);
    const reliable = members.filter((m) => m.pAllConnections >= RELIABLE_THRESHOLD);
    const rep = reliable.length
      ? reliable[reliable.length - 1]
      : members.reduce((a, b) => (b.pAllConnections >= a.pAllConnections ? b : a));
    const tight = members.filter((m) => m.journey.departSec > rep.journey.departSec);
    const { cost, breakdown } = costOf(rep, q);
    options.push({ id: k, rep, tight, costMin: cost, costBreakdown: breakdown, tags: [] });
  }

  options = removeDominated(options);
  options.sort((a, b) => a.costMin - b.costMin || b.rep.journey.departSec - a.rep.journey.departSec);
  options = options.slice(0, 5);

  // Fastest on paper across everything we evaluated, including tight variants.
  let scheduleFastest: PlanResult['scheduleFastest'] = null;
  let bestPaper: JourneyEval | null = null;
  for (const o of options)
    for (const e of [o.rep, ...o.tight])
      if (
        !bestPaper ||
        e.journey.arriveSec < bestPaper.journey.arriveSec ||
        (e.journey.arriveSec === bestPaper.journey.arriveSec && e.journey.departSec > bestPaper.journey.departSec)
      ) {
        bestPaper = e;
        scheduleFastest = { optionId: o.id, journeyKey: e.journey.key };
      }

  tag(options);
  return {
    query: q,
    options,
    scheduleFastest,
    why: explain(options, bestPaper, q),
    stats: { raptorRuns: runs, candidates: found.size, evaluated: evals.length },
  };
}

function costOf(e: JourneyEval, q: PlanQuery): { cost: number; breakdown: { label: string; min: number }[] } {
  const transfers = e.journey.rides.length - 1;
  const walkMin = e.walkingSec / 60;
  const walkPenalty = Math.max(0, walkMin - FREE_WALK_MIN) * WALK_PENALTY_PER_MIN;
  if (q.mode === 'depart') {
    const travel = (e.expectedArriveSec - q.timeSec) / 60;
    return {
      cost: travel + transfers * TRANSFER_PENALTY_MIN + walkPenalty,
      breakdown: [
        { label: 'Expected time to arrival (includes missed-connection risk)', min: travel },
        { label: `Transfers (${transfers} × ${TRANSFER_PENALTY_MIN} min)`, min: transfers * TRANSFER_PENALTY_MIN },
        { label: `Walking beyond ${FREE_WALK_MIN} min`, min: walkPenalty },
      ],
    };
  }
  // Arrive-by: leave as late as possible while keeping a high chance of being on time.
  const early = (q.timeSec - e.journey.departSec) / 60;
  const riskPenalty = Math.max(0, 0.9 - e.pOnTime) * 300;
  return {
    cost: early + transfers * TRANSFER_PENALTY_MIN + walkPenalty + riskPenalty,
    breakdown: [
      { label: 'Minutes before the deadline you must leave', min: early },
      { label: `Transfers (${transfers} × ${TRANSFER_PENALTY_MIN} min)`, min: transfers * TRANSFER_PENALTY_MIN },
      { label: `Walking beyond ${FREE_WALK_MIN} min`, min: walkPenalty },
      { label: 'Risk of arriving late (below 90% on-time)', min: riskPenalty },
    ],
  };
}

function removeDominated(options: RouteOption[]): RouteOption[] {
  const dominates = (b: RouteOption, a: RouteOption) => {
    const A = a.rep;
    const B = b.rep;
    const ta = A.journey.rides.length;
    const tb = B.journey.rides.length;
    const notWorse =
      B.journey.departSec >= A.journey.departSec &&
      B.expectedArriveSec <= A.expectedArriveSec &&
      B.pAllConnections >= A.pAllConnections - 0.01 &&
      tb <= ta &&
      B.walkingSec <= A.walkingSec + 60;
    const better =
      B.journey.departSec > A.journey.departSec + 60 ||
      B.expectedArriveSec < A.expectedArriveSec - 60 ||
      B.pAllConnections > A.pAllConnections + 0.03 ||
      tb < ta;
    return notWorse && better;
  };
  return options.filter((a) => !options.some((b) => b !== a && dominates(b, a)));
}

function tag(options: RouteOption[]) {
  if (!options.length) return;
  options[0].tags.push('Recommended');
  const mostReliable = options.reduce((a, b) => (b.rep.pAllConnections > a.rep.pAllConnections + 0.005 ? b : a));
  if (mostReliable !== options[0] && mostReliable.rep.journey.rides.length > 1) mostReliable.tags.push('Most reliable');
  const minT = Math.min(...options.map((o) => o.rep.journey.rides.length));
  const fewest = options.filter((o) => o.rep.journey.rides.length === minT);
  if (fewest.length === 1 && fewest[0] !== options[0]) fewest[0].tags.push('Fewest transfers');
}

export function fmtClock(sec: number): string {
  const s = Math.round(sec);
  let h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export function fmtMin(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function fmtRange(a: number, b: number): string {
  if (b < 90) {
    const l = Math.round(a / 10) * 10;
    const h = Math.max(l, Math.round(b / 10) * 10);
    return l === h ? `about ${l} s` : `${l}–${h} s`;
  }
  const lo = Math.round(a / 60);
  const hi = Math.max(lo, Math.round(b / 60));
  return lo === hi ? `about ${lo} min` : `${lo}–${hi} min`;
}

function explain(options: RouteOption[], paper: JourneyEval | null, q: PlanQuery): string[] {
  const out: string[] = [];
  const rec = options[0];
  if (!rec) return out;
  const r = rec.rep;
  if (q.mode === 'depart') {
    out.push(
      `Lowest planning cost: expected arrival ${fmtClock(r.expectedArriveSec)}, ${Math.round(r.pAllConnections * 100)}% of simulated trips make every connection (model estimate, synthetic inputs).`,
    );
  } else {
    out.push(
      `Leaves at ${fmtClock(r.journey.departSec)} with a ${Math.round(r.pOnTime * 100)}% modelled chance of arriving by ${fmtClock(q.timeSec)}.`,
    );
  }
  if (paper && paper !== r) {
    const weak = paper.transfers.reduce<null | (typeof paper.transfers)[number]>(
      (w, t) => (!w || t.conn.pSuccess < w.conn.pSuccess ? t : w),
      null,
    );
    const parts = [
      `The earliest arrival on paper leaves at ${fmtClock(paper.journey.departSec)} and is scheduled to arrive ${fmtClock(paper.journey.arriveSec)}.`,
    ];
    if (weak && weak.conn.pSuccess < RELIABLE_THRESHOLD) {
      parts.push(
        `Its ${weak.model.stationName} connection has a ${fmtMin(weak.conn.windowSec)} window but the station model puts the walk at ${fmtRange(weak.conn.physical.p10, weak.conn.physical.p90)}; about ${Math.round((1 - weak.conn.pSuccess) * 10)} in 10 riders would miss it` +
          (weak.arrivalIfMissedSec ? `, arriving ${fmtClock(weak.arrivalIfMissedSec)} instead.` : '.'),
      );
    }
    out.push(parts.join(' '));
  }
  if (rec.tight.length) {
    const t = rec.tight[rec.tight.length - 1];
    out.push(
      `Leaving later, at ${fmtClock(t.journey.departSec)}, reaches the same onward trains on paper, but only ${Math.round(t.pAllConnections * 100)}% of simulated trips make every connection.`,
    );
  }
  return out;
}
