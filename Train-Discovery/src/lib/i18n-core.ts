import { DEFAULT_LOCALE, LOCALES, type LocaleInfo, type Messages } from "@/locales";

/**
 * Pure translation helpers shared by the client provider and server code
 * (narration templates). Missing keys fall back to English.
 */

export type Vars = Record<string, string | number>;

export function localeInfo(code: string | null | undefined): LocaleInfo {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES.find((l) => l.code === DEFAULT_LOCALE)!;
}

/** Best supported locale for a BCP 47 tag such as navigator.language. */
export function matchLocale(tag: string | null | undefined): string {
  if (!tag) return DEFAULT_LOCALE;
  const lower = tag.toLowerCase();
  const exact = LOCALES.find((locale) => locale.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const language = lower.split("-")[0];
  return LOCALES.find((locale) => locale.code.toLowerCase().split("-")[0] === language)?.code ?? DEFAULT_LOCALE;
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

const reported = new Set<string>();
function reportMissing(code: string, key: string) {
  if (process.env.NODE_ENV === "production") return;
  const id = `${code}:${key}`;
  if (reported.has(id)) return;
  reported.add(id);
  console.warn(`[i18n] Missing "${key}" for ${code}; using English.`);
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

export function translate(code: string, key: string, vars?: Vars): string {
  const locale = localeInfo(code);
  const own = lookup(locale.messages, key);
  if (own !== undefined) return interpolate(own, vars);
  if (locale.code !== DEFAULT_LOCALE) reportMissing(locale.code, key);
  const fallback = lookup(localeInfo(DEFAULT_LOCALE).messages, key);
  if (fallback !== undefined) return interpolate(fallback, vars);
  reportMissing(DEFAULT_LOCALE, key);
  return key;
}

export function hasMessage(code: string, key: string): boolean {
  return lookup(localeInfo(code).messages, key) !== undefined;
}

/** Plural form via CLDR rules: `key.one`, `key.other`, … with `key.other` as the fallback. */
export function translatePlural(code: string, key: string, count: number, vars?: Vars): string {
  const locale = localeInfo(code);
  const rule = new Intl.PluralRules(locale.code).select(count);
  const all = { count: formatNumber(code, count), ...vars };
  if (hasMessage(code, `${key}.${rule}`)) return translate(code, `${key}.${rule}`, all);
  return translate(code, `${key}.other`, all);
}

export function formatNumber(code: string, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeInfo(code).code, options).format(value);
}

/** Matches the original English output: "930 m", "1.2 km". */
export function formatDistance(code: string, meters: number): string {
  const tag = localeInfo(code).code;
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) {
    return new Intl.NumberFormat(tag, { style: "unit", unit: "meter", unitDisplay: "short" })
      .format(Math.round(meters / 10) * 10);
  }
  return new Intl.NumberFormat(tag, {
    style: "unit", unit: "kilometer", unitDisplay: "short",
    minimumFractionDigits: meters < 100_000 ? 1 : 0, maximumFractionDigits: meters < 100_000 ? 1 : 0,
  }).format(meters / 1000);
}

/** "2 min", "1 h 20 min". */
export function formatDuration(code: string, seconds: number): string {
  const tag = localeInfo(code).code;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(tag, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${unit(hours, "hour")} ${unit(rest, "minute")}` : unit(hours, "hour");
}

export function formatClock(code: string, date: Date): string {
  return new Intl.DateTimeFormat(localeInfo(code).code, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatList(code: string, items: string[]): string {
  return new Intl.ListFormat(localeInfo(code).code, { style: "long", type: "conjunction" }).format(items);
}
