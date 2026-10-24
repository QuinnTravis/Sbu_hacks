// Event model: how a scheduled event changes crowding and service delay.
// Shapes are deliberately simple and documented; they are assumptions, not
// measurements.

import type { EventWindow, Trip, Timetable } from './types';

/**
 * Relative intensity (0..1) of event-related crowding at time t.
 * Arrivals build over the two hours before the start; egress peaks shortly
 * after the end and decays over ~75 minutes.
 */
export function eventShape(ev: EventWindow, t: number): number {
  const { startSec: s, endSec: e } = ev;
  if (t >= s - 7200 && t < s - 900) return 0.6 * ((t - (s - 7200)) / (7200 - 900));
  if (t >= s - 900 && t < s) return 0.6;
  if (t >= s && t < e) return 0.1;
  if (t >= e && t < e + 900) return 0.4 + 0.6 * ((t - e) / 900);
  if (t >= e + 900 && t < e + 5400) return 1 - (t - (e + 900)) / 4500;
  return 0;
}

/** Crowd multiplier at a station: 1 = normal conditions. */
export function crowdAt(stationId: string | undefined, t: number, events: EventWindow[]): number {
  if (!stationId) return 1;
  let c = 1;
  for (const ev of events) {
    const peak = ev.stationImpact[stationId];
    if (peak === undefined) continue;
    c = Math.max(c, 1 + (peak - 1) * eventShape(ev, t));
  }
  return c;
}

/** Multiplier applied to a trip's mean lateness because of event crowding. */
export function eventDelayScale(trip: Trip, tt: Timetable, events: EventWindow[]): number {
  let scale = 1;
  for (const ev of events) {
    const impact = ev.routeDelayImpact[trip.routeId];
    if (impact === undefined) continue;
    for (const st of trip.stopTimes) {
      const stationId = tt.stops[st.stopId]?.stationId;
      if (!stationId || ev.stationImpact[stationId] === undefined) continue;
      scale = Math.max(scale, 1 + (impact - 1) * eventShape(ev, st.dep));
    }
  }
  return scale;
}
