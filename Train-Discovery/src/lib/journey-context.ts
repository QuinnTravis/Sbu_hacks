/**
 * Journey opening for server callers. `getJourneyContext` may contact NWS;
 * `createJourneyIntroduction` is pure and safe to use with already-fetched data.
 * Neither function predicts service, visibility, or a train's next stop.
 */

export type JourneyContextInput = {
  /** Caller-provided route and trip labels, not live transit assertions. */
  routeName?: string | null;
  origin?: string | null;
  destination?: string | null;
  locationName?: string | null;
  /** Only used for an opt-in weather lookup; never included in narration. */
  coordinates?: { lat: number; lon: number } | null;
  includeWeather?: boolean;
};

export type JourneySource = {
  provider: "National Weather Service";
  title: "NWS hourly forecast";
  url: string;
  retrievedAt: string;
  validFrom: string;
  validUntil: string;
};

export type JourneyWeather = {
  /** Forecast description, never a claim about observed conditions. */
  forecast: string | null;
  temperature: number | null;
  temperatureUnit: "F" | "C" | null;
  source: JourneySource;
};

export type JourneyIntroduction = {
  text: string;
  weather: JourneyWeather | null;
  weatherStatus: "not-requested" | "available" | "unavailable";
  sources: JourneySource[];
};

export type JourneyContextOptions = {
  /** Injectable for deterministic tests; defaults to the server's fetch. */
  fetcher?: typeof fetch;
  now?: Date;
  /** Shared deadline for both NWS requests. Default: 3 seconds. */
  timeoutMs?: number;
};

const NWS_ORIGIN = "https://api.weather.gov";
const NWS_AGENT = "TrainDiscovery/1.0 (LIRR ride weather context)";

function label(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  // A label should remain a name, not become extra spoken sentences or markup.
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f<>.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || null;
}

function weatherLine(weather: JourneyWeather): string | null {
  const forecast = label(weather.forecast)?.toLowerCase() ?? null;
  const temperature =
    weather.temperature !== null &&
    Number.isFinite(weather.temperature) &&
    (weather.temperatureUnit === "F" || weather.temperatureUnit === "C")
      ? `${Math.round(weather.temperature)} degrees ${weather.temperatureUnit === "F" ? "Fahrenheit" : "Celsius"}`
      : null;

  if (!forecast && !temperature) return null;
  const details = [forecast, temperature ? `around ${temperature}` : null]
    .filter(Boolean)
    .join(", ");
  return `The National Weather Service's hourly forecast near your location calls for ${details}.`;
}

/** Pure, short, evidence-bound script. No clocks, requests, or generated facts. */
export function createJourneyIntroduction(
  input: JourneyContextInput,
  weather: JourneyWeather | null = null,
): JourneyIntroduction {
  const route = label(input.routeName);
  const origin = label(input.origin);
  const destination = label(input.destination);
  const location = label(input.locationName);

  const sentences = ["Welcome aboard."];
  if (route) sentences.push(`We're exploring the ${route} route.`);
  if (origin && destination)
    sentences.push(`Your planned trip runs from ${origin} to ${destination}.`);
  else if (origin) sentences.push(`Your starting point is ${origin}.`);
  else if (destination) sentences.push(`Your destination is ${destination}.`);
  if (location) sentences.push(`You're near ${location}.`);

  // The source and valid interval travel with the spoken weather, for attribution.
  const line = weather && input.includeWeather ? weatherLine(weather) : null;
  if (line) sentences.push(line);
  sentences.push(
    "As we travel, we'll discover the stories behind places along the way.",
  );

  const includedWeather = line ? weather : null;
  return {
    text: sentences.join(" "),
    weather: includedWeather,
    weatherStatus: !input.includeWeather
      ? "not-requested"
      : includedWeather
        ? "available"
        : "unavailable",
    sources: includedWeather ? [includedWeather.source] : [],
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function forecastUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    // `forecastHourly` comes from an HTTP response. Pin its host and path to
    // avoid letting a compromised response turn this into an SSRF fetch.
    if (
      url.origin !== NWS_ORIGIN ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/gridpoints\/[a-zA-Z0-9_-]+\/\d+,\d+\/forecast\/hourly$/.test(
        url.pathname,
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

async function fetchForecast(
  coordinates: NonNullable<JourneyContextInput["coordinates"]>,
  fetcher: typeof fetch,
  now: Date,
  timeoutMs: number,
): Promise<JourneyWeather | null> {
  const { lat, lon } = coordinates;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180 ||
    !Number.isFinite(now.getTime())
  )
    return null;

  // Coarse coordinates suffice for NWS's gridded forecast and limit precision shared upstream.
  const pointsUrl = `${NWS_ORIGIN}/points/${lat.toFixed(2)},${lon.toFixed(2)}`;
  const signal = AbortSignal.timeout(
    Math.max(1, Math.min(5000, Number.isFinite(timeoutMs) ? timeoutMs : 3000)),
  );
  const options: RequestInit = {
    signal,
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/geo+json", "User-Agent": NWS_AGENT },
  };

  try {
    const points = await fetcher(pointsUrl, options);
    if (!points.ok) return null;
    const url = forecastUrl(
      record(record(await points.json())?.properties)?.forecastHourly,
    );
    if (!url) return null;

    const response = await fetcher(url, options);
    if (!response.ok) return null;
    const periods = record(await response.json())?.properties;
    const entries = record(periods)?.periods;
    if (!Array.isArray(entries)) return null;

    const timestamp = now.getTime();
    for (const entry of entries) {
      const period = record(entry);
      if (
        !period ||
        typeof period.startTime !== "string" ||
        typeof period.endTime !== "string"
      )
        continue;
      const start = Date.parse(period.startTime);
      const end = Date.parse(period.endTime);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        timestamp < start ||
        timestamp >= end
      )
        continue;

      const forecast = label(
        typeof period.shortForecast === "string" ? period.shortForecast : null,
      );
      const temperatureUnit =
        period.temperatureUnit === "F" || period.temperatureUnit === "C"
          ? period.temperatureUnit
          : null;
      const temperature =
        typeof period.temperature === "number" &&
        Number.isFinite(period.temperature) &&
        temperatureUnit
          ? period.temperature
          : null;
      if (!forecast && temperature === null) return null;

      return {
        forecast,
        temperature,
        temperatureUnit,
        source: {
          provider: "National Weather Service",
          title: "NWS hourly forecast",
          url,
          retrievedAt: now.toISOString(),
          validFrom: new Date(start).toISOString(),
          validUntil: new Date(end).toISOString(),
        },
      };
    }
  } catch {
    // NWS outages, invalid JSON, aborted requests, and offline rides all use a
    // weather-free introduction. We intentionally do not log request details.
  }
  return null;
}

/** Server entry point. No network calls unless weather is explicitly enabled. */
export async function getJourneyContext(
  input: JourneyContextInput,
  options: JourneyContextOptions = {},
): Promise<JourneyIntroduction> {
  if (typeof window !== "undefined")
    throw new Error("getJourneyContext must run on the server");
  if (!input.includeWeather || !input.coordinates)
    return createJourneyIntroduction(input);

  const weather = await fetchForecast(
    input.coordinates,
    options.fetcher ?? fetch,
    options.now ?? new Date(),
    options.timeoutMs ?? 3000,
  );
  return createJourneyIntroduction(input, weather);
}
