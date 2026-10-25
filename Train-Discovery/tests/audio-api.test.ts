import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createJourneyIntroduction } from "../src/lib/journey-context";
import type { AudioScript } from "../src/lib/audio-journey";

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase", () => ({ database: vi.fn() }));
vi.mock("../src/lib/verification", () => ({ verifyPlace: vi.fn() }));
vi.mock("../src/lib/journey-context", async (original) => ({
  ...(await original<typeof import("../src/lib/journey-context")>()),
  getJourneyContext: vi.fn(),
}));

import { POST } from "../src/app/api/audio/route";
import { database } from "../src/lib/supabase";
import { getJourneyContext } from "../src/lib/journey-context";

const weather = {
  forecast: "Cloudy",
  temperature: 64,
  temperatureUnit: "F" as const,
  source: {
    provider: "National Weather Service" as const,
    title: "NWS hourly forecast" as const,
    url: "https://api.weather.gov/gridpoints/OKX/32,38/forecast/hourly",
    retrievedAt: new Date().toISOString(),
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
  },
};

type Job = { script: AudioScript; storage_path: string };
let jobs: Map<string, Job>;
let active: Set<string>;
let synthesize: ReturnType<typeof vi.fn>;

function request(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/audio", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voice-a");
  jobs = new Map();
  active = new Set();
  synthesize = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  vi.stubGlobal("fetch", synthesize);
  vi.mocked(getJourneyContext).mockReset();
  vi.mocked(getJourneyContext).mockImplementation(async (input) => createJourneyIntroduction(input, weather));
  vi.mocked(database).mockReturnValue({
    from: () => ({
      select: () => ({ eq: (_column: string, id: string) => ({
        maybeSingle: async () => ({ data: jobs.get(id) ?? null, error: null }),
        single: async () => ({
          data: active.has(id) ? { token: "leased", lease_until: new Date(Date.now() + 30_000).toISOString() } : null,
          error: null,
        }),
      }) }),
    }),
    rpc: async (method: string, data: { p_key: string; p_script?: AudioScript | null; p_path?: string | null }) => {
      if (method === "claim_audio_job") {
        if (jobs.has(data.p_key) || active.has(data.p_key)) return { data: null, error: null };
        active.add(data.p_key);
        return { data: "leased", error: null };
      }
      active.delete(data.p_key);
      if (data.p_script && data.p_path) jobs.set(data.p_key, { script: data.p_script, storage_path: data.p_path });
      return { data: true, error: null };
    },
    storage: { from: () => ({
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://audio.test/${path}` }, error: null }),
      upload: async () => ({ error: null }),
    }) },
  } as unknown as ReturnType<typeof database>);
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("journey audio API validation", () => {
  it("rejects unknown routes, omitted or coerced simulation, incomplete coordinates and extra fields", async () => {
    const valid = { type: "journey", routeId: "10", simulation: false };
    const bad = [
      { ...valid, routeId: "100" },
      { ...valid, routeId: "__proto__" },
      { type: "journey", routeId: "10" },
      { ...valid, simulation: "false" },
      { ...valid, lat: 40.7 },
      { ...valid, lon: -73.8 },
      { ...valid, lat: 90.01, lon: -73.8 },
      { ...valid, lat: 40.7, lon: -180.01 },
      { ...valid, lat: null, lon: -73.8 },
      { ...valid, lat: "40.7", lon: -73.8 },
      { ...valid, arbitrary: "text" },
    ];
    for (const payload of bad) {
      const response = await POST(request(payload));
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(getJourneyContext).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("preserves origin validation", async () => {
    const response = await POST(request({ type: "journey", routeId: "10", simulation: false },
      { origin: "https://attacker.example" }));
    expect(response.status).toBe(403);
  });

  it("narrates simulated routes using MTA data and never requests weather", async () => {
    const result = await POST(request({ type: "journey", routeId: "10", simulation: true, lat: 40.7, lon: -73.8 }));
    expect(result.status).toBe(200);
    const { script } = await result.json();
    expect(script.text).toMatch(/simulated ride/i);
    expect(script.text).toContain("Port Jefferson Branch");
    expect(script.text).not.toContain("forecast");
    expect(script.sources[0].title).toMatch(/MTA/);
    expect(getJourneyContext).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(script.text.length).toBeLessThan(1200);
  });

  it("gives the live ride sourced weather once, including during 202 polls and a second voice", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(getJourneyContext).mockImplementationOnce(async (input) => {
      await gate;
      return createJourneyIntroduction(input, weather);
    });
    const payload = { type: "journey", routeId: "10", simulation: false, lat: 40.69961, lon: -73.80853 };
    const first = POST(request(payload));
    // The first caller has claimed the job, then awaits the only forecast request.
    await vi.waitFor(() => expect(getJourneyContext).toHaveBeenCalledTimes(1));
    const pending = await POST(request(payload));
    expect(pending.status).toBe(202);
    expect(pending.headers.get("retry-after")).toBe("2");
    expect(getJourneyContext).toHaveBeenCalledTimes(1);

    release();
    const done = await first;
    expect(done.status).toBe(200);
    const { script } = await done.json();
    expect(script.text).toContain("National Weather Service's hourly forecast");
    expect(script.text).toContain("Port Jefferson Branch");
    expect(script.sources.map((source: { url: string }) => source.url))
      .toContain(weather.source.url);
    expect(script.text.length).toBeLessThan(1200);
    expect((await POST(request(payload))).status).toBe(200);
    expect(getJourneyContext).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(1);

    // The MP3 cache key changes with the voice, while the in-memory weather window remains reusable.
    vi.stubEnv("ELEVENLABS_VOICE_ID", "voice-b");
    const second = await POST(request({ ...payload, lat: 40.701, lon: -73.807 }));
    expect(second.status).toBe(200);
    expect(getJourneyContext).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it("keeps cached introductions tied to their official route even in one weather area", async () => {
    const coordinates = { lat: 40.55, lon: -73.95 };
    const jefferson = await POST(request({ type: "journey", routeId: "10", simulation: false, ...coordinates }));
    const hempstead = await POST(request({ type: "journey", routeId: "2", simulation: false, ...coordinates }));
    expect(jefferson.status).toBe(200);
    expect(hempstead.status).toBe(200);
    expect((await jefferson.json()).script.text).toContain("Port Jefferson Branch");
    const { script } = await hempstead.json();
    expect(script.text).toContain("Hempstead Branch");
    expect(script.text).not.toContain("Port Jefferson Branch");
    expect(getJourneyContext).toHaveBeenCalledTimes(2);
  });

  it("keeps station audio and live rides without coordinates weather-free", async () => {
    const station = await POST(request({ type: "station", routeId: "10", stationId: "102" }));
    expect(station.status).toBe(200);
    expect((await station.json()).script.text).toBe("Station approaching: Jamaica.");
    const journey = await POST(request({ type: "journey", routeId: "10", simulation: false }));
    expect(journey.status).toBe(200);
    expect((await journey.json()).script.text).not.toContain("forecast");
    expect(getJourneyContext).not.toHaveBeenCalled();
  });
});
