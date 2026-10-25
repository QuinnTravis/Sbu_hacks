import { describe, expect, it, vi } from "vitest";
import {
  createJourneyIntroduction,
  getJourneyContext,
} from "../src/lib/journey-context";
import type { JourneyWeather } from "../src/lib/journey-context";

const now = new Date("2026-10-24T22:15:00.000Z");
const hourlyUrl =
  "https://api.weather.gov/gridpoints/OKX/32,38/forecast/hourly";
const route = {
  routeName: "Long Beach",
  origin: "Jamaica",
  destination: "Long Beach",
  locationName: "Queens",
};

const validWeather: JourneyWeather = {
  forecast: "Mostly Sunny",
  temperature: 68,
  temperatureUnit: "F",
  source: {
    provider: "National Weather Service",
    title: "NWS hourly forecast",
    url: hourlyUrl,
    retrievedAt: now.toISOString(),
    validFrom: "2026-10-24T22:00:00.000Z",
    validUntil: "2026-10-24T23:00:00.000Z",
  },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/geo+json" },
  });
}

function mockNws(
  hourly: unknown = {
    properties: {
      periods: [
        {
          startTime: "2026-10-24T21:00:00Z",
          endTime: "2026-10-24T22:00:00Z",
          shortForecast: "Rain",
          temperature: 65,
          temperatureUnit: "F",
        },
        {
          startTime: "2026-10-24T22:00:00Z",
          endTime: "2026-10-24T23:00:00Z",
          shortForecast: "Mostly Sunny",
          temperature: 68,
          temperatureUnit: "F",
        },
      ],
    },
  },
  forecastHourly: unknown = hourlyUrl,
) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).startsWith("https://api.weather.gov/points/"))
      return json({ properties: { forecastHourly } });
    if (String(url) === hourlyUrl) return json(hourly);
    throw new Error(`Unexpected request: ${String(url)}`);
  });
}

describe("pure journey introduction", () => {
  it("forms a short trip introduction without inventing service or weather", () => {
    const intro = createJourneyIntroduction(route);
    expect(intro.text).toContain("We're exploring the Long Beach route.");
    expect(intro.text).toContain(
      "Your planned trip runs from Jamaica to Long Beach.",
    );
    expect(intro.text).toContain("You're near Queens.");
    expect(intro.text).not.toMatch(
      /forecast|temperature|arriving|visible|schedule/i,
    );
    expect(intro.weatherStatus).toBe("not-requested");
    expect(intro.weather).toBeNull();
    expect(intro.sources).toEqual([]);
  });

  it("stays coherent with no route, trip, or location fields", () => {
    const intro = createJourneyIntroduction({});
    expect(intro.text).toBe(
      "Welcome aboard. As we travel, we'll discover the stories behind places along the way.",
    );
  });

  it("only includes weather when explicitly requested and preserves its attribution", () => {
    const included = createJourneyIntroduction(
      { ...route, includeWeather: true },
      validWeather,
    );
    expect(included.text).toContain(
      "National Weather Service's hourly forecast",
    );
    expect(included.text).toContain(
      "mostly sunny, around 68 degrees Fahrenheit",
    );
    expect(included.text).not.toContain("It's sunny now");
    expect(included.weather).toEqual(validWeather);
    expect(included.sources).toEqual([validWeather.source]);
    expect(included.weatherStatus).toBe("available");

    const omitted = createJourneyIntroduction(route, validWeather);
    expect(omitted.text).not.toContain("forecast");
    expect(omitted.sources).toEqual([]);
    expect(omitted.weatherStatus).toBe("not-requested");
  });

  it("removes markup and sentence breaks from caller-supplied names", () => {
    const intro = createJourneyIntroduction({
      routeName: "Jamaica. <script> Bad!",
      destination: "Montauk?",
    });
    expect(intro.text).toContain("Jamaica script Bad route.");
    expect(intro.text).toContain("Your destination is Montauk.");
    expect(intro.text).not.toContain("<script>");
  });
});

