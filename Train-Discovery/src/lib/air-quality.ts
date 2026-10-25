import { pointAtKm, type RouteIndex } from "./route-geometry";
import type { AirQualitySnapshot, AirQualityZone, AqiCategory } from "./package-types";

/** US EPA AQI breakpoints. */
export function aqiCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "usg";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "veryUnhealthy";
  return "hazardous";
}

/** Alerts start at "Unhealthy for sensitive groups". */
export const ALERT_AQI = 101;

export const ZONE_KM = 25;

export const OPEN_METEO_ATTRIBUTION = [
  { label: "Open-Meteo", url: "https://open-meteo.com/" },
  { label: "CAMS / Copernicus Atmosphere Monitoring Service", url: "https://atmosphere.copernicus.eu/" },
];

export type ZoneSpan = { id: string; startKm: number; endKm: number; lat: number; lon: number };

/** Split a ride into ~25 km zones, each sampled at its midpoint. */
export function zoneSpans(index: RouteIndex, zoneKm = ZONE_KM): ZoneSpan[] {
  const count = Math.max(1, Math.round(index.totalKm / zoneKm));
  const width = index.totalKm / count;
  return Array.from({ length: count }, (_, i) => {
    const startKm = i * width;
    const endKm = (i + 1) * width;
    const mid = pointAtKm(index, (startKm + endKm) / 2)!;
    return { id: `aq-${i}`, startKm: +startKm.toFixed(2), endKm: +endKm.toFixed(2), lat: +mid.lat.toFixed(4), lon: +mid.lon.toFixed(4) };
  });
}

type OpenMeteoCurrent = {
  time?: string;
  us_aqi?: number;
  us_aqi_pm2_5?: number;
  us_aqi_pm10?: number;
  us_aqi_ozone?: number;
};

/** One request for every zone midpoint. Open-Meteo needs no key; results are cached by callers. */
export async function fetchAirQuality(spans: ZoneSpan[], fetcher: typeof fetch = fetch): Promise<AirQualitySnapshot> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${new URLSearchParams({
    latitude: spans.map((s) => s.lat).join(","),
    longitude: spans.map((s) => s.lon).join(","),
    current: "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone",
    timezone: "UTC",
  })}`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Gaze/0.1 (rail ride companion)" } });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  const json = await response.json();
  const rows: { current?: OpenMeteoCurrent }[] = Array.isArray(json) ? json : [json];
  const fetchedAt = new Date().toISOString();
  const zones: AirQualityZone[] = spans.flatMap((span, i) => {
    const current = rows[i]?.current;
    if (!current || typeof current.us_aqi !== "number" || !Number.isFinite(current.us_aqi)) return [];
    const parts: [string, number | undefined][] = [["pm2_5", current.us_aqi_pm2_5], ["pm10", current.us_aqi_pm10], ["ozone", current.us_aqi_ozone]];
    const dominant = parts.filter((p): p is [string, number] => typeof p[1] === "number").sort((a, b) => b[1] - a[1])[0]?.[0];
    return [{
      id: span.id,
      startKm: span.startKm,
      endKm: span.endKm,
      aqi: Math.round(current.us_aqi),
      category: aqiCategory(current.us_aqi),
      ...(dominant ? { dominantPollutant: dominant } : {}),
      // Open-Meteo reports UTC times without seconds or a zone, e.g. 2026-10-25T06:00.
      fetchedAt: current.time ? `${current.time}:00Z` : fetchedAt,
      source: "Open-Meteo Air Quality (CAMS)",
    }];
  });
  return { zones, fetchedAt, source: "Open-Meteo Air Quality API", attribution: OPEN_METEO_ATTRIBUTION };
}

/**
 * Developer scenario (?scenario=smoke): a clearly simulated smoky stretch
 * ahead of the train so the alert can be shown on any day.
 */
export function smokeScenario(zones: AirQualityZone[], km: number, direction: 1 | -1, totalKm: number): AirQualityZone[] {
  const start = Math.max(0, Math.min(totalKm, km + direction * 20));
  const end = Math.max(0, Math.min(totalKm, start + direction * 25));
  const smoke: AirQualityZone = {
    id: "aq-simulated-smoke",
    startKm: Math.min(start, end),
    endKm: Math.max(start, end),
    aqi: 132,
    category: aqiCategory(132),
    dominantPollutant: "pm2_5",
    fetchedAt: new Date().toISOString(),
    source: "Simulated scenario",
    simulated: true,
  };
  return [...zones.filter((zone) => zone.endKm <= smoke.startKm || zone.startKm >= smoke.endKm), smoke]
    .sort((a, b) => a.startKm - b.startKm);
}

/** The worst zone ahead within `withinKm`, if it reaches the alert level. */
export function airAlert(zones: AirQualityZone[], km: number, direction: 1 | -1, withinKm = 80): AirQualityZone | null {
  const ahead = zones.filter((zone) => {
    const entry = direction === 1 ? zone.startKm : zone.endKm;
    const distance = (entry - km) * direction;
    const inside = km >= zone.startKm && km <= zone.endKm;
    return zone.aqi >= ALERT_AQI && (inside || (distance > 0 && distance <= withinKm));
  });
  return ahead.sort((a, b) => b.aqi - a.aqi)[0] ?? null;
}

/** The zone the train is in now. */
export function zoneAt(zones: AirQualityZone[], km: number): AirQualityZone | null {
  return zones.find((zone) => km >= zone.startKm && km <= zone.endKm) ?? null;
}
