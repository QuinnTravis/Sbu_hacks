import { test, expect } from "@playwright/test";
import rail from "../../public/data/lirr.json";

const jamaica = rail.routes.flatMap((route) => route.stops).find((stop) => stop.name === "Jamaica")!;
const kew = rail.routes.flatMap((route) => route.stops).find((stop) => stop.name === "Kew Gardens")!;

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: jamaica.lat, longitude: jamaica.lon, accuracy: 5 });
  await page.route("**/api/journeys/10", (route) => route.fulfill({ json: { places: [] } }));
  await page.addInitScript(() => {
    const clips: string[] = [];
    Object.assign(window, { __clips: clips });
    class FakeAudio {
      src = "";
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      setAttribute() {}
      removeAttribute() { this.src = ""; }
      load() {}
      pause() {}
      play() {
        if (this.src.includes("test-clip")) clips.push(this.src);
        this.onplay?.();
        Object.assign(window, { __finishClip: () => this.onended?.() });
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "Audio", { configurable: true, value: FakeAudio });
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", { configurable: true, value: async () => "granted" });
  });
});

test("station encounters use ElevenLabs playback, do not repeat, and react to the next station", async ({ page, context }) => {
  const requested: string[] = [];
  await page.route("**/api/audio", async (route) => {
    const input = route.request().postDataJSON();
    requested.push(input.stationId);
    const name = input.stationId === jamaica.id ? "Jamaica" : "Kew Gardens";
    await route.fulfill({ json: { audioUrl: `https://example.org/test-clip-${input.stationId}.mp3`, provider: "elevenlabs",
      script: { name, text: `Station approaching: ${name}.`, kind: "announcement", sources: [] } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect.poll(() => requested).toEqual([jamaica.id]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __clips: string[] }).__clips.length)).toBe(1);
  await page.getByText("Transcript & sources").click();
  await expect(page.getByText("Station approaching: Jamaica.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause audio guide" }).click();
  await expect(page.locator(".audio-title")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume audio guide" }).click();
  await page.evaluate(() => (window as unknown as { __finishClip: () => void }).__finishClip());
  await context.setGeolocation({ latitude: jamaica.lat + 0.0001, longitude: jamaica.lon, accuracy: 5 });
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  expect(requested).toEqual([jamaica.id]);
  await context.setGeolocation({ latitude: kew.lat, longitude: kew.lon, accuracy: 5 });
  await expect.poll(() => requested, { timeout: 10000 }).toEqual([jamaica.id, kew.id]);
  await expect(page.locator(".audio-title")).toHaveText("Kew Gardens");
  await page.getByRole("button", { name: "Turn off audio guide" }).click();
  await expect(page.getByRole("button", { name: "Start audio tour" })).toBeVisible();
});

test("skipping a preparation ignores a late provider response", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route("**/api/audio", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { audioUrl: "https://example.org/test-clip-late.mp3",
      script: { name: "Jamaica", text: "Station approaching: Jamaica.", kind: "announcement", sources: [] } } }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect(page.locator(".audio-title")).toHaveText("Preparing Jamaica");
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("button", { name: "Skip story" }).click();
  release!();
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __clips: string[] }).__clips)).toEqual([]);
});

test("pointing at a POI queues its story after the current station without overlap", async ({ page }) => {
  const landmark = { id: "osm-node-1234", name: "Window landmark", lat: jamaica.lat + 0.003, lon: jamaica.lon,
    category: "Landmark", routeIds: ["10"], tags: {}, evidence: [], sourceUrl: "https://www.openstreetmap.org/node/1234" };
  await page.route("**/api/journeys/10", (route) => route.fulfill({ json: { places: [landmark] } }));
  const requested: string[] = [];
  const evidence = { id: "archive", title: "Landmark archive", url: "https://example.org/history",
    text: "The landmark was built in 1901.", retrievedAt: "2026-10-24", license: "CC BY-SA 4.0" };
  const story = { summary: evidence.text, claims: [{ text: evidence.text, quote: evidence.text, evidenceId: evidence.id }],
    verifiedAt: "2026-10-24", evidenceHash: "fixture", generator: "fixture", verifier: "fixture" };
  await page.route("**/api/audio", async (route) => {
    const input = route.request().postDataJSON();
    requested.push(input.type);
    if (input.type === "place") expect(input.context).toBe("pointed");
    const name = input.type === "station" ? "Jamaica" : landmark.name;
    await route.fulfill({ json: { audioUrl: `https://example.org/test-clip-${input.type}.mp3`,
      script: { name, text: input.type === "place" ? `You just pointed at ${name}. ${evidence.text}` : `Station approaching: ${name}.`, kind: input.type === "place" ? "verified" : "announcement", sources: [],
        ...(input.type === "place" ? { story, evidence: [evidence] } : {}) } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect(page.locator(".audio-title")).toHaveText("Jamaica");
  await page.evaluate(() => {
    const emit = () => {
      const event = new Event("deviceorientationabsolute");
      Object.defineProperties(event, { alpha: { value: 0 }, beta: { value: 90 }, gamma: { value: 0 }, absolute: { value: true } });
      window.dispatchEvent(event);
    };
    emit(); const timer = setInterval(emit, 100); setTimeout(() => clearInterval(timer), 2200);
  });
  await expect(page.getByRole("heading", { name: landmark.name })).toBeVisible({ timeout: 10000 });
  expect(requested).toEqual(["station"]);
  await page.evaluate(() => (window as unknown as { __finishClip: () => void }).__finishClip());
  await expect.poll(() => requested, { timeout: 10000 }).toEqual(["station", "place"]);
  await expect(page.locator(".audio-title")).toHaveText(landmark.name);
  await expect(page.locator(".story-facts")).toContainText(evidence.text);
  await page.getByRole("button", { name: `Discard ${landmark.name}` }).click();
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
});

test("a POI without a sourced fact stays queued and never plays a name-only clip", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const place = { id: "osm-node-1234", name: "Window landmark", lat: 40.7026, lon: -73.8085,
      category: "Landmark", routeIds: ["10"], tags: {}, evidence: [], sourceUrl: "https://www.openstreetmap.org/node/1234" };
    localStorage.setItem("train-discovery:ride:v1", JSON.stringify({ routeId: "10", startedAt: now, replay: false,
      queue: [{ place, foundAt: now, distance: 300 }], dismissed: [] }));
    Object.assign(window, { __nativeCount: 0 });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speak() { (window as unknown as { __nativeCount: number }).__nativeCount++; },
      cancel() {}, resume() {}, pause() {},
    } });
  });
  await page.route("**/api/audio", (route) => route.fulfill({ status: 422, json: { error: "story_unavailable" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect(page.getByText("No sourced story is available for Window landmark yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Window landmark" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __clips: string[] }).__clips)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __nativeCount: number }).__nativeCount)).toBe(0);
});
