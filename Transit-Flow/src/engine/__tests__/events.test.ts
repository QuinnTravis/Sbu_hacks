import { describe, expect, it } from 'vitest';
import { detectEvents, usOpenWindow } from '../events';
import { parseDetectorText } from '../../../events-server';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const fakeFetch = (mlb: unknown, ai: unknown) =>
  (async (url: string) => (String(url).startsWith('/api/events') ? json(ai) : json(mlb))) as unknown as typeof fetch;
const game = (gameDate: string, detailedState = 'Scheduled') =>
  ({ dates: [{ games: [{ gamePk: 1, gameDate, status: { detailedState }, teams: { away: { team: { name: 'Marlins' } } } }] }] });

describe('event detection', () => {
  it('turns a Citi Field game into an event window in New York time', async () => {
    const d = await detectEvents(new Date('2026-04-07T15:00:00Z'), fakeFetch(game('2026-04-07T20:10:00Z'), { events: [] }));
    expect(d.events).toHaveLength(1);
    expect(d.events[0].startSec).toBe(16 * 3600 + 10 * 60);
    expect(d.events[0].endSec).toBe(19 * 3600 + 10 * 60);
    expect(d.events[0].label).toContain('4:10 PM');
    expect(d.sources).toEqual(['MLB schedule', 'AI search']);
  });

  it('adds AI-found concerts and drops AI duplicates of MLB games', async () => {
    const ai = { events: [
      { title: 'Marlins at Mets', venueId: 'citi-field', start: '16:10', end: null, size: 'large' },
      { title: 'Summer concert', venueId: 'forest-hills-stadium', start: '19:30', end: '23:00', size: 'medium' },
    ] };
    const d = await detectEvents(new Date('2026-04-07T15:00:00Z'), fakeFetch(game('2026-04-07T20:10:00Z'), ai));
    expect(d.events.map((e) => e.provenance)).toEqual(['published', 'model']);
    const concert = d.events[1];
    expect(concert.endSec).toBe(23 * 3600);
    // Medium events get 60% of the venue's full-size impact.
    expect(concert.stationImpact['E-FH']).toBeCloseTo(1 + 1.2 * 0.6);
  });

  it('still works when the AI detector is down, and skips postponed games', async () => {
    const d = await detectEvents(new Date('2026-04-08T15:00:00Z'), fakeFetch(game('2026-04-08T23:10:00Z', 'Postponed'), { events: [], error: 'GEMINI_API_KEY not set' }));
    expect(d.events).toEqual([]);
    expect(d.sources).toEqual(['MLB schedule']);
    expect(d.failed[0]).toContain('GEMINI_API_KEY');
  });

  it('estimates the US Open window from the last Sunday of August', () => {
    expect(usOpenWindow('2026-08-30')).toHaveLength(1);
    expect(usOpenWindow('2026-09-13')).toHaveLength(1);
    expect(usOpenWindow('2026-08-29')).toEqual([]);
    expect(usOpenWindow('2026-09-14')).toEqual([]);
  });

  it('keeps only well-formed AI events at known venues', () => {
    const text = '```json\n{"events":[{"title":"Knicks vs. Celtics","venueId":"msg","start":"19:30","size":"large","sourceUrl":"https://example.com"},{"title":"x","venueId":"barclays","start":"19:00","size":"large"},{"title":"y","venueId":"usta","start":"7pm","size":"large"}]}\n```';
    expect(parseDetectorText(text)).toEqual([{ title: 'Knicks vs. Celtics', venueId: 'msg', start: '19:30', end: null, size: 'large', sourceUrl: 'https://example.com' }]);
  });
});
