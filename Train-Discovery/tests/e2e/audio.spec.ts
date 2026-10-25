import { test, expect, type Page } from "@playwright/test";
import rail from "../../public/data/lirr.json";

const jamaica = rail.routes.flatMap((route) => route.stops).find((stop) => stop.name === "Jamaica")!;
const kew = rail.routes.flatMap((route) => route.stops).find((stop) => stop.name === "Kew Gardens")!;

type AudioRequest = {
  type: "journey" | "station" | "place";
  routeId?: string;
  stationId?: string;
  placeId?: string;
  simulation?: boolean;
  context?: string;
};

function announcement(input: AudioRequest) {
  const journey = input.type === "journey";
  const name = journey ? "Welcome aboard" : input.stationId === jamaica.id ? "Jamaica" : "Kew Gardens";
  return {
    audioUrl: `https://example.org/test-clip-${journey ? "journey" : `station-${input.stationId}`}.mp3`,
    provider: "elevenlabs",
    script: {
      name,
      text: journey
        ? `Welcome aboard. ${input.simulation ? "This is a simulated ride. " : ""}The world outside has stories.`
        : `Station approaching: ${name}.`,
      kind: "announcement",
      sources: [],
    },
  };
}

function clips(page: Page) {
  return page.evaluate(() => (window as unknown as { __clips: string[] }).__clips);
}

async function finishClip(page: Page) {
  await page.evaluate(() => (window as unknown as { __finishClip: () => void }).__finishClip());
}

async function startLiveRide(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: jamaica.lat, longitude: jamaica.lon, accuracy: 5 });
  await page.route("**/api/journeys/10", (route) => route.fulfill({ json: { places: [] } }));
  await page.addInitScript(() => {
    const played: string[] = [];
    Object.assign(window, { __clips: played });
    class FakeAudio {
      private url = "";
      private newClip = false;
      get src() { return this.url; }
      set src(value: string) { this.url = value; this.newClip = true; }
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      setAttribute() {}
      removeAttribute() { this.src = ""; }
      load() {}
      pause() {}
      play() {
        if (this.newClip && this.src.includes("test-clip")) played.push(this.src);
        this.newClip = false;
        this.onplay?.();
        Object.assign(window, { __finishClip: () => this.onended?.() });
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "Audio", { configurable: true, value: FakeAudio });
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", { configurable: true, value: async () => "granted" });
  });
});

test("the once-per-ride journey introduction finishes before station narration, including after restart", async ({ page, context }) => {
  const requested: AudioRequest[] = [];
  await page.route("**/api/audio", (route) => {
    const input = route.request().postDataJSON() as AudioRequest;
    requested.push(input);
    return route.fulfill({ json: announcement(input) });
  });

  await startLiveRide(page);
  await expect.poll(() => requested[0]?.type).toBe("journey");
  expect(requested[0]).toMatchObject({ type: "journey", routeId: "10", simulation: false });
  await expect.poll(() => clips(page)).toEqual(["https://example.org/test-clip-journey.mp3"]);
  await page.getByText("Transcript & sources").click();
  await expect(page.getByText("Welcome aboard. The world outside has stories.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause audio guide" }).click();
  await expect(page.locator(".audio-title")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume audio guide" }).click();
  expect(await clips(page)).toEqual(["https://example.org/test-clip-journey.mp3"]);

  await finishClip(page);
  await expect.poll(() => requested.some((input) => input.type === "station" && input.stationId === jamaica.id)).toBe(true);
  await expect.poll(() => clips(page)).toEqual([
    "https://example.org/test-clip-journey.mp3",
    `https://example.org/test-clip-station-${jamaica.id}.mp3`,
  ]);
  await expect(page.locator(".audio-title")).toHaveText("Jamaica");
  await page.getByText("Transcript & sources").click();
  await expect(page.getByText("Station approaching: Jamaica.", { exact: true })).toBeVisible();

  await finishClip(page);
  await page.getByRole("button", { name: "Turn off audio guide" }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await context.setGeolocation({ latitude: kew.lat, longitude: kew.lon, accuracy: 5 });
  await expect.poll(() => requested.filter((input) => input.type === "station").map((input) => input.stationId),
    { timeout: 10000 }).toEqual([jamaica.id, kew.id]);
  await expect.poll(() => clips(page)).toContain(`https://example.org/test-clip-station-${kew.id}.mp3`);
  expect(requested.filter((input) => input.type === "journey")).toHaveLength(1);
  await page.getByRole("button", { name: "Turn off audio guide" }).click();
});

test("skipping an introduction ignores a late provider response and lets the station play", async ({ page }) => {
  let release: (() => void) | undefined;
  let lateSettled = false;
  const requests: AudioRequest[] = [];
  await page.route("**/api/audio", async (route) => {
    const input = route.request().postDataJSON() as AudioRequest;
    requests.push(input);
    if (input.type === "journey") {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: announcement(input) }).catch(() => {});
      lateSettled = true;
    } else await route.fulfill({ json: announcement(input) });
  });

  await startLiveRide(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator(".audio-title")).toContainText("Preparing");
  await page.getByRole("button", { name: "Skip story" }).click();
  release!();
  await expect.poll(() => lateSettled).toBe(true);
  await expect.poll(() => requests.some((request) => request.type === "station")).toBe(true);
  await expect.poll(() => clips(page)).toContain(`https://example.org/test-clip-station-${jamaica.id}.mp3`);
  expect(await clips(page)).not.toContain("https://example.org/test-clip-journey.mp3");
});

