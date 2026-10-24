import { expect, test } from "@playwright/test";

const wiki = {
  id: "wikipedia-1", title: "Jamaica station",
  url: "https://en.wikipedia.org/wiki/Jamaica_station",
  text: "Jamaica station is a major rail transit hub in Queens, New York City. Thousands of commuters use its platforms every day.",
  license: "CC BY-SA", retrievedAt: "2026-10-24T00:00:00Z",
};

const base = (id: string, name: string, lat: number, category: string) => ({
  id, name, lat, lon: -73.8085, category, routeIds: ["10"],
  sourceUrl: "https://www.openstreetmap.org/node/1", tags: {}, evidence: [],
});

test("Jamaica replay lists aimed candidates and saves only the selected place", async ({ page }) => {
  await page.route("**/api/audio", (route) =>
    route.fulfill({ status: 503, json: { error: "test_device_fallback" } }),
  );
  await page.route("**/api/photos/**", (route) =>
    route.fulfill({
      json: {
        url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        source: "Wikimedia Commons",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Jamaica.jpg",
        authors: [],
      },
    }),
  );
  await page.route("**/api/journeys/10", (route) =>
    route.fulfill({ json: { places: [
      { ...base("unsupported", "Johnson Yard", 40.6999, "Infrastructure") },
      { ...base("duplicate", "Jamaica", 40.7004, "Railway history"), evidence: [wiki] },
      { ...base("verified", "Jamaica", 40.7002, "Railway history"),
        evidence: [wiki], story: {
          summary: "Jamaica station is a major rail transit hub in Queens, New York City.",
          claims: [{ text: "Jamaica station is a major rail transit hub in Queens, New York City.",
            quote: "Jamaica station is a major rail transit hub in Queens, New York City.", evidenceId: wiki.id }],
          funFact: { text: "Thousands of commuters use its platforms every day.",
            quote: "Thousands of commuters use its platforms every day.", evidenceId: wiki.id },
          verifiedAt: "2026-10-24T00:00:00Z", generator: "test", verifier: "test", evidenceHash: "test",
        } },
      { ...base("historic", "King Manor Museum", 40.7041, "Art & culture"), evidence: [{
        ...wiki, id: "museum-source", title: "King Manor",
        text: "King Manor is a historic house in Jamaica, Queens, New York City. It houses a museum devoted to local history.",
        url: "https://en.wikipedia.org/wiki/King_Manor",
      }] },
    ] } }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  await page.getByRole("button", { name: "Pause replay" }).click();
  const jamaica = page.getByRole("button", { name: /^Jamaica,/ });
  await expect(jamaica).toBeVisible({ timeout: 10000 });
  await expect(jamaica.locator("img")).toHaveAttribute("src", /^data:image\/gif/);
  await expect(jamaica.locator(".candidate-summary")).toHaveCount(0);
  await expect(jamaica).not.toContainText("major rail transit hub");
  await expect(jamaica).not.toContainText("No sourced summary yet");
  const manor = page.getByRole("button", { name: /King Manor Museum,/ });
  await expect(manor).toBeVisible();
  await expect(manor.locator("img")).toHaveAttribute("src", /^data:image\/gif/);
  await expect(manor.locator(".candidate-summary")).toHaveCount(0);
  await expect(manor).not.toContainText("historic house");
  await expect(manor).not.toContainText("No sourced summary yet");
  await expect(jamaica).toHaveCount(1);
  await expect(page.locator(".nav-count")).toHaveText("0");
  await jamaica.click();
  await expect(page.getByRole("heading", { name: "Jamaica", exact: true })).toBeVisible();
  await expect(page.locator(".place-photo img")).toHaveAttribute("src", /^data:image\/gif/);
  await expect(page.locator(".story-summary")).toContainText("major rail transit hub");
  await expect(page.locator(".story-interesting")).toContainText("Thousands of commuters");
  await expect(page.locator(".nav-count")).toHaveText("1");
  await expect(page.getByRole("heading", { name: "King Manor Museum" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Johnson Yard" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("replay shows loading, then stays empty when nothing nearby is sourced", async ({ page }) => {
  await page.route("**/api/audio", (route) =>
    route.fulfill({ status: 503, json: { error: "test_device_fallback" } }),
  );
  await page.route("**/api/photos/**", (route) =>
    route.fulfill({ status: 503, json: { error: "test_no_photo" } }),
  );
  let releaseCatalog: () => void = () => {};
  const catalogGate = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  await page.route("**/api/journeys/10", async (route) => {
    await catalogGate;
    await route.fulfill({
      json: { places: [base("unsupported", "Johnson Yard", 40.6999, "Infrastructure")] },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  await expect(page.locator(".nearby-status")).toContainText("Loading places");
  await expect(page.getByText("Simulated aim")).toBeVisible();
  await expect(page.getByText("Hold your phone upright")).toHaveCount(0);
  await page.getByRole("button", { name: "Open dev panel" }).click();
  const panel = page.getByRole("complementary", { name: "Developer controls" });
  await expect(panel.getByTestId("dev-detection")).toHaveText("Paused — loading places…");
  releaseCatalog();
  await expect(page.getByRole("status").filter({ hasText: "No sourced place in range." })).toBeVisible();
  await expect(panel.getByTestId("dev-detection")).toHaveText("Paused — no sourced place in range.");
  await expect(panel.getByText("Paused — check sensors / tilt")).toHaveCount(0);
  await panel.getByRole("button", { name: "Close dev panel", exact: true }).click();
  await page.waitForTimeout(2500);
  await expect(page.locator(".nav-count")).toHaveText("0");
  await expect(page.getByRole("heading", { name: "Johnson Yard" })).toHaveCount(0);

  await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(page.getByRole("heading", { name: "No sourced place in range." })).toBeVisible();
  await expect(page.locator(".nav-count")).toHaveText("0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("a failed replay catalog retries into a sourced discovery", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/audio", (route) =>
    route.fulfill({ status: 503, json: { error: "test_device_fallback" } }),
  );
  await page.route("**/api/photos/**", (route) =>
    route.fulfill({ status: 503, json: { error: "test_no_photo" } }),
  );
  await page.route("**/api/journeys/10", (route) => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 503, json: { error: "unavailable" } });
    return route.fulfill({
      json: {
        places: [{
          ...base("verified", "Jamaica", 40.7002, "Railway history"),
          evidence: [wiki],
          story: {
            summary: "Jamaica station is a major rail transit hub in Queens, New York City.",
            claims: [{
              text: "Jamaica station is a major rail transit hub in Queens, New York City.",
              quote: "Jamaica station is a major rail transit hub in Queens, New York City.",
              evidenceId: wiki.id,
            }],
            funFact: {
              text: "Thousands of commuters use its platforms every day.",
              quote: "Thousands of commuters use its platforms every day.",
              evidenceId: wiki.id,
            },
            verifiedAt: "2026-10-24T00:00:00Z",
            generator: "test",
            verifier: "test",
            evidenceHash: "test",
          },
        }],
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  const failure = page.getByRole("alert").filter({ hasText: "Couldn’t load places" });
  await expect(failure).toBeVisible();
  await expect(page.locator(".nearby-status")).toContainText("Places unavailable");
  await page.getByRole("button", { name: "Open dev panel" }).click();
  const panel = page.getByRole("complementary", { name: "Developer controls" });
  await expect(panel.getByTestId("dev-detection")).toHaveText("Paused — places didn’t load");
  await expect(panel.getByText("Paused — check sensors / tilt")).toHaveCount(0);
  await panel.getByRole("button", { name: "Close dev panel", exact: true }).click();
  await expect(page.locator(".nav-count")).toHaveText("0");
  await page.getByRole("button", { name: /My discoveries/ }).click();
  await expect(page.getByRole("heading", { name: "Places didn’t load" })).toBeVisible();
  await failure.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByRole("button", { name: /^Jamaica,/ }).click();
  await expect(page.getByRole("heading", { name: "Jamaica", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".story-summary")).toContainText("major rail transit hub");
  await expect(page.locator(".story-interesting")).toContainText("Thousands of commuters");
  await expect(failure).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("simulated ride selects one candidate and keeps it after skip", async ({ page }) => {
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
  });
  await page.route("**/api/photos/**", (route) =>
    route.fulfill({ status: 503, json: { error: "test_no_photo" } }),
  );
  await page.route("**/api/audio", async (route) => {
    const input = route.request().postDataJSON();
    const station = input.type === "station";
    await route.fulfill({
      json: {
        audioUrl: `https://example.org/test-clip-${input.type}.mp3`,
        provider: "elevenlabs",
        script: {
          name: station ? "Jamaica" : "King Manor Museum",
          text: station
            ? "Station approaching: Jamaica."
            : "You just pointed at King Manor Museum. It houses a museum devoted to local history.",
          kind: station ? "announcement" : "verified",
          sources: [],
        },
      },
    });
  });
  await page.route("**/api/journeys/10", (route) =>
    route.fulfill({
      json: {
        places: [
          {
            ...base("verified", "Jamaica", 40.7002, "Railway history"),
            evidence: [wiki],
            story: {
              summary: "Jamaica station is a major rail transit hub in Queens, New York City.",
              claims: [{
                text: "Jamaica station is a major rail transit hub in Queens, New York City.",
                quote: "Jamaica station is a major rail transit hub in Queens, New York City.",
                evidenceId: wiki.id,
              }],
              verifiedAt: "2026-10-24T00:00:00Z", generator: "test", verifier: "test", evidenceHash: "test",
            },
          },
          {
            ...base("historic", "King Manor Museum", 40.7041, "Art & culture"),
            evidence: [{
              ...wiki, id: "museum-source", title: "King Manor",
              text: "King Manor is a historic house in Jamaica, Queens, New York City. It houses a museum devoted to local history.",
              url: "https://en.wikipedia.org/wiki/King_Manor",
            }],
          },
        ],
      },
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Start Jamaica demo ride" }).click();
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByRole("button", { name: "Start audio tour" }).click();
  await expect(page.locator(".audio-title")).toHaveText("Jamaica", { timeout: 10000 });
  await expect(page.getByRole("button", { name: /^Jamaica,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /King Manor Museum,/ })).toBeVisible();
  await page.getByRole("button", { name: /King Manor Museum,/ }).click();
  await expect(page.getByRole("heading", { name: "King Manor Museum" })).toBeVisible();
  await expect(page.locator(".nav-count")).toHaveText("1");
  await expect(page.getByText("King Manor Museum queued")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __clips: string[] }).__clips)).toHaveLength(1);
  await page.getByRole("button", { name: "Skip story" }).click();
  await expect(page.getByRole("heading", { name: "King Manor Museum" })).toBeVisible();
  await expect(page.locator(".nav-count")).toHaveText("1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
