import { expect, test } from "@playwright/test";
import rail from "../../public/data/lirr.json";
import { demoPath } from "../../src/lib/demo";
import { destination, pointingConeRing } from "../../src/lib/geo";
import type { Place, RailRoute } from "../../src/lib/types";

const { path, startIndex } = demoPath(rail.routes.find((route) => route.id === "10") as RailRoute);
const origin = { lat: path[startIndex][0], lon: path[startIndex][1] };
const places: Place[] = [0, 90, 180, 270].map((angle) => ({
  ...destination(origin, angle, 1190),
  id: `cardinal-${angle}`,
  name: `Catalog place ${angle}`,
  category: "History",
  routeIds: ["10"],
  sourceUrl: "https://example.org/catalog",
  tags: {},
  evidence: [],
}));
places.push({ ...places[0], ...destination(origin, 0, 1210), id: "out-of-range", name: "Outside radius" });

for (const viewport of [{ width: 320, height: 740 }, { width: 660, height: 560 }]) {
  test(`catalog markers and full rotating cone fit ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    const { MercatorCoordinate } = await import("maplibre-gl");
    await page.setViewportSize(viewport);
    await page.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: {
      version: 8,
      sources: { fixture: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: "Fixture basemap" } },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#eaedf3" } },
        { id: "fixture", type: "circle", source: "fixture" },
      ],
    } }));
    await page.route("**/api/journeys/**", (route) => route.fulfill({ json: { places } }));
    await page.route("**/api/audio", (route) => route.fulfill({ status: 503, json: { error: "fixture" } }));
    await page.goto("/?network=lirr&dev");
    const panel = page.getByRole("complementary", { name: "Developer controls" });
    await panel.getByRole("button", { name: "Start Jamaica demo", exact: true }).click();
    await panel.getByRole("button", { name: "Pause train", exact: true }).click();
    await panel.getByRole("button", { name: "Reset train to Jamaica", exact: true }).click();
    await page.getByLabel("Heading", { exact: true }).selectOption("manual");
    const joystick = page.getByRole("slider", { name: "Simulated phone heading" });
    await joystick.focus();
    await joystick.press("Home");
    await panel.getByRole("button", { name: "Close dev panel", exact: true }).click();

    const dots = page.locator(".ride-place-dot");
    await expect(dots).toHaveCount(4);
    await expect(page.locator('[data-place-id="out-of-range"]')).toHaveCount(0);
    await expect(page.locator('[data-place-id="cardinal-0"]')).toHaveAttribute("data-pointed", "true");
    await expect(page.locator('[data-place-id="cardinal-90"]')).toHaveAttribute("data-pointed", "false");
    await expect(page.locator('[data-place-id="cardinal-0"]')).toHaveAttribute("title", "Catalog place 0");
    await expect(page.getByRole("img", { name: "Catalog place 0, in pointing cone", exact: true })).toBeVisible();
    await expect(page.locator(".nav-count")).toHaveText("0");

    // Derive the actual rendered camera scale from two DOM markers. This checks
    // MapLibre's projection, rather than repeating the zoom helper's formula.
    await expect.poll(async () => {
      const frame = await page.locator(".ride-map-canvas").boundingBox();
      const rider = await page.locator(".rider-dot").boundingBox();
      const east = await page.locator('[data-place-id="cardinal-90"]').boundingBox();
      if (!frame || !rider || !east) return false;
      const center = { x: rider.x + rider.width / 2, y: rider.y + rider.height / 2 };
      const start = MercatorCoordinate.fromLngLat([origin.lon, origin.lat]);
      const eastWorld = MercatorCoordinate.fromLngLat([places[1].lon, places[1].lat]);
      const scale = (east.x + east.width / 2 - center.x) / (eastWorld.x - start.x);
      if (Math.abs(center.x - frame.x - frame.width / 2) > 1 || Math.abs(center.y - frame.y - frame.height / 2) > 1) return false;
      return [0, 45, 90, 135, 180, 225, 270, 315].every((heading) =>
        pointingConeRing(origin, heading).every((point) => {
          const projected = MercatorCoordinate.fromLngLat([point.lon, point.lat]);
          const x = center.x + (projected.x - start.x) * scale;
          const y = center.y + (projected.y - start.y) * scale;
          return x >= frame.x + 8 && x <= frame.x + frame.width - 8 && y >= frame.y + 8 && y <= frame.y + frame.height - 8;
        }),
      );
    }).toBe(true);
    for (const place of places.slice(0, 4)) await expect(page.locator(`[data-place-id="${place.id}"]`)).toBeInViewport();
    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await attribution.locator(".maplibregl-ctrl-attrib-button").click();
    await expect(attribution).toContainText("Fixture basemap");
    await page.screenshot({ path: info.outputPath("ride-map-points.png") });

    await page.getByRole("button", { name: "Open dev panel", exact: true }).click();
    await page.getByLabel("Heading", { exact: true }).selectOption("phone");
    await panel.getByRole("button", { name: "Close dev panel", exact: true }).click();
    await expect(page.locator('.ride-place-dot[data-pointed="true"]')).toHaveCount(0);
    await expect(dots).toHaveCount(4);
  });
}
