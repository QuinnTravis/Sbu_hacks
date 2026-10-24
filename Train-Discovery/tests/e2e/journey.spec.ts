import { test, expect } from "@playwright/test";
import type { Place } from "../../src/lib/types";

const place = {
  id: "osm-node-1234",
  name: "Test landmark",
  lat: 40.925,
  lon: -73.1285,
  category: "History",
  routeIds: ["10"],
  sourceUrl: "https://www.openstreetmap.org/node/1234",
  tags: {},
  evidence: [
    {
      id: "wikipedia-1",
      title: "Test landmark",
      url: "https://en.wikipedia.org/wiki/Test",
      text: "The landmark was built in 1901. It was later used as a library.",
      retrievedAt: "2026-10-24T00:00:00.000Z",
      license: "CC BY-SA 4.0",
    },
  ],
  story: {
    summary: "The landmark was built in 1901.",
    claims: [
      {
        text: "The landmark was built in 1901.",
        evidenceId: "wikipedia-1",
        quote: "The landmark was built in 1901.",
      },
    ],
    funFact: {
      text: "It was later used as a library.",
      evidenceId: "wikipedia-1",
      quote: "It was later used as a library.",
    },
    verifiedAt: "2026-10-24T00:00:00.000Z",
    generator: "gemini-2.5-flash",
    verifier: "gemini-2.5-flash-lite",
    evidenceHash: "abc",
  },
};

test.beforeEach(async ({ page, context }) => {
  // Provider-independent checks must never consume live synthesis credit.
  await page.route("**/api/audio", (route) => route.fulfill({ status: 503, json: { error: "test_device_fallback" } }));
  await page.addInitScript(() => {
    // Model a supported phone whose motion/compass permission was granted.
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", {
      configurable: true,
      value: async () => "granted",
    });
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 40.92,
    longitude: -73.1285,
    accuracy: 5,
  });
  await page.route("**/api/journeys/10", (route) =>
    route.fulfill({ json: { places: [place] } }),
  );
  await page.route("**/api/photos/**", (route) =>
    route.fulfill({ status: 503, json: { error: "Not configured" } }),
  );
});

async function aim(
  page: import("@playwright/test").Page,
  alpha: number,
  absolute = true,
) {
  await page.evaluate(
    ({ alpha, absolute }) => {
      const emit = () => {
        const event = new Event("deviceorientationabsolute");
        Object.defineProperties(event, {
          alpha: { value: alpha },
          beta: { value: 90 },
          gamma: { value: 0 },
          absolute: { value: absolute },
        });
        window.dispatchEvent(event);
      };
      emit();
      const interval = setInterval(emit, 100);
      setTimeout(() => clearInterval(interval), 1800);
    },
    { alpha, absolute },
  );
}

