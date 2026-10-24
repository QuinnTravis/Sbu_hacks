// Local-calendar date helpers. All day keys are YYYY-MM-DD in the user's local time.

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key: string, delta: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

/** Whole days from a to b (b - a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

export function lastNDays(n: number, end: string = dateKey()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export function isValidKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return dateKey(parseKey(key)) === key;
}

export function formatLong(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatShort(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekdayLetter(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'narrow' });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(d: Date = new Date()): DayPart {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}