describe("optional NWS journey context", () => {
  it("makes zero requests without weather opt-in", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Unexpected request");
    });
    const intro = await getJourneyContext(
      { ...route, coordinates: { lat: 40.7, lon: -73.81 } },
      { fetcher, now },
    );
    expect(intro.weatherStatus).toBe("not-requested");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses two official API requests, coarse coordinates, a deadline, and the matching hourly period", async () => {
    const fetcher = mockNws();
    const intro = await getJourneyContext(
      {
        ...route,
        coordinates: { lat: 40.69960817, lon: -73.80852987 },
        includeWeather: true,
      },
      { fetcher, now, timeoutMs: 2500 },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://api.weather.gov/points/40.70,-73.81",
      expect.objectContaining({
        redirect: "error",
        cache: "no-store",
        headers: expect.objectContaining({ "User-Agent": expect.any(String) }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      hourlyUrl,
      expect.objectContaining({ redirect: "error" }),
    );
    expect(intro.weatherStatus).toBe("available");
    expect(intro.weather?.temperature).toBe(68);
    expect(intro.weather?.forecast).toBe("Mostly Sunny");
    expect(intro.text).toContain("around 68 degrees Fahrenheit");
    expect(intro.text).not.toContain("rain");
    expect(intro.sources).toEqual([validWeather.source]);
  });

  it("does not contact NWS for invalid coordinates", async () => {
    const fetcher = mockNws();
    const context = await getJourneyContext(
      { ...route, includeWeather: true, coordinates: { lat: NaN, lon: -73.8 } },
      { fetcher, now },
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(context.weatherStatus).toBe("unavailable");
    expect(context.text).not.toContain("weather");
  });

  it("rejects untrusted forecast URLs before a second request", async () => {
    for (const untrusted of [
      "https://example.com/gridpoints/OKX/32,38/forecast/hourly",
      "http://api.weather.gov/gridpoints/OKX/32,38/forecast/hourly",
      "https://api.weather.gov.evil.test/gridpoints/OKX/32,38/forecast/hourly",
      "https://api.weather.gov/redirect?url=https://example.com",
    ]) {
      const fetcher = mockNws(undefined, untrusted);
      const context = await getJourneyContext(
        {
          ...route,
          includeWeather: true,
          coordinates: { lat: 40.7, lon: -73.8 },
        },
        { fetcher, now },
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(context.weatherStatus).toBe("unavailable");
      expect(context.sources).toEqual([]);
    }
  });

  it("discards stale hourly periods instead of presenting them as current", async () => {
    const fetcher = mockNws({
      properties: {
        periods: [
          {
            startTime: "2026-10-24T20:00:00Z",
            endTime: "2026-10-24T21:00:00Z",
            shortForecast: "Rain",
            temperature: 65,
            temperatureUnit: "F",
          },
        ],
      },
    });
    const intro = await getJourneyContext(
      {
        ...route,
        includeWeather: true,
        coordinates: { lat: 40.7, lon: -73.8 },
      },
      { fetcher, now },
    );
    expect(intro.weatherStatus).toBe("unavailable");
    expect(intro.text).not.toContain("Rain");
  });

  it("omits invalid temperatures while keeping a valid sourced forecast", async () => {
    const fetcher = mockNws({
      properties: {
        periods: [
          {
            startTime: "2026-10-24T22:00:00Z",
            endTime: "2026-10-24T23:00:00Z",
            shortForecast: "Cloudy",
            temperature: "very hot",
            temperatureUnit: "F",
          },
        ],
      },
    });
    const intro = await getJourneyContext(
      {
        ...route,
        includeWeather: true,
        coordinates: { lat: 40.7, lon: -73.8 },
      },
      { fetcher, now },
    );
    expect(intro.text).toContain("calls for cloudy.");
    expect(intro.weather?.temperature).toBeNull();
  });

  it("falls back cleanly on NWS errors and invalid payloads", async () => {
    const offline = vi.fn(async () => {
      throw new Error("Network offline");
    });
    const badJson = vi.fn(
      async () => new Response("not JSON", { status: 200 }),
    );
    for (const fetcher of [offline, badJson]) {
      const intro = await getJourneyContext(
        {
          ...route,
          includeWeather: true,
          coordinates: { lat: 40.7, lon: -73.8 },
        },
        { fetcher, now },
      );
      expect(intro.weatherStatus).toBe("unavailable");
      expect(intro.weather).toBeNull();
      expect(intro.sources).toEqual([]);
      expect(intro.text).toContain(
        "Your planned trip runs from Jamaica to Long Beach.",
      );
    }
  });

  it("aborts a hanging upstream request within the configured deadline", async () => {
    const fetcher = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const intro = await getJourneyContext(
      {
        ...route,
        includeWeather: true,
        coordinates: { lat: 40.7, lon: -73.8 },
      },
      { fetcher, now, timeoutMs: 25 },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(intro.weatherStatus).toBe("unavailable");
    expect(intro.sources).toEqual([]);
  });
});
