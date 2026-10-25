import { test, expect, type Page } from "./fixtures";

const longName =
  "King Manor Museum and Rufus King Historic House in Jamaica, Queens";
const places = [
  longName,
  "Queens Railway Museum",
  "Jamaica Heritage Park",
  "Queens Historic House",
].map((name, i) => ({
  id: `sheet-${i}`,
  name,
  lat: 40.7002 + i * 0.00065,
  lon: -73.8085,
  category: "Art & culture",
  routeIds: ["10", "1"],
  sourceUrl: "https://www.openstreetmap.org/node/1",
  tags: {},
  evidence: [
    {
      id: `sheet-source-${i}`,
      title: name,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`,
      text: `${name} is a historic place in Queens, New York City. It preserves local history and welcomes museum visitors.`,
      license: "CC BY-SA",
      retrievedAt: "2026-10-24T00:00:00Z",
    },
  ],
}));

test.beforeEach(async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          fixture: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            attribution: "Fixture basemap",
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#eaedf3" },
          },
          { id: "fixture", type: "circle", source: "fixture" },
        ],
      },
    }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/journeys/"))
      return route.fulfill({ json: { places } });
    if (path.startsWith("/api/photos/"))
      return route.fulfill({
        json: {
          url:
            "data:image/svg+xml," +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#aebbc8"/></svg>',
            ),
          source: "Wikimedia Commons",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Fixture.jpg",
          authors: [],
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: "fixture_provider_disabled" },
    });
  });
});

async function start(page: Page) {
  await page.goto("/?network=lirr&dev");
  await page
    .getByRole("complementary", { name: "Developer controls" })
    .getByRole("button", { name: "Close dev panel", exact: true })
    .click();
  const badge = page.getByRole("button", {
    name: "Collapse Cache disabled badge",
  });
  if (await badge.isVisible()) await badge.click();
  await page
    .getByRole("button", { name: "Start a simulated ride from Jamaica", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await expect(page.locator(".poi-sheet")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await settled(page, false);
}

async function settled(page: Page, expanded: boolean) {
  await expect
    .poll(() =>
      page.locator(".poi-sheet").evaluate((element, isExpanded) => {
        const sheet = element as HTMLElement;
        const collapsed = Math.min(
          sheet.offsetHeight,
          parseFloat(
            getComputedStyle(sheet).getPropertyValue(
              "--poi-sheet-collapsed-height",
            ),
          ),
        );
        const target = isExpanded ? 0 : sheet.offsetHeight - collapsed;
        return (
          Math.abs(
            new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42 -
              target,
          ) < 0.5
        );
      }, expanded),
    )
    .toBe(true);
}

async function drag(page: Page, delta: number, touch = false) {
  const handle = page.locator(".poi-sheet__handle");
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 12; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (delta * i) / 12 }],
      });
    await page.waitForTimeout(120);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + delta, { steps: 12 });
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 420 },
  { width: 1366, height: 768 },
]) {
  test(`full map and persistent POI sheet at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await start(page);
    const map = page.locator(".ride-map-canvas"),
      sheet = page.locator(".poi-sheet");
    await expect
      .poll(async () => {
        const b = await map.boundingBox();
        return b
          ? Math.abs(b.width - viewport.width) < 1 &&
              Math.abs(b.height - viewport.height) < 1
          : false;
      })
      .toBe(true);
    await expect(page.locator(".candidate-row")).toHaveCount(4);
    await expect(sheet).toHaveAttribute("data-expanded", "false");
    await settled(page, false);
    await page.screenshot({ path: info.outputPath("chooser.png") });
    await page.locator(".candidate-row").filter({ hasText: longName }).click();
    await expect(sheet).toHaveAttribute("data-expanded", "true");
    await settled(page, true);
    await expect(
      sheet.getByRole("heading", { name: longName, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).locator(".nav-count")).toHaveText("1");
    await expect(page.locator(".ride-top-controls")).not.toBeVisible();
    await expect(page.locator(".ride-expanded-status")).toContainText(
      "Simulated ride",
    );
    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await attribution.locator(".maplibregl-ctrl-attrib-button").click();
    await expect(
      attribution.locator(".maplibregl-ctrl-attrib-inner"),
    ).toBeVisible();
    await expect(attribution).toContainText("Fixture basemap");
    const creditBox = (await attribution.boundingBox())!,
      sheetBox = (await sheet.boundingBox())!;
    expect(creditBox.y + creditBox.height).toBeLessThanOrEqual(sheetBox.y);
    await attribution.locator(".maplibregl-ctrl-attrib-button").click();
    await expect(page.locator(".ride-expanded-status")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Ride" }),
    ).toHaveAttribute("aria-current", "page");
    await sheet
      .getByRole("button", { name: `Bookmark ${longName}`, exact: true })
      .click();
    await expect(
      sheet.getByRole("button", {
        name: `Remove bookmark for ${longName}`,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await sheet.locator(".sources > summary").click();
    await expect(
      sheet
        .locator(".sources")
        .getByRole("link", { name: longName, exact: true }),
    ).toBeVisible();
    await sheet
      .getByRole("button", {
        name: `View photo details for ${longName}`,
        exact: true,
      })
      .click();
    const photo = page.getByRole("dialog", {
      name: `Photo of ${longName}`,
      exact: true,
    });
    await expect(photo).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(photo).not.toBeVisible();
    await expect(sheet).toHaveAttribute("aria-hidden", "false");
    await page.screenshot({ path: info.outputPath("selected.png") });
    // Reading survives a heading change; the discovery is not dismissed by moving.
    await page.keyboard.press("Backquote");
    await page.getByLabel("Heading", { exact: true }).selectOption("manual");
    await page
      .getByRole("slider", { name: "Simulated phone heading" })
      .press("End");
    await page
      .getByRole("complementary", { name: "Developer controls" })
      .getByRole("button", { name: "Close dev panel", exact: true })
      .click();
    await expect(
      sheet.getByRole("heading", { name: longName, exact: true }),
    ).toBeVisible();
    await sheet
      .getByRole("button", { name: "Collapse sheet", exact: true })
      .click();
    await expect(sheet).toHaveAttribute("data-expanded", "false");
    await settled(page, false);
    await expect(sheet.locator(".poi-summary")).toContainText(longName);
    await sheet.locator(".poi-summary").click();
    await expect(sheet).toHaveAttribute("data-expanded", "true");
    await settled(page, true);
    await sheet.locator(".poi-sheet__close").click();
    await expect(sheet).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).locator(".nav-count")).toHaveText("1");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).click();
    await expect(
      page
        .locator(".queue-panel")
        .getByRole("heading", { name: longName, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("sheet follows drag, snaps and dismisses without selecting a place", async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const sheet = page.locator(".poi-sheet");
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return b.y > 400;
    })
    .toBe(true);
  await drag(page, -230, isMobile);
  await expect(sheet).toHaveAttribute("data-expanded", "true");
  await settled(page, true);
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return b.y < 300;
    })
    .toBe(true);
  await drag(page, 230, isMobile);
  await expect(sheet).toHaveAttribute("data-expanded", "false");
  await settled(page, false);
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!;
      return b.y > 400;
    })
    .toBe(true);
  await drag(page, 150, isMobile);
  await expect(sheet).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).locator(".nav-count")).toHaveText("0");
});

test("reduced motion and keyboard sheet controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  const sheet = page.locator(".poi-sheet"),
    handle = sheet.locator(".poi-sheet__handle");
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveAttribute("data-expanded", "true");
  await settled(page, true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveAttribute("aria-hidden", "true");
  await expect(sheet).toHaveAttribute("inert", "");
});

test("cancelled touch drag returns to its prior snap point", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const handle = (await page.locator(".poi-sheet__handle").boundingBox())!;
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 90 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await session.detach();
  await expect(page.locator(".poi-sheet")).toHaveAttribute(
    "data-expanded",
    "false",
  );
  await settled(page, false);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Discoveries" }).locator(".nav-count")).toHaveText("0");
});