test("skipping a preparing station prevents late audio from restarting", async ({ page }) => {
  let release: (() => void) | undefined;
  let lateSettled = false;
  await page.route("**/api/audio", async (route) => {
    const input = route.request().postDataJSON() as AudioRequest;
    if (input.type === "station") {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: announcement(input) }).catch(() => {});
      lateSettled = true;
    } else await route.fulfill({ json: announcement(input) });
  });

  await startLiveRide(page);
  await expect.poll(() => clips(page)).toContain("https://example.org/test-clip-journey.mp3");
  await finishClip(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator(".audio-title")).toHaveText("Preparing Jamaica");
  await page.getByRole("button", { name: "Skip story" }).click();
  release!();
  await expect.poll(() => lateSettled).toBe(true);
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  expect(await clips(page)).toEqual(["https://example.org/test-clip-journey.mp3"]);
});

test("a pointed POI waits for the station clip, then plays once with its sourced story", async ({ page }) => {
  const evidence = { id: "archive", title: "Landmark archive", url: "https://example.org/history",
    text: "The landmark was built in 1901.", retrievedAt: "2026-10-24", license: "CC BY-SA 4.0" };
  const story = { summary: evidence.text, claims: [{ text: evidence.text, quote: evidence.text, evidenceId: evidence.id }],
    verifiedAt: "2026-10-24", evidenceHash: "fixture", generator: "fixture", verifier: "fixture" };
  const landmark = { id: "osm-node-1234", name: "Window landmark", lat: jamaica.lat + 0.003, lon: jamaica.lon,
    category: "Landmark", routeIds: ["10"], tags: {}, evidence: [evidence], story,
    sourceUrl: "https://www.openstreetmap.org/node/1234" };
  await page.route("**/api/journeys/10", (route) => route.fulfill({ json: { places: [landmark] } }));
  const requested: AudioRequest[] = [];
  await page.route("**/api/audio", (route) => {
    const input = route.request().postDataJSON() as AudioRequest;
    requested.push(input);
    return route.fulfill({ json: input.type !== "place" ? announcement(input) : {
      audioUrl: `https://example.org/test-clip-place-${input.context}.mp3`, provider: "elevenlabs",
      script: { name: landmark.name, text: `You just pointed at ${landmark.name}. ${evidence.text}`,
        kind: "verified", sources: [{ title: evidence.title, url: evidence.url, license: evidence.license }], story, evidence: [evidence] },
    } });
  });

  await startLiveRide(page);
  await expect.poll(() => clips(page)).toContain("https://example.org/test-clip-journey.mp3");
  await finishClip(page);
  await expect.poll(() => clips(page)).toContain(`https://example.org/test-clip-station-${jamaica.id}.mp3`);
  await page.evaluate(() => {
    const emit = () => {
      const event = new Event("deviceorientationabsolute");
      Object.defineProperties(event, { alpha: { value: 0 }, beta: { value: 90 }, gamma: { value: 0 }, absolute: { value: true } });
      window.dispatchEvent(event);
    };
    emit(); const timer = setInterval(emit, 100); setTimeout(() => clearInterval(timer), 2200);
  });
  await page.getByRole("button", { name: /Window landmark,/ }).click();
  await expect(page.getByRole("heading", { name: landmark.name })).toBeVisible({ timeout: 10000 });
  await page.locator(".poi-sheet").getByRole("button", { name: "Collapse sheet", exact: true }).click();
  await expect(page.getByText("Window landmark queued")).toBeVisible();
  expect(await clips(page)).toEqual([
    "https://example.org/test-clip-journey.mp3",
    `https://example.org/test-clip-station-${jamaica.id}.mp3`,
  ]);

  await finishClip(page);
  await expect.poll(() => requested.filter((input) => input.type === "place").map((input) => input.context),
    { timeout: 10000 }).toContain("pointed");
  await expect.poll(() => clips(page)).toContain("https://example.org/test-clip-place-pointed.mp3");
  await expect(page.locator(".audio-title")).toHaveText(landmark.name);
  await expect(page.locator(".audio-title")).toBeVisible();
  await page.locator(".poi-sheet").getByRole("button", { name: "Expand sheet", exact: true }).click();
  await expect(page.locator(".story-facts")).toBeVisible();
  await expect(page.locator(".story-facts")).toContainText(evidence.text);
  await page.locator(".poi-sheet").getByRole("button", { name: "Discard discovery", exact: true }).click();
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  expect((await clips(page)).filter((url) => url.includes("test-clip-place-pointed"))).toHaveLength(1);
});

