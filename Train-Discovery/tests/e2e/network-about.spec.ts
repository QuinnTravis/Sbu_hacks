import { expect, test } from "@playwright/test";

// These checks use the existing server and never contact paid providers.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { error: "acceptance_provider_disabled" } }),
  );
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true });
  }
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
]) {
  test(`map tracks and station labels fit at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?network=lirr");
    const map = page.getByRole("group", { name: "Interactive LIRR route map" });
    await expect(map).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const geometry = await map.evaluate((element) => {
      const svg = element as SVGSVGElement;
      const box = svg.viewBox.baseVal;
      const tracks = [...svg.querySelectorAll<SVGPolylineElement>(".network-route-line")];
      return {
        count: tracks.length,
        outside: tracks.flatMap((track) => {
          const points = Array.from({ length: track.points.numberOfItems }, (_, i) => track.points.getItem(i));
          return points.filter((p) => p.x < box.x || p.x > box.x + box.width || p.y < box.y || p.y > box.y + box.height)
            .map((p) => ({ x: p.x, y: p.y }));
        }),
        labels: [...svg.querySelectorAll(".station-label text")].map((label) => {
          const rect = label.getBoundingClientRect();
          return { name: label.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }),
      };
    });
    expect(geometry.count).toBeGreaterThan(12);
    expect(geometry.outside, "Every projected track point must fit the SVG viewBox").toEqual([]);
    expect(geometry.labels).toHaveLength(8);
    for (const label of geometry.labels) {
      expect(label.left, `${label.name} left`).toBeGreaterThanOrEqual(0);
      expect(label.right, `${label.name} right`).toBeLessThanOrEqual(viewport.width);
      expect(label.top, `${label.name} top`).toBeGreaterThanOrEqual(0);
      expect(label.bottom, `${label.name} bottom`).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`About layout, sources, contrast and Back at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/about");
    const document = page.locator(".about-document");
    const back = page.getByRole("link", { name: "Back to your ride" });
    await expect(back).toBeVisible();
    const backBox = await back.boundingBox();
    expect(backBox!.height).toBeGreaterThanOrEqual(44);
    expect(backBox!.width).toBeGreaterThanOrEqual(44);
    expect((await document.boundingBox())!.width).toBeLessThanOrEqual(660);
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const links = await document.locator("p a").evaluateAll((elements) => {
      const rgba = (value: string) => {
        const channels = value.match(/[\d.]+/g)!.map(Number);
        return [channels[0], channels[1], channels[2], channels[3] ?? 1];
      };
      const luminance = (rgb: number[]) => rgb.slice(0, 3).map((n) => {
        const c = n / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      return elements.map((element) => {
        const ancestors: Element[] = [];
        for (let parent: Element | null = element; parent; parent = parent.parentElement) ancestors.unshift(parent);
        let background = [255, 255, 255];
        for (const parent of ancestors) {
          const color = rgba(getComputedStyle(parent).backgroundColor);
          background = background.map((c, i) => color[i] * color[3] + c * (1 - color[3]));
        }
        const style = getComputedStyle(element);
        const color = rgba(style.color);
        const foreground = background.map((c, i) => color[i] * color[3] + c * (1 - color[3]));
        const a = luminance(foreground), b = luminance(background);
        return { text: element.textContent, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), decoration: style.textDecorationLine };
      });
    });
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) {
      expect(link.contrast, `${link.text} contrast`).toBeGreaterThanOrEqual(4.5);
      expect(link.decoration, `${link.text} link distinction`).toContain("underline");
    }

    await page.goto("/about#sources");
    await expect(page.locator("#sources")).toBeInViewport();
    await expect(page.locator("#sources")).toHaveText("Data sources");
    await expect(back).toHaveAttribute("href", "/");
    await back.focus();
    await expect(back).toBeFocused();
    expect(await back.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "California Zephyr" })).toBeVisible();
  });
}

test("map routes support Enter and Space selection with a visible focus treatment", async ({ page }) => {
  await page.goto("/?network=lirr");
  const map = page.getByRole("group", { name: "Interactive LIRR route map" });
  for (const [name, key] of [["Babylon Branch", "Enter"], ["Port Jefferson Branch", "Space"]]) {
    const route = map.getByRole("button", { name: `Select ${name}`, exact: true });
    await route.focus();
    await expect(route).toBeFocused();
    await expect(route.locator(".train-network-routeOutline").first()).toHaveCSS("visibility", "visible");
    await page.keyboard.press(key);
    await expect(route).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#route-sheet-title")).toHaveText(name.replace(" Branch", ""));
    await expect(page.getByRole("button", { name: "Start ride", exact: true })).toBeEnabled();
  }
});

test("mocked Greenport GPS renders a marker near the top of the map, inside its bounds", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.103, longitude: -72.359, accuracy: 5 });
  await page.goto("/?network=lirr");
  await expect(page.locator(".network-user .location-dot")).toHaveCount(0);
  await page.getByRole("button", { name: "Find routes near me" }).click();
  await expect(page.getByRole("heading", { name: "Routes near you" })).toBeVisible();
  const marker = page.locator(".network-user .location-dot");
  await expect(marker).toHaveCount(1);
  const geometry = await marker.evaluate((element) => {
    const circle = element as SVGCircleElement;
    const box = circle.ownerSVGElement!.viewBox.baseVal;
    return { x: circle.cx.baseVal.value, y: circle.cy.baseVal.value, minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
  });
  // Greenport is the network's northernmost stop, so it sits in the top tenth of the map.
  expect(geometry.y).toBeLessThan(geometry.minY + (geometry.maxY - geometry.minY) * 0.1);
  expect(geometry.y).toBeGreaterThanOrEqual(geometry.minY);
  expect(geometry.y).toBeLessThanOrEqual(geometry.maxY);
  expect(geometry.x).toBeGreaterThanOrEqual(geometry.minX);
  expect(geometry.x).toBeLessThanOrEqual(geometry.maxX);
});
