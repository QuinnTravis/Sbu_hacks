// Minimal GTFS static loader: turns stops.txt, routes.txt, trips.txt,
// stop_times.txt and (optionally) transfers.txt into a TransitFlow Timetable.
// This is the path for replacing the synthetic demo network with MTA feeds
// (gtfs_subway.zip, gtfslirr.zip). Calendars are not applied here: pass the
// trip ids active on the service day you want.

import type { Mode, Pattern, Route, ScheduledTransfer, Stop, Timetable, Trip } from './types';

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().replace(/^﻿/, ''));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** GTFS times may exceed 24:00:00 for after-midnight service. */
export function parseGtfsTime(s: string): number {
  const [h, m, sec] = s.split(':').map(Number);
  return h * 3600 + m * 60 + (sec || 0);
}

const MODE_BY_ROUTE_TYPE: Record<string, Mode> = { '1': 'subway', '2': 'rail', '3': 'bus' };

export interface GtfsFiles {
  stops: string;
  routes: string;
  trips: string;
  stopTimes: string;
  transfers?: string;
}

export function loadGtfs(files: GtfsFiles, opts: { id: string; label: string; activeTripIds?: Set<string> }): Timetable {
  const stops: Record<string, Stop> = {};
  for (const r of parseCsv(files.stops)) {
    stops[r.stop_id] = {
      id: r.stop_id,
      name: r.stop_name,
      mode: 'subway',
      lat: Number(r.stop_lat),
      lon: Number(r.stop_lon),
      stationId: r.parent_station || undefined,
    };
  }
  const routes: Record<string, Route> = {};
  for (const r of parseCsv(files.routes)) {
    const mode = MODE_BY_ROUTE_TYPE[r.route_type] ?? 'bus';
    routes[r.route_id] = {
      id: r.route_id,
      shortName: r.route_short_name || r.route_id,
      longName: r.route_long_name || r.route_short_name,
      mode,
      agency: r.agency_id ?? '',
      color: r.route_color ? `#${r.route_color}` : '#555555',
      textColor: r.route_text_color ? `#${r.route_text_color}` : '#ffffff',
      boardBufferSec: mode === 'rail' ? 30 : mode === 'bus' ? 15 : 10,
      delayModelId: mode,
    };
  }
  const trips: Record<string, Trip> = {};
  for (const r of parseCsv(files.trips)) {
    if (opts.activeTripIds && !opts.activeTripIds.has(r.trip_id)) continue;
    trips[r.trip_id] = {
      id: r.trip_id,
      routeId: r.route_id,
      patternId: '',
      directionId: r.direction_id === '1' ? 1 : 0,
      headsign: r.trip_headsign ?? '',
      service: r.service_id ?? '',
      stopTimes: [],
    };
  }
  const seq = new Map<string, { s: number; stopId: string; arr: number; dep: number }[]>();
  for (const r of parseCsv(files.stopTimes)) {
    if (!trips[r.trip_id]) continue;
    if (!seq.has(r.trip_id)) seq.set(r.trip_id, []);
    const arr = parseGtfsTime(r.arrival_time || r.departure_time);
    const dep = parseGtfsTime(r.departure_time || r.arrival_time);
    seq.get(r.trip_id)!.push({ s: Number(r.stop_sequence), stopId: r.stop_id, arr, dep });
  }
  const patternsByKey = new Map<string, Pattern>();
  for (const [tripId, list] of seq) {
    list.sort((a, b) => a.s - b.s);
    const trip = trips[tripId];
    trip.stopTimes = list.map(({ stopId, arr, dep }) => ({ stopId, arr, dep }));
    for (const st of trip.stopTimes) if (stops[st.stopId]) stops[st.stopId].mode = routes[trip.routeId]?.mode ?? 'subway';
    const key = `${trip.routeId}|${trip.directionId}|${trip.stopTimes.map((x) => x.stopId).join(',')}`;
    let p = patternsByKey.get(key);
    if (!p) {
      p = {
        id: `P${patternsByKey.size}`,
        routeId: trip.routeId,
        directionId: trip.directionId,
        service: trip.service,
        stops: trip.stopTimes.map((x) => x.stopId),
        tripIds: [],
      };
      patternsByKey.set(key, p);
    }
    trip.patternId = p.id;
    p.tripIds.push(tripId);
  }
  for (const id of Object.keys(trips)) if (!trips[id].stopTimes.length) delete trips[id];
  const transfers: ScheduledTransfer[] = files.transfers
    ? parseCsv(files.transfers).map((r) => ({
        from: r.from_stop_id,
        to: r.to_stop_id,
        minTransferSec: Number(r.min_transfer_time || 180),
      }))
    : [];
  return {
    id: opts.id,
    label: opts.label,
    provenance: 'published',
    stops,
    routes,
    trips,
    patterns: [...patternsByKey.values()],
    transfers,
  };
}
