import { test, expect, type Page } from "./fixtures";
import rail from "../../public/data/lirr.json";

const jamaica = rail.routes.flatMap((route) => route.stops).find((stop) => stop.name === "Jamaica")!;
const fact = "The landmark was built in 1901.";
const place = {
  id: "osm-node-1234", name: "Window landmark", category: "Landmark",
  lat: jamaica.lat + 0.003, lon: jamaica.lon, routeIds: ["10"], tags: {},
  sourceUrl: "https://example.org/archive",
  evidence: [{ id: "archive", title: "Landmark archive", url: "https://example.org/archive",
    text: fact, license: "CC0", retrievedAt: "2026-10-25" }],
  story: { summary: fact, claims: [{ text: fact, quote: fact, evidenceId: "archive" }],
    verifiedAt: "2026-10-25", evidenceHash: "fixture", generator: "fixture", verifier: "fixture" },
};
const answer = {
  audioUrl: "https://example.org/test-answer.mp3",
  script: { name: place.name, text: fact, kind: "source", language: "en",
    sources: [{ title: "Landmark archive", url: place.sourceUrl, license: "CC0" }] },
};
async function played(page: Page) {
  return page.evaluate(() => (window as unknown as { __played: string[] }).__played);
}
async function finish(page: Page) {
  await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());
}
async function begin(page: Page) {
  const response = await page.goto("/?network=lirr");
  expect(response?.headers()["permissions-policy"]).toContain("microphone=(self)");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect.poll(() => played(page)).toContain("https://example.org/test-journey.mp3");
  await finish(page);
  await expect.poll(() => played(page)).toContain("https://example.org/test-station.mp3");
  await finish(page);
  await expect.poll(() => played(page), { timeout: 12000 }).toContain("https://example.org/test-place.mp3");
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: jamaica.lat, longitude: jamaica.lon, accuracy: 5 });
  await page.route("**/api/journeys/10", (route) => route.fulfill({ json: { places: [place] } }));
  await page.route("**/api/photos/**", (route) => route.fulfill({ status: 404, json: {} }));
  await page.route("**/api/audio", (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: {
      audioUrl: `https://example.org/test-${input.type}.mp3`,
      script: { ...answer.script, text: input.type === "place" ? fact : "Station approaching: Jamaica.",
        kind: input.type === "place" ? "source" : "announcement" },
    } });
  });
  await page.addInitScript(() => {
    const played: string[] = [];
    Object.assign(window, { __played: played, __paused: 0 });
    class FakeAudio {
      src = "";
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      setAttribute() {}
      removeAttribute() { this.src = ""; }
      load() {}
      pause() { (window as unknown as { __paused: number }).__paused++; }
      play() {
        if (this.src.startsWith("https://example.org/test-")) played.push(this.src);
        this.onplay?.();
        Object.assign(window, { __finish: () => this.onended?.() });
        return Promise.resolve();
      }
    }
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        Object.assign(window, { __recognition: this, __micAborted: false });
      }
      stop() { this.onend?.(); }
      abort() { Object.assign(window, { __micAborted: true }); }
    }
    Object.defineProperty(window, "Audio", { configurable: true, value: FakeAudio });
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", { configurable: true, value: async () => "granted" });
  });
});

test("mic interrupts narration and speaks a sourced answer with transcript", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/ask", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: answer });
  });
  await begin(page);
  const pauses = await page.evaluate(() => (window as unknown as { __paused: number }).__paused);
  await page.getByRole("button", { name: "Ask about this place", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Listening…" })).toBeVisible();
  await page.screenshot({ path: `/tmp/ask-guide-${test.info().project.name}.png` });
  expect(await page.evaluate(() => (window as unknown as { __paused: number }).__paused)).toBeGreaterThan(pauses);
  await page.evaluate(() => {
    const mic = (window as unknown as { __recognition: {
      onresult: (event: unknown) => void; onend: () => void;
    } }).__recognition;
    mic.onresult({ results: [{ isFinal: true, 0: { transcript: "When was it built?" } }] });
    mic.onend();
  });
  await expect.poll(() => played(page)).toContain(answer.audioUrl);
  expect(requests).toEqual([{ placeId: place.id, question: "When was it built?", language: "en" }]);
  await page.getByText("Transcript & sources", { exact: true }).click();
  await expect(page.locator(".audio-transcript")).toContainText(fact);
  await expect(page.locator(".audio-transcript a")).toHaveAttribute("href", place.sourceUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("typing works without recognition and cancel ignores a late answer", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });
  let release: (() => void) | undefined;
  let settled = false;
  await page.route("**/api/ask", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: answer }).catch(() => {});
    settled = true;
  });
  await begin(page);
  await page.getByRole("button", { name: "Ask about this place", exact: true }).click();
  await expect(page.getByText("Voice input is unavailable in this browser. Type your question.")).toBeVisible();
  await page.getByRole("textbox", { name: "Ask a question" }).fill("When was it built?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("button", { name: "Return to tour" }).click();
  release!();
  await expect.poll(() => settled).toBe(true);
  expect(await played(page)).not.toContain(answer.audioUrl);
  await expect(page.getByRole("button", { name: "Ask about this place", exact: true })).toBeVisible();
});

test("denied microphone and unavailable answer leave a recoverable text form", async ({ page }) => {
  await page.route("**/api/ask", (route) => route.fulfill({ status: 503, json: { error: "answer_unavailable" } }));
  await begin(page);
  await page.getByRole("button", { name: "Ask about this place", exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { __recognition: { onerror: (event: unknown) => void } }).__recognition.onerror({ error: "not-allowed" });
  });
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await page.getByRole("textbox", { name: "Ask a question" }).fill("When was it built?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Could not answer. Try again or return to the tour.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
  await page.getByRole("button", { name: "Return to tour" }).click();
  await expect(page.getByRole("button", { name: "Ask about this place", exact: true })).toBeVisible();
});
