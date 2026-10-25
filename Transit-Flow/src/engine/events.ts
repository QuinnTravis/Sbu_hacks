// Auto-detects crowd-generating events around the network for today, so the
// rider never has to say "there's a game on". Three sources, merged:
//  - AI: Gemini with Google Search, via /api/events (events-server.ts), for
//    games, concerts and festivals at the venues in venues.ts;
//  - the public MLB Stats API for games at Citi Field (no key needed);
//  - the US Open's usual dates, as an estimate.

import type { EventWindow } from './types';
import { VENUES, type DetectedEvent, type DetectorResponse, type EventSize } from './venues';

const CITI_FIELD_VENUE_ID = 3289;
const TZ = 'America/New_York';
const SIZE_SCALE: Record<EventSize, number> = { small: 0.3, medium: 0.6, large: 1 };

/** YYYY-MM-DD for `d` in New York. */
export function nyDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Seconds since New York midnight for `d`. */
export function nySecOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return n('hour') * 3600 + n('minute') * 60;
}

function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const hhmmSec = (s: string) => Number(s.slice(0, 2)) * 3600 + Number(s.slice(3, 5)) * 60;
const venue = (id: string) => VENUES.find((v) => v.id === id)!;
const scaled = (impact: Record<string, number>, k: number) =>
  Object.fromEntries(Object.entries(impact).map(([key, v]) => [key, 1 + (v - 1) * k]));

/** Turns a detected event into the crowding window the model consumes. */
export function toWindow(e: DetectedEvent, id: string, provenance: EventWindow['provenance']): EventWindow {
  const v = venue(e.venueId);
  const startSec = hhmmSec(e.start);
  let endSec = e.end ? hhmmSec(e.end) : startSec + v.typicalHours * 3600;
  if (endSec <= startSec) endSec = Math.min(startSec + v.typicalHours * 3600, 26 * 3600);
  const k = SIZE_SCALE[e.size];
  return {
    id,
    label: `${e.title}, ${v.name.split(' (')[0]}, ${clock(startSec)}`,
    venue: v.name,
    startSec,
    endSec,
    stationImpact: scaled(v.stations, k),
    routeDelayImpact: scaled(v.routes, k),
    provenance,
  };
}

interface MlbSchedule {
  dates?: { games?: { gamePk: number; gameDate: string; status?: { detailedState?: string }; teams?: { away?: { team?: { name?: string } } } }[] }[];
}

export async function detectCitiFieldGames(date: string, fetchFn: typeof fetch = fetch): Promise<EventWindow[]> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&venueIds=${CITI_FIELD_VENUE_ID}&date=${date}`;
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MLB schedule responded ${res.status}`);
  const body = (await res.json()) as MlbSchedule;
  return (body.dates ?? [])
    .flatMap((d) => d.games ?? [])
    .filter((g) => !/postponed|cancelled/i.test(g.status?.detailedState ?? ''))
    .map((g) => {
      const s = nySecOfDay(new Date(g.gameDate));
      const start = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String((s % 3600) / 60).padStart(2, '0')}`;
      const away = g.teams?.away?.team?.name ?? 'visitors';
      return toWindow({ title: `${away} at Mets`, venueId: 'citi-field', start, size: 'large' }, `mlb-${g.gamePk}`, 'published');
    });
}

/** US Open main draw: roughly the 15 days starting the last Sunday of August. */
export function usOpenWindow(date: string): EventWindow[] {
  const [y, m, d] = date.split('-').map(Number);
  const aug31 = new Date(Date.UTC(y, 7, 31));
  const start = Date.UTC(y, 7, 31 - aug31.getUTCDay());
  const day = (Date.UTC(y, m - 1, d) - start) / 86400000;
  if (day < 0 || day > 14) return [];
  const w = toWindow({ title: 'US Open tennis (dates estimated)', venueId: 'usta', start: '11:00', end: '23:00', size: 'large' }, `usopen-${date}`, 'model');
  return [{ ...w, label: 'US Open tennis at Flushing Meadows (dates estimated)' }];
}

export async function detectWithAi(date: string, fetchFn: typeof fetch = fetch): Promise<EventWindow[]> {
  const base = (import.meta.env?.VITE_EVENTS_URL as string | undefined) ?? '/api/events';
  const res = await fetchFn(`${base}?date=${date}`, { headers: { Accept: 'application/json' } });
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('AI event detection is not running');
  const body = (await res.json()) as DetectorResponse;
  if (body.error) throw new Error(body.error);
  return body.events.map((e, i) => toWindow(e, `ai-${date}-${i}`, 'model'));
}

export interface Detection {
  events: EventWindow[];
  /** Sources that answered, e.g. "AI search", "MLB schedule". */
  sources: string[];
  /** Sources that failed, with the reason. */
  failed: string[];
}

const near = (a: EventWindow, b: EventWindow) => a.venue === b.venue && Math.abs(a.startSec - b.startSec) <= 3600;

export async function detectEvents(now: Date = new Date(), fetchFn: typeof fetch = fetch): Promise<Detection> {
  const date = nyDate(now);
  const [ai, mlb] = await Promise.allSettled([detectWithAi(date, fetchFn), detectCitiFieldGames(date, fetchFn)]);
  const sources: string[] = [];
  const failed: string[] = [];
  // The MLB feed is authoritative for its games; AI fills in everything else.
  const events: EventWindow[] = [];
  if (mlb.status === 'fulfilled') { sources.push('MLB schedule'); events.push(...mlb.value); } else failed.push(`MLB schedule: ${(mlb.reason as Error).message}`);
  if (ai.status === 'fulfilled') {
    sources.push('AI search');
    events.push(...ai.value.filter((e) => !events.some((m) => near(m, e))));
  } else failed.push(`AI search: ${(ai.reason as Error).message}`);
  if (!events.some((e) => e.venue === venue('usta').name)) events.push(...usOpenWindow(date));
  if (!sources.length) throw new Error(failed.join('; '));
  return { events: events.sort((a, b) => a.startSec - b.startSec), sources, failed };
}
