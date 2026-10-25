import { expect, test, type Page } from "./fixtures";

// Three highlights beside the straight stretch north of Denver (km 1–5.6 of
// the Rockies segment). Geometry is fixed so sides and counts are known.
const along = (km: number) => {
  const t = (km - 1.045) / (5.608 - 1.045);
  return { lat: 39.760757 + (39.796355 - 39.760757) * t, lon: -104.993051 + (-104.998066 + 104.993051) * t };
};
const fixture = (id: string, name: string, routeKm: number, signedLateralM: number, category: string) => ({
  id, name, ...along(routeKm), category, routeIds: ["cz-rockies"], kind: "poi",
  wikipedia: name, wikidata: "Q1", fame: 20, routeKm, signedLateralM, lateralM: Math.abs(signedLateralM),
  sourceUrl: "https://www.wikidata.org/wiki/Q1", tags: {}, evidence: [],
  basic: { type: "historic", sources: [{ title: "Wikidata Q1", url: "https://www.wikidata.org/wiki/Q1", license: "CC0" }] },
});
const places = [
  fixture("wd-Q9000001", "Fixture Depot", 3, 600, "Railroad heritage"),
  fixture("wd-Q9000002", "Fixture Hall", 4, -800, "Heritage"),
  fixture("wd-Q9000003", "Fixture Peak", 5, -1500, "Mountain"),
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/journeys/cz-rockies*", (route) => route.fulfill({
    json: {
      places, updatedAt: "2026-10-25T00:00:00Z", networkId: "california-zephyr", routeId: "cz-rockies",
      timetable: [{ stopId: "DEN", km: 0, minutes: 0 }, { stopId: "GSC", km: 296.9, minutes: 363 }],
      connectivity: [], airQuality: null, history: [], models: [], thumbnails: {}, locale: "en", clips: {},
    },
  }));
  await page.route("**/api/photos/**", (route) => route.fulfill({ status: 503, json: { error: "test_no_photo" } }));
  await page.route("**/api/audio", (route) => route.fulfill({ status: 503, json: { error: "test_device_fallback" } }));
});

async function openAdvisor(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "California Zephyr", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Start Denver demo ride" }).click();
  const sheet = page.getByRole("dialog", { name: "Best side to sit" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the Zephyr is the default network and The Rockies is the full experience", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "California Zephyr", level: 1 })).toBeVisible();
  await expect(page.getByRole("group", { name: "Interactive California Zephyr route map" })).toBeVisible();
  await page.getByRole("button", { name: "Expand route list" }).click();
  await page.getByRole("button", { name: "All routes" }).click();
  await expect(page.locator(".route-row")).toHaveCount(6);
  const rockies = page.locator(".route-row").filter({ hasText: "The Rockies" });
  await expect(rockies).toContainText("Full experience");
  await expect(page.locator(".route-row").filter({ hasText: "The Sierra" })).toContainText("Stations only");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("best side to sit counts highlights per side and flips for a backward seat", async ({ page }) => {
  const sheet = await openAdvisor(page);
  await expect(sheet.getByRole("status").filter({ hasText: "Right side" })).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Right side" })).toContainText("2 highlights");
  await expect(sheet.getByRole("region", { name: "Left side" })).toContainText("1 highlight");
  await expect(sheet.getByText("If you sit facing backward, sides flip.", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Facing backward" }).click();
  await expect(sheet.getByRole("status").filter({ hasText: "Left side" })).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Left side" })).toContainText("2 highlights");
  await sheet.getByRole("button", { name: "Facing forward" }).click();
  await sheet.getByRole("button", { name: "Toward Denver" }).click();
  await expect(sheet.getByRole("button", { name: "Toward Denver" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Toward Glenwood Springs" }).click();
  await sheet.getByRole("button", { name: "Start ride" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The Rockies", level: 1 })).toBeVisible();
  await expect(page.locator(".ride-heading p")).toContainText("Simulated");
});

test("a look-ahead pill names the side, and a bookmarked upcoming place persists", async ({ page }) => {
  const sheet = await openAdvisor(page);
  await sheet.getByRole("button", { name: "Start ride" }).click();
  const pill = page.getByRole("region", { name: "Coming up" });
  await expect(pill).toContainText("Fixture Depot", { timeout: 10000 });
  await expect(pill).toContainText("On your left");
  await page.getByRole("button", { name: "Pause replay" }).click();
  await pill.getByRole("button", { name: "Bookmark Fixture Depot" }).click();
  await expect(pill).toContainText("You saved this");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Bookmarks" }).click();
  const row = page.getByRole("button", { name: "Open Fixture Depot" });
  await expect(row).toContainText("Upcoming");
  await page.reload();
  await nav.getByRole("button", { name: "Bookmarks" }).click();
  await expect(page.getByRole("button", { name: "Open Fixture Depot" })).toBeVisible();
  await page.getByRole("button", { name: "Open Fixture Depot" }).click();
  await expect(page.getByRole("heading", { name: "Fixture Depot" })).toBeVisible();
  await expect(page.getByText("Basic info")).toBeVisible();
});

test("a story checked on demand replaces basic info on the card", async ({ page }) => {
  const text = "Fixture Depot was built in 1906 for the Denver railway.";
  const evidence = [{ id: "web-a", title: "Depot history", url: "https://example.org/depot", text, retrievedAt: "2026-10-25T00:00:00Z", license: "example.org" }];
  const story = {
    summary: text, claims: [{ text, evidenceId: "web-a", quote: text }],
    verifiedAt: "2026-10-25T00:00:00Z", generator: "test", verifier: "agreement:2-sites", evidenceHash: "test",
  };
  await page.route("**/api/story/wd-Q9000001", (route) => route.fulfill({ json: { story, evidence } }));
  const sheet = await openAdvisor(page);
  await sheet.getByRole("button", { name: "Start ride" }).click();
  const pill = page.getByRole("region", { name: "Coming up" });
  await expect(pill).toContainText("Fixture Depot", { timeout: 10000 });
  await page.getByRole("button", { name: "Pause replay" }).click();
  await pill.getByRole("button", { name: /^Open Fixture Depot/ }).click();
  await expect(page.locator(".story-summary").first()).toContainText("built in 1906");
  await expect(page.getByText("Basic info")).toHaveCount(0);
});

test("the interface switches to Spanish and Chinese and remembers the choice", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { name: "Ajustes", level: 1 })).toBeVisible();
  const navEs = page.getByRole("navigation", { name: "Navegación principal" });
  for (const label of ["Viaje", "Descubrimientos", "Marcadores", "Ajustes"])
    await expect(navEs.getByRole("button", { name: label })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(navEs.getByRole("button", { name: "Marcadores" })).toBeVisible();
  await navEs.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("radio", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  const navZh = page.getByRole("navigation", { name: "主导航" });
  await expect(navZh.getByRole("button", { name: "收藏" })).toBeVisible();
  await navZh.getByRole("button", { name: "旅程" }).click();
  await expect(page.getByRole("button", { name: "从Denver开始演示旅程" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
