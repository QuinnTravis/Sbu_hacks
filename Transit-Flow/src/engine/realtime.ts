// Real-time data adapters.
//
// The app runs fully offline on the demo provider. The MTA adapter is a thin
// client for a small proxy you run yourself: MTA GTFS-Realtime feeds are
// protobuf and are not meant to be fetched directly from a browser, so the
// proxy decodes them and returns the JSON shape below. See README.

import type { RealtimeSnapshot } from './types';

export interface RealtimeProvider {
  id: string;
  label: string;
  /** Returns null when the provider is not configured or the fetch fails. */
  fetch(): Promise<RealtimeSnapshot | null>;
}

export type ProviderState =
  | { kind: 'not-configured' }
  | { kind: 'ok'; snapshot: RealtimeSnapshot }
  | { kind: 'error'; message: string };

/**
 * Expected proxy response:
 * {
 *   "feedTimestamp": 1761300000,            // POSIX seconds
 *   "tripUpdates": [{ "tripId": "...", "delaySec": 120 }],
 *   "alerts": [{ "id": "...", "header": "...", "description": "...", "routeIds": ["7"] }]
 * }
 */
export interface ProxyPayload {
  feedTimestamp: number;
  tripUpdates: { tripId: string; delaySec: number }[];
  alerts: { id: string; header: string; description: string; routeIds?: string[] }[];
}

/** Convert POSIX seconds to service-day seconds in America/New_York. */
export function toServiceDaySec(posix: number): number {
  const d = new Date(posix * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
}

export function parseProxyPayload(p: ProxyPayload): RealtimeSnapshot {
  if (typeof p?.feedTimestamp !== 'number' || !Array.isArray(p.tripUpdates)) {
    throw new Error('Unexpected real-time payload shape');
  }
  return {
    source: 'mta-gtfs-rt',
    feedTimestampSec: toServiceDaySec(p.feedTimestamp),
    tripUpdates: p.tripUpdates.filter((u) => typeof u.tripId === 'string' && Number.isFinite(u.delaySec)),
    alerts: (p.alerts ?? []).map((a) => ({ id: a.id, header: a.header, description: a.description, routeIds: a.routeIds })),
  };
}

export function mtaProxyProvider(url: string | undefined): RealtimeProvider {
  return {
    id: 'mta-proxy',
    label: 'MTA GTFS-Realtime (via proxy)',
    async fetch() {
      if (!url) return null;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Feed proxy responded ${res.status}`);
      return parseProxyPayload((await res.json()) as ProxyPayload);
    },
  };
}