test("a POI with no source stays queued and is never sent to the narration provider or device", async ({ page }) => {
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
  const requested: AudioRequest[] = [];
  await page.route("**/api/audio", (route) => {
    const input = route.request().postDataJSON() as AudioRequest;
    requested.push(input);
    return input.type === "place"
      ? route.fulfill({ status: 422, json: { error: "story_unavailable" } })
      : route.fulfill({ json: announcement(input) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect.poll(() => clips(page)).toContain("https://example.org/test-clip-journey.mp3");
  await finishClip(page);
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(page.getByRole("heading", { name: "Window landmark" })).toBeVisible();
  expect(requested.some((input) => input.type === "place")).toBe(false);
  expect(await clips(page)).toEqual(["https://example.org/test-clip-journey.mp3"]);
  expect(await page.evaluate(() => (window as unknown as { __nativeCount: number }).__nativeCount)).toBe(0);
});

test("demo ride explicitly labels its simulation and identifies the journey as simulated", async ({ page }) => {
  const requested: AudioRequest[] = [];
  await page.route("**/api/audio", (route) => {
    const input = route.request().postDataJSON() as AudioRequest;
    requested.push(input);
    return route.fulfill({ json: announcement(input) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  const rideStatus = page.locator(".ride-heading p");
  await expect(rideStatus).toBeVisible();
  await expect(rideStatus).toContainText("Simulated ride");
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect.poll(() => requested.some((input) => input.type === "journey")).toBe(true);
  expect(requested.find((input) => input.type === "journey")).toMatchObject({
    type: "journey", routeId: "10", simulation: true,
  });
  await expect.poll(() => clips(page)).toContain("https://example.org/test-clip-journey.mp3");
  await page.getByText("Transcript & sources").click();
  await expect(page.getByText(/This is a simulated ride\./)).toBeVisible();
  await expect(rideStatus).toBeVisible();
  await expect(rideStatus).toContainText("Simulated ride");
});
