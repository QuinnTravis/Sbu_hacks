import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Place } from "../../src/lib/types";

// Reproduction shared with the compass/audio designers: four northward places
// near Jamaica, replay paused, then select LONG_NAME during a held station clip.
const LONG_NAME = "King Manor Museum and Rufus King Historic House in Jamaica, Queens";
const places: Place[] = ["Jamaica", LONG_NAME, "Queens Historical Railway Museum", "Jamaica Heritage Park"].map((name, i) => ({
  id: `ride-layout-${i}`,
  name,
  lat: 40.7002 + i * 0.00065,
  lon: -73.8085,
  category: "Art & culture",
  routeIds: ["1", "10"],
  sourceUrl: "https://www.openstreetmap.org/node/1",
  tags: {},
  evidence: [{
    id: `ride-evidence-${i}`,
    title: name,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`,
    text: `${name} is a historic place in Queens, New York City. It preserves local history and welcomes visitors to its museum.`,
    license: "CC BY-SA",
    retrievedAt: "2026-10-24T00:00:00Z",
  }],
}));

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    // Provider responses are local fixtures. Keep their online branch independent
    // of host connectivity so browser-native speech is never a layout prerequisite.
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const clips: string[] = [];
    Object.assign(window, { __rideLayoutClips: clips, __rideLayoutOriginalOnline: originalOnline });
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
        if (this.src.includes("ride-test-clip-")) clips.push(this.src);
        this.onplay?.();
        Object.assign(window, { __finishRideLayoutClip: () => this.onended?.() });
        // Deliberately hold playback: selected stories must remain queued.
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "Audio", { configurable: true, value: FakeAudio });
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/journeys/")) return route.fulfill({ json: { places } });
    if (path.startsWith("/api/photos/")) {
      // A naturally large image catches the user's original thumbnail overflow.
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#8faaba"/><text x="20" y="60" font-size="28">Mock photo fixture</text></svg>';
      return route.fulfill({ json: {
        url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
        source: "Wikimedia Commons",
        sourceUrl: "https://example.org/mock-photo",
        authors: [],
      } });
    }
    if (path === "/api/audio") {
      const input = route.request().postDataJSON();
      const journey = input.type === "journey";
      const station = input.type === "station";
      const name = journey ? "Welcome to Port Jefferson Branch" : station ? "Jamaica" : places.find((place) => place.id === input.placeId)!.name;
      return route.fulfill({ json: {
        audioUrl: `https://example.org/ride-test-clip-${journey ? "journey" : station ? "station" : input.placeId}.mp3`,
        provider: "elevenlabs",
        script: {
          name,
          text: journey ? "Welcome aboard. The world outside has stories." : station ? "Station approaching: Jamaica." : `You just pointed at ${name}. It preserves local history.`,
          kind: journey || station ? "announcement" : "source",
          sources: [],
        },
      } });
    }
    return route.fulfill({ status: 503, json: { error: "ride_layout_provider_disabled" } });
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const fixture = await page.evaluate(() => {
      const state = window as unknown as { __rideLayoutClips: string[]; __rideLayoutOriginalOnline: boolean };
      return { online: navigator.onLine, originalOnline: state.__rideLayoutOriginalOnline, clips: state.__rideLayoutClips };
    });
    await info.attach("audio-fixture", { body: JSON.stringify(fixture, null, 2), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath("failure.png") });
  }
});

async function startHeldGuide(page: Page) {
  await page.getByRole("button", { name: "Start audio tour", exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __rideLayoutClips: string[] }).__rideLayoutClips,
  ), { message: "The mocked journey introduction must start before layout verification" }).toEqual([
    "https://example.org/ride-test-clip-journey.mp3",
  ]);
  await expect(page.locator(".audio-title")).toContainText("Welcome");
  await page.evaluate(() =>
    (window as unknown as { __finishRideLayoutClip: () => void }).__finishRideLayoutClip(),
  );
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __rideLayoutClips: string[] }).__rideLayoutClips,
  )).toEqual([
    "https://example.org/ride-test-clip-journey.mp3",
    "https://example.org/ride-test-clip-station.mp3",
  ]);
  await expect(page.locator(".audio-title")).toContainText("Jamaica");
}