test("Jamaica is the default demo location and starts without GPS", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: () => {
          throw new Error("Demo must not request GPS");
        },
        clearWatch: () => {},
      },
    });
  });
  await page.route("**/api/journeys/1", (route) =>
    route.fulfill({ json: { places: [] } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Jamaica demo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand route list" }).click();
  expect(await page.locator(".route-row").count()).toBeGreaterThan(5);
  await page.locator(".route-row").filter({ hasText: "Babylon" }).click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await expect(
    page.getByText("Simulated location & heading", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Near Jamaica", { exact: true })).toBeVisible();
});

test("Jamaica verified facts render in the demo journey", async ({ page, request }) => {
  test.skip(process.env.TEST_LIVE_DATABASE !== "1", "Requires the configured live catalog.");
  const response = await request.get("/api/journeys/10");
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { places: Place[] };
  const jamaica = data.places.find((place) => place.id === "osm-node-7087272768");
  if (!jamaica?.story?.claims.length) throw new Error("Jamaica has no verified story in the live catalog.");
  expect(jamaica.evidence.some((item) => item.sourceType === "search-snippet")).toBe(true);
  if (!jamaica.story.funFact) throw new Error("Jamaica has no verified interesting fact in the live catalog.");
  const claim = jamaica.story.claims[0];
  if (!claim) throw new Error("Jamaica's verified story has no claims.");
  const source = jamaica.evidence.find((item) => item.id === claim.evidenceId);
  if (!source) throw new Error("Jamaica's claim has no matching evidence.");
  expect(source.url).toMatch(/^https:\/\//);
  const funFact = jamaica.story.funFact;
  const funFactSource = jamaica.evidence.find((item) => item.id === funFact.evidenceId);
  if (!funFactSource) throw new Error("Jamaica's interesting fact has no matching evidence.");

  await page.route("**/api/journeys/10", (route) =>
    route.fulfill({ json: { places: [jamaica] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  await expect(page.getByRole("heading", { name: "Jamaica", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Evidence checked")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.locator(".story-summary")).toContainText(claim.text);
  await expect(page.getByRole("link", { name: "Source for summary claim 1" })).toHaveAttribute("href", source.url);
  await expect(page.getByRole("heading", { name: "Interesting fact" })).toBeVisible();
  await expect(page.locator(".story-interesting")).toContainText(funFact.text);
  await expect(page.getByRole("link", { name: "Source for interesting fact" })).toHaveAttribute("href", funFactSource.url);
});

test("select a nearby route and retain pointed discoveries until discarded", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await expect(
    page.getByRole("heading", { name: "Routes near you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start ride", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /Port Jefferson/ })
    .last()
    .click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await aim(page, 0);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.locator(".story-facts").getByText("The landmark was built in 1901."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interesting fact" })).toBeVisible();
  await expect(page.locator(".story-interesting")).toContainText("It was later used as a library.");
  await aim(page, 180);
  await context.setGeolocation({
    latitude: 40.93,
    longitude: -73.14,
    accuracy: 5,
  });
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toBeVisible();
  await page.reload();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard Test landmark" }).click();
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toHaveCount(0);
  await page.reload();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("Wikimedia fallback photos show the image's source, author and license", async ({ page }) => {
  await page.route("https://thumb.wikimedia.org/**", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64"),
  }));
  await page.route("**/api/photos/**", (route) => route.fulfill({ json: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/AdamDerbyMansions.jpg/330px-AdamDerbyMansions.jpg",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:AdamDerbyMansions.jpg",
    authors: [{ displayName: "Example photographer", uri: "https://commons.wikimedia.org/wiki/File:AdamDerbyMansions.jpg" }],
    license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await aim(page, 0);
  await expect(page.getByRole("heading", { name: "Test landmark" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", /commons\.wikimedia\.org/);
  await expect(page.getByRole("link", { name: "Example photographer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", /creativecommons\.org/);
});

test("audio tour narrates nearby places without pointing, then saves, pauses, skips and replays", async ({ page, context }) => {
  // Keep this POI control test outside the station trigger; station audio has its own coverage.
  await context.setGeolocation({ latitude: 40.923, longitude: -73.1285, accuracy: 5 });
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken, __paused: false });
    class FakeSpeech {
      text: string;
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeSpeech });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: (utterance: FakeSpeech) => spoken.push(utterance.text),
        cancel: () => {},
        pause: () => { Object.assign(window, { __paused: true }); },
        resume: () => { Object.assign(window, { __paused: false }); },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken[0])).toBe("Test landmark. The landmark was built in 1901.");
  await page.getByRole("button", { name: "Save Test landmark to discoveries" }).click();
  if (await page.getByRole("button", { name: /My discoveries/ }).isVisible())
    await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(page.getByRole("heading", { name: "Test landmark" })).toBeVisible();
  await page.getByRole("button", { name: "Pause audio guide" }).click();
  expect(await page.evaluate(() => (window as unknown as { __paused: boolean }).__paused)).toBe(true);
  await page.getByRole("button", { name: "Resume audio guide" }).click();
  await page.getByRole("button", { name: "Skip story" }).click();
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  await page.getByRole("button", { name: "Listen to Test landmark" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(2);
  await page.getByRole("button", { name: "Turn off audio guide" }).click();
  await expect(page.getByRole("button", { name: "Start audio tour" })).toBeVisible();
});

test("an attributed source excerpt is visibly distinguished from a verified story", async ({ page, context }) => {
  await context.setGeolocation({ latitude: 40.923, longitude: -73.1285, accuracy: 5 });
  const unverified = {
    ...place,
    id: "example-house",
    name: "Example House Museum",
    story: undefined,
    evidence: [{
      ...place.evidence[0],
      title: "Example House",
      url: "https://en.wikipedia.org/wiki/Example_House",
      text: "Example House is a preserved building used for education. It is near a railway line.",
    }],
  };
  await page.route("**/api/journeys/10", (route) => route.fulfill({ json: { places: [unverified] } }));
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken });
    class FakeSpeech { lang = ""; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeSpeech });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: (voice: FakeSpeech) => spoken.push(voice.text), cancel() {}, pause() {}, resume() {} },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect(page.getByText("Example House Museum · source excerpt")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken[0])).toBe(
    "Example House Museum. From Wikipedia: Example House is a preserved building used for education. It is near a railway line.",
  );
  await page.getByRole("button", { name: "Save Example House Museum to discoveries" }).click();
  if (await page.getByRole("button", { name: /My discoveries/ }).isVisible())
    await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(page.getByText("Wikipedia excerpt · not verified")).toBeVisible();
  await page.getByRole("button", { name: "Listen to source for Example House Museum" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(2);
});

test("all branches are searchable and no left/right selector is present", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Expand route list" }).click();
  await page.getByRole("button", { name: "All routes" }).click();
  await page
    .getByRole("searchbox", { name: "Search LIRR routes" })
    .fill("Greenport");
  await expect(page.locator(".route-row")).toHaveCount(1);
  await page.locator(".route-row").click();
  await expect(
    page.getByRole("button", { name: "Start ride", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /left window|right window/i }),
  ).toHaveCount(0);
});

test("denied location offers recovery without inventing position", async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.goto("/");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: (
          _success: unknown,
          error: (e: { code: number }) => void,
        ) => {
          error({ code: 1 });
          return 1;
        },
        clearWatch: () => {},
      },
    }),
  );
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await expect(page.getByText(/Location is blocked/)).toBeVisible();
  await expect(page.locator(".route-row")).toHaveCount(13);
});
