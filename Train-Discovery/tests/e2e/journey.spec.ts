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

async function choosePointed(page: import("@playwright/test").Page, name: string) {
  await aim(page, 0);
  const candidate = page.getByRole("button", { name: new RegExp(`^${name},`) });
  await expect(candidate).toBeVisible({ timeout: 10000 });
  await candidate.click();
}

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

async function finishJourneyIntroduction(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __spoken: string[] }).__spoken[0] ?? "",
  )).toContain("The tracks set the rhythm.");
  await page.evaluate(() => (window as unknown as { __finishSpeech: () => void }).__finishSpeech());
}

test("Discoveries explains itself before the first ride and returns to route selection", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const discoveries = nav.getByRole("button", { name: "Discoveries" });
  await expect(discoveries).toBeEnabled();

  await discoveries.click();
  await expect(discoveries).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Discoveries appear here during a ride" })).toBeVisible();
  await expect(page.getByText("No sourced place in range.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start discovering" })).toBeVisible();

  const ride = nav.getByRole("button", { name: "Ride" });
  await ride.focus();
  await ride.press("Enter");
  await expect(page.getByRole("heading", { name: "California Zephyr" })).toBeVisible();
  await discoveries.click();
  await page.getByRole("button", { name: "Start discovering" }).click();
  await expect(page.getByRole("heading", { name: "California Zephyr" })).toBeVisible();
});

test("saved discoveries from before the rename reopen as bookmarks without an active ride", async ({ page }) => {
  await page.goto("/?network=lirr");
  await page.evaluate((savedPlace) => {
    localStorage.setItem("train-discovery:saved:v1", JSON.stringify([{ savedAt: 1, place: savedPlace }]));
  }, place);
  await page.reload();
  const bookmarks = page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Bookmarks" });
  await bookmarks.click();
  await page.getByRole("button", { name: "Open Test landmark" }).click();
  await expect(page.getByRole("heading", { name: "Test landmark" })).toBeVisible();
  await expect(page.locator(".story-summary")).toContainText("The landmark was built in 1901.");
  expect(await page.evaluate(() => [localStorage.getItem("train-discovery:saved:v1"), Boolean(localStorage.getItem("gaze:bookmarks:v1"))]))
    .toEqual([null, true]);

  await page.reload();
  await bookmarks.click();
  await expect(page.getByRole("button", { name: "Open Test landmark" })).toBeVisible();
  await page.getByRole("button", { name: "Remove bookmark for Test landmark" }).click();
  await expect(page.getByRole("heading", { name: "No bookmarks yet" })).toBeVisible();
  await page.reload();
  await bookmarks.click();
  await expect(page.getByRole("heading", { name: "No bookmarks yet" })).toBeVisible();
});

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
  await page.goto("/?network=lirr");
  await expect(
    page.getByRole("button", { name: "Jamaica demo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand route list" }).click();
  expect(await page.locator(".route-row").count()).toBeGreaterThan(5);
  await page.locator(".route-row").filter({ hasText: "Babylon" }).click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  const rideStatus = page.locator(".ride-heading p");
  await expect(rideStatus).toBeVisible();
  await expect(rideStatus).toContainText("Near Jamaica");
  await expect(rideStatus).toContainText("Simulated ride");
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
  await page.goto("/?network=lirr");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  await page.getByRole("button", { name: /^Jamaica,/ }).click();
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
}) => {
  await page.goto("/?network=lirr");
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
  await choosePointed(page, "Test landmark");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).click();
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
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).click();
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard Test landmark" }).click();
  await expect(
    page.getByRole("heading", { name: "Test landmark" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).click();
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
  await page.goto("/?network=lirr");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await choosePointed(page, "Test landmark");
  await expect(page.getByRole("heading", { name: "Test landmark" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "View photo details for Test landmark" }).click();
  await expect(page.getByRole("dialog", { name: "Photo of Test landmark" })).toBeVisible();
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
        speak: (utterance: FakeSpeech) => {
          spoken.push(utterance.text);
          Object.assign(window, { __finishSpeech: () => utterance.onend?.() });
        },
        cancel: () => {},
        pause: () => { Object.assign(window, { __paused: true }); },
        resume: () => { Object.assign(window, { __paused: false }); },
      },
    });
  });
  await page.goto("/?network=lirr");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await finishJourneyIntroduction(page);
  const poiSpeech = "Test landmark. The landmark was built in 1901.";
  await expect.poll(() => page.evaluate((text) =>
    (window as unknown as { __spoken: string[] }).__spoken.includes(text), poiSpeech,
  )).toBe(true);
  await page.getByRole("button", { name: "Bookmark Test landmark" }).click();
  if (await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).isVisible())
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).click();
  await expect(page.getByRole("heading", { name: "Test landmark" })).toBeVisible();
  await page.getByRole("button", { name: "Pause audio guide" }).click();
  expect(await page.evaluate(() => (window as unknown as { __paused: boolean }).__paused)).toBe(true);
  await page.getByRole("button", { name: "Resume audio guide" }).click();
  await page.getByRole("button", { name: "Skip story" }).click();
  await expect(page.getByText("Waiting for a nearby story")).toBeVisible();
  await page.getByRole("button", { name: "Listen to Test landmark" }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __spoken: string[] }).__spoken.filter((entry) =>
      entry.includes("The landmark was built in 1901.")).length,
  )).toBe(2);
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
      value: { speak: (voice: FakeSpeech) => {
        spoken.push(voice.text);
        Object.assign(window, { __finishSpeech: () => voice.onend?.() });
      }, cancel() {}, pause() {}, resume() {} },
    });
  });
  await page.goto("/?network=lirr");
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await page.getByRole("button", { name: /Port Jefferson/ }).last().click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await finishJourneyIntroduction(page);
  await expect(page.getByText("Example House Museum · source excerpt")).toBeVisible();
  const excerptSpeech = "Example House Museum. From Wikipedia: Example House is a preserved building used for education. It is near a railway line.";
  await expect.poll(() => page.evaluate((text) =>
    (window as unknown as { __spoken: string[] }).__spoken.includes(text), excerptSpeech,
  )).toBe(true);
  await page.getByRole("button", { name: "Bookmark Example House Museum" }).click();
  if (await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).isVisible())
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).click();
  await expect(page.getByText("Wikipedia excerpt · not verified")).toBeVisible();
  await page.getByRole("button", { name: "Listen to source for Example House Museum" }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __spoken: string[] }).__spoken.filter((entry) =>
      entry.includes("Example House is a preserved building used for education.")).length,
  )).toBe(2);
});

test("all branches are searchable and no left/right selector is present", async ({
  page,
}) => {
  await page.goto("/?network=lirr");
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
  await page.goto("/?network=lirr");
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