async function startRide(page: Page, branch = "Port Jefferson") {
  await page.goto("/");
  if (branch === "Babylon") {
    await page.getByRole("button", { name: "Expand route list", exact: true }).click();
    await page.locator(".route-row").filter({ hasText: "Babylon" }).click();
    await page.getByRole("button", { name: "Start ride", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Start Jamaica demo ride", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: branch, exact: true, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await expect(page.locator(".candidate-row")).toHaveCount(4);
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1366, height: 768 }]) {
  test(`Babylon chooser, selection and long queued feedback at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await startRide(page, "Babylon");
    await expectNoRideIntersections(page);
    await expectReachable(page.locator(".candidate-row").last());
    await page.screenshot({ path: info.outputPath("babylon-photo-chooser.png") });
    await startHeldGuide(page);
    const row = candidate(page, LONG_NAME);
    await expectReachable(row);
    await row.click();
    await expect(page.getByRole("heading", { name: LONG_NAME, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Babylon", exact: true, level: 1 })).toBeVisible();
    await expect(page.locator(".nav-count")).toHaveText("1");
    await expect(page.locator(".place-photo img")).toBeVisible();
    await expect(page.locator(".audio-next-name")).toHaveText(LONG_NAME);
    expect((await page.locator(".audio-next-name").boundingBox())!.width).toBeGreaterThanOrEqual(32);
    await expectVisibleTextFragment(page.locator(".audio-queued"), "queued");
    await expectVisibleTextFragment(page.locator(".audio-next-name"), "King");
    await expectReachable(page.getByRole("button", { name: "Play now", exact: true }));
    await page.screenshot({ path: info.outputPath("babylon-selected-queued.png") });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await expectReachable(page.locator(".candidate-row").last());
    await expectNoRideIntersections(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

function candidate(page: Page, name: string) {
  return page.locator(".candidate-row").filter({ has: page.getByText(name, { exact: true }) });
}

async function expectNoRideIntersections(page: Page) {
  const boxes = await page.locator(".pointing-instruction, .replay-controls, .candidate-sheet").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      let left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
      let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
      // Compare the portions actually visible through scrolling containers.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, clip.left); right = Math.min(right, clip.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
        }
      }
      return { name: element.className, left, right, top, bottom };
    }).filter((box) => box.right > box.left && box.bottom > box.top),
  );
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(width > 0.5 && height > 0.5, `${a.name} intersects ${b.name}: ${JSON.stringify({ a, b })}`).toBe(false);
    }
  }
}

async function expectReachable(control: Locator) {
  // Native nearest scrolling ignores the fixed navigation. Center the target
  // through real scrolling, then require both full visibility and a pointer hit.
  await control.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect.poll(() => control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }), { message: "The target center must receive pointer input after scrolling settles" }).toBe(true);
}

async function expectVisibleTextFragment(locator: Locator, fragment: string) {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect.poll(() => locator.evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(text) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index); range.setEnd(node, index + text.length);
      const box = range.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) continue;
      let clipped = false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5)) clipped = true;
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5)) clipped = true;
      }
      if (!clipped) return true;
    }
    return false;
  }, fragment), { message: `Visible text fragment after scrolling: ${fragment}` }).toBe(true);
}

for (const viewport of [
  { width: 320, height: 667 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 740, height: 420 },
]) {
  test(`chooser geometry, all rows and large photo containment at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await startRide(page);
    const instruction = page.locator(".pointing-instruction");
    await instruction.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(instruction).toBeInViewport({ ratio: 1 });
    await expectNoRideIntersections(page);
    await expectReachable(page.getByRole("button", { name: "Play replay", exact: true }));
    await expectNoRideIntersections(page);
    await page.screenshot({ path: info.outputPath("chooser.png") });
    await expect(page.locator(".candidate-row img, .queue-strip img, .place-thumb")).toHaveCount(0);
    await expect(page.locator(".candidate-row")).toHaveCount(4);
    // Actually select every row, including rows initially below the sheet fold.
    for (const place of places) {
      const row = candidate(page, place.name);
      await expectReachable(row);
      await expectNoRideIntersections(page);
      await row.click();
      await expect(page.getByRole("heading", { name: place.name, exact: true })).toBeVisible();
      await expect(page.locator(".place-photo")).toBeVisible();
      await page.getByRole("button", { name: "Discover", exact: true }).click();
    }
    await expect(page.locator(".nav-count")).toHaveText("4");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`long queued and Next names remain meaningful with Play now at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await startRide(page);
    await startHeldGuide(page);
    const row = candidate(page, LONG_NAME);
    await expectReachable(row);
    await row.click();
    await expect(page.locator(".audio-queued")).toContainText(LONG_NAME);
    await expect(page.locator(".audio-next-name")).toHaveText(LONG_NAME);
    expect((await page.locator(".audio-next-name").boundingBox())!.width).toBeGreaterThanOrEqual(32);
    await expectVisibleTextFragment(page.locator(".audio-next-label"), "Next");
    await expectVisibleTextFragment(page.locator(".audio-next-name"), "King");
    await expectVisibleTextFragment(page.locator(".audio-queued"), "King");
    await expectVisibleTextFragment(page.locator(".audio-queued"), "queued");
    const playNow = page.getByRole("button", { name: "Play now", exact: true });
    await expectReachable(playNow);
    expect((await playNow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath("long-queued-audio.png") });
    // Selection must leave the actual card usable, including short landscape.
    // CSS visibility alone does not detect a zero-height ancestor scroller.
    const sources = page.locator(".sources > summary");
    await expectReachable(sources);
    await sources.click();
    await expect(page.locator(".sources")).toContainText(LONG_NAME);
    await expectReachable(page.getByRole("button", { name: `Discard ${LONG_NAME}`, exact: true }));
    await page.screenshot({ path: info.outputPath("selected-card-reachable.png") });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await page.locator(".pointing-instruction").evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(page.locator(".pointing-instruction")).toBeInViewport({ ratio: 1 });
    await expectNoRideIntersections(page);
    await expectReachable(page.getByRole("button", { name: "Play replay", exact: true }));
    await expectNoRideIntersections(page);
    await expectReachable(page.locator(".candidate-row").last());
    await playNow.focus();
    await expect(playNow).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".audio-title")).toContainText(LONG_NAME);
    const clips = await page.evaluate(() => (window as unknown as { __rideLayoutClips: string[] }).__rideLayoutClips);
    expect(clips).toHaveLength(3);
    expect(clips[0]).toContain("ride-test-clip-journey");
    expect(clips[1]).toContain("ride-test-clip-station");
    expect(clips[2]).toContain("ride-test-clip-ride-layout-1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
