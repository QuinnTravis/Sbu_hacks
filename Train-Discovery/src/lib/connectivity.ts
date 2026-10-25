import type { ConnectivityZone } from "./package-types";
import type { Place } from "./types";

/**
 * Estimated no-signal stretches (F6). There is no free, authoritative
 * per-route coverage data, so zones come from tunnels (high confidence),
 * deep canyons (medium), and stretches far from any town (low), plus
 * observed gaps on a live ride. Every zone is shown as an estimate.
 */

/** Signal rarely recovers between tunnels this close together. */
const MERGE_GAP_KM = 1.5;
/** Margin around a tunnel: signal fades before the portal and returns after it. */
const PORTAL_MARGIN_KM = 0.3;
/** A canyon without a mapped extent is assumed to span this far either side of its point. */
const CANYON_HALF_KM = 3;
/** Farther than this from any town along the line counts as remote. */
const REMOTE_KM = 14;

export type TunnelStretch = { id: string; name?: string; startKm: number; endKm: number };

function nameNear(places: Place[], startKm: number, endKm: number): string | undefined {
  const mid = (startKm + endKm) / 2;
  const named = places
    .filter((place) => typeof place.routeKm === "number" && place.routeKm >= startKm - 2 && place.routeKm <= endKm + 2)
    .filter((place) => ["canyon", "river", "town", "city", "tunnel", "pass"].includes(place.basic?.type ?? ""))
    .sort((a, b) => Math.abs((a.routeKm ?? 0) - mid) - Math.abs((b.routeKm ?? 0) - mid));
  return named[0]?.name;
}

export function buildZones(tunnels: TunnelStretch[], places: Place[], totalKm: number): ConnectivityZone[] {
  const zones: ConnectivityZone[] = [];
  // Tunnels, merged when portals nearly touch.
  const sorted = [...tunnels].sort((a, b) => a.startKm - b.startKm);
  const groups: { startKm: number; endKm: number; names: string[]; count: number }[] = [];
  for (const tunnel of sorted) {
    const last = groups[groups.length - 1];
    if (last && tunnel.startKm - last.endKm < MERGE_GAP_KM) {
      last.endKm = Math.max(last.endKm, tunnel.endKm);
      last.count += 1;
      if (tunnel.name) last.names.push(tunnel.name);
    } else groups.push({ startKm: tunnel.startKm, endKm: tunnel.endKm, names: tunnel.name ? [tunnel.name] : [], count: 1 });
  }
  const namedTunnel = places.filter((place) => place.basic?.type === "tunnel" && place.extentKm);
  for (const [i, group] of groups.entries()) {
    const long = namedTunnel.find((t) => t.extentKm![0] <= group.endKm && t.extentKm![1] >= group.startKm);
    zones.push({
      id: `tunnel-${i}`,
      startKm: Math.max(0, group.startKm - PORTAL_MARGIN_KM),
      endKm: Math.min(totalKm, group.endKm + PORTAL_MARGIN_KM),
      reason: "tunnel",
      confidence: "high",
      source: "OpenStreetMap railway tunnels",
      poiIds: [],
      name: long?.name ?? nameNear(places, group.startKm, group.endKm),
    });
  }
  // Deep canyons with little roadside infrastructure.
  for (const canyon of places.filter((place) => place.basic?.type === "canyon" && place.kind === "poi")) {
    const startKm = canyon.extentKm ? canyon.extentKm[0] : (canyon.routeKm ?? 0) - CANYON_HALF_KM;
    const endKm = canyon.extentKm ? canyon.extentKm[1] : (canyon.routeKm ?? 0) + CANYON_HALF_KM;
    zones.push({
      id: `canyon-${canyon.id}`,
      startKm: Math.max(0, startKm),
      endKm: Math.min(totalKm, endKm),
      reason: "canyon",
      confidence: canyon.extentKm ? "medium" : "low",
      source: "Canyon on the line (heuristic)",
      poiIds: [],
      name: canyon.name,
    });
  }
  // Remote stretches: far from any town in both directions.
  const towns = places.filter((place) => ["town", "city"].includes(place.basic?.type ?? "") && typeof place.routeKm === "number")
    .map((place) => place.routeKm!).sort((a, b) => a - b);
  let runStart: number | null = null;
  for (let km = 0; km <= totalKm; km += 1) {
    const nearest = towns.reduce((best, town) => Math.min(best, Math.abs(town - km)), Infinity);
    const remote = nearest > REMOTE_KM;
    if (remote && runStart === null) runStart = km;
    if ((!remote || km + 1 > totalKm) && runStart !== null) {
      if (km - runStart >= 4) {
        zones.push({
          id: `remote-${runStart}`,
          startKm: runStart,
          endKm: km,
          reason: "remote",
          confidence: "low",
          source: "Distance from towns (heuristic)",
          poiIds: [],
          name: nameNear(places, runStart, km),
        });
      }
      runStart = null;
    }
  }
  // A stretch covered by a stronger reason keeps only that one.
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const kept = zones
    .sort((a, b) => rank[b.confidence] - rank[a.confidence] || a.startKm - b.startKm)
    .filter((zone, i, all) => !all.slice(0, i).some((other) =>
      other.startKm <= zone.startKm + 0.5 && other.endKm >= zone.endKm - 0.5));
  for (const zone of kept) {
    zone.startKm = +zone.startKm.toFixed(2);
    zone.endKm = +zone.endKm.toFixed(2);
    zone.poiIds = places
      .filter((place) => place.kind === "poi" && typeof place.routeKm === "number" && place.routeKm >= zone.startKm && place.routeKm <= zone.endKm)
      .map((place) => place.id);
  }
  return kept.sort((a, b) => a.startKm - b.startKm);
}

/** The zone the train is in, if any. */
export function zoneAt(zones: ConnectivityZone[], km: number): ConnectivityZone | null {
  return zones.find((zone) => km >= zone.startKm && km <= zone.endKm) ?? null;
}

/** The next zone ahead in the direction of travel, with how far until it starts. */
export function nextZone(
  zones: ConnectivityZone[],
  km: number,
  direction: 1 | -1,
): { zone: ConnectivityZone; kmUntil: number; lengthKm: number } | null {
  let best: { zone: ConnectivityZone; kmUntil: number; lengthKm: number } | null = null;
  for (const zone of zones) {
    const entry = direction === 1 ? zone.startKm : zone.endKm;
    const kmUntil = (entry - km) * direction;
    if (kmUntil <= 0) continue;
    if (!best || kmUntil < best.kmUntil) best = { zone, kmUntil, lengthKm: zone.endKm - zone.startKm };
  }
  return best;
}

/**
 * A gap observed on a live ride: network checks failed while GPS kept working.
 * It joins the zones for the rest of the ride.
 */
export function observedZone(startKm: number, endKm: number): ConnectivityZone {
  return {
    id: `observed-${Math.round(startKm * 10)}`,
    startKm: Math.min(startKm, endKm),
    endKm: Math.max(startKm, endKm, Math.min(startKm, endKm) + 0.2),
    reason: "observed",
    confidence: "high",
    source: "Observed on this ride",
    poiIds: [],
  };
}
