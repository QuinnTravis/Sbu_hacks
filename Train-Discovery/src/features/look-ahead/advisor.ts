import { kmAhead, sideOf, type Direction, type Facing } from "@/lib/route-geometry";
import type { Place } from "@/lib/types";
import { entryKm, highlightScore, isHighlight } from "./cues";

/** Window-side advice for a leg of the ride. Pure. */

export type SidePick = { place: Place; score: number; km: number; minutesIn: number | null };
export type SideTally = { count: number; score: number; top: SidePick[] };
export type SideAdvice = {
  left: SideTally;
  right: SideTally;
  better: "left" | "right" | "even";
};

/** Minutes into the ride by the timetable, interpolated between stops. */
export type Timetable = { km: number; minutes: number }[];

export function minutesAt(timetable: Timetable, km: number): number | null {
  if (timetable.length < 2) return null;
  const sorted = [...timetable].sort((a, b) => a.km - b.km);
  if (km <= sorted[0].km) return sorted[0].minutes;
  for (let i = 1; i < sorted.length; i++) {
    if (km <= sorted[i].km) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const t = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
      return a.minutes + (b.minutes - a.minutes) * t;
    }
  }
  return sorted[sorted.length - 1].minutes;
}

const empty = (): SideTally => ({ count: 0, score: 0, top: [] });

export function sideAdvice(
  places: Place[],
  leg: { fromKm: number; toKm: number; direction: Direction; facing: Facing },
  bookmarked: ReadonlySet<string> = new Set(),
  timetable: Timetable = [],
  topN = 3,
): SideAdvice {
  const left = empty();
  const right = empty();
  const startMinutes = minutesAt(timetable, leg.fromKm);
  const length = kmAhead(leg.toKm, leg.fromKm, leg.direction);
  for (const place of places) {
    if (!isHighlight(place, bookmarked.has(place.id))) continue;
    const km = entryKm(place, leg.direction);
    if (km === null) continue;
    const ahead = kmAhead(km, leg.fromKm, leg.direction);
    if (ahead < 0 || ahead > length) continue;
    const side = sideOf(place, leg.direction, leg.facing);
    // "Ahead" and "both sides" are visible either way; they do not favor a side.
    if (side !== "left" && side !== "right") continue;
    const tally = side === "left" ? left : right;
    const score = highlightScore(place, bookmarked.has(place.id));
    const at = minutesAt(timetable, km);
    tally.count += 1;
    tally.score += score;
    tally.top.push({
      place,
      score,
      km,
      minutesIn: at !== null && startMinutes !== null ? Math.abs(at - startMinutes) : null,
    });
  }
  for (const tally of [left, right]) {
    tally.top.sort((a, b) => b.score - a.score);
    tally.top = tally.top.slice(0, topN).sort((a, b) => kmAhead(a.km, leg.fromKm, leg.direction) - kmAhead(b.km, leg.fromKm, leg.direction));
  }
  const margin = Math.max(left.score, right.score) * 0.15;
  const better = Math.abs(left.score - right.score) <= margin ? "even" : left.score > right.score ? "left" : "right";
  return { left, right, better };
}

export type BalanceBin = { fromKm: number; toKm: number; left: number; right: number; better: "left" | "right" | "even" };

/** Which side is better, stretch by stretch, for the progress track. */
export function sideBalance(
  places: Place[],
  span: { fromKm: number; toKm: number; facing: Facing; direction: Direction },
  bins = 12,
  bookmarked: ReadonlySet<string> = new Set(),
): BalanceBin[] {
  const lo = Math.min(span.fromKm, span.toKm);
  const hi = Math.max(span.fromKm, span.toKm);
  const width = (hi - lo) / bins || 1;
  const out: BalanceBin[] = Array.from({ length: bins }, (_, i) => ({
    fromKm: lo + i * width, toKm: lo + (i + 1) * width, left: 0, right: 0, better: "even" as const,
  }));
  for (const place of places) {
    if (!isHighlight(place, bookmarked.has(place.id))) continue;
    const km = entryKm(place, span.direction);
    if (km === null || km < lo || km > hi) continue;
    const side = sideOf(place, span.direction, span.facing);
    if (side !== "left" && side !== "right") continue;
    const bin = out[Math.min(bins - 1, Math.floor((km - lo) / width))];
    bin[side] += highlightScore(place, bookmarked.has(place.id));
  }
  for (const bin of out) {
    const margin = Math.max(bin.left, bin.right) * 0.15;
    bin.better = bin.left === 0 && bin.right === 0 ? "even"
      : Math.abs(bin.left - bin.right) <= margin ? "even" : bin.left > bin.right ? "left" : "right";
  }
  return out;
}
