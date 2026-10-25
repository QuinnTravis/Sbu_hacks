import { expect, test, type Locator, type Page } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname.startsWith("/api/journeys/")) {
      return route.fulfill({ json: { places: Array.from({ length: 8 }, (_, i) => ({
        id: `dev-visual-${i}`,
        name: `Jamaica developer test landmark ${i + 1} with a long museum name`,
        lat: 40.7002 + i * 0.0003,
        lon: -73.80853,
        category: "History",
        routeIds: ["10"],
        sourceUrl: "https://www.openstreetmap.org/node/7654",
        tags: {},
        evidence: [],
      })) } });
    }
    return route.fulfill({ status: 503, json: { error: "visual_test_provider_disabled" } });
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: info.outputPath("failure.png") });
  }
});

async function startPausedDemo(page: Page) {
  await page.goto("/?network=lirr&dev");
  const panel = page.getByRole("complementary", { name: "Developer controls" });
  await panel.getByRole("button", { name: "Start Jamaica demo", exact: true }).click();
  await panel.getByRole("button", { name: "Pause train", exact: true }).click();
  await expect(panel.getByTestId("dev-coordinates")).not.toHaveText("Waiting");
  await expect(panel.locator(".dev-pois button")).toHaveCount(8);
  return panel;
}

async function expectCenterReachable(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  expect(await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }), "Control center must receive pointer input").toBe(true);
}

async function expectPanelGeometry(panel: Locator, page: Page) {
  const viewport = page.viewportSize()!;
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = await panel.locator('button, select, input[type="range"]').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") || element.textContent?.trim(), width: box.width, height: box.height };
    }),
  );
  expect(controls.length).toBeGreaterThan(2);
  for (const control of controls) {
    expect(control.width, `${control.name} width`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.name} height`).toBeGreaterThanOrEqual(44);
  }
  const joystick = panel.getByRole("slider", { name: "Simulated phone heading" });
  const joystickBox = (await joystick.boundingBox())!;
  expect(joystickBox.width).toBeGreaterThanOrEqual(44);
  expect(joystickBox.height).toBeGreaterThanOrEqual(44);
  expect(joystickBox.x).toBeGreaterThanOrEqual(box.x);
  expect(joystickBox.x + joystickBox.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
}

for (const viewport of [
  { width: 320, height: 667 },
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 740, height: 360 },
]) {
  test(`full and compact panel targets and scrolled header at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const panel = await startPausedDemo(page);
    await panel.getByLabel("Heading", { exact: true }).selectOption("manual");
    await expectPanelGeometry(panel, page);
    const lastTarget = panel.locator(".dev-pois button").last();
    await lastTarget.scrollIntoViewIfNeeded();
    await expectCenterReachable(lastTarget);
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const close = panel.getByRole("button", { name: "Close dev panel", exact: true });
    const compact = panel.getByRole("button", { name: "Compact dev controls", exact: true });
    await expectCenterReachable(close);
    await expectCenterReachable(compact);
    await page.screenshot({ path: info.outputPath("full-scrolled.png") });

    await compact.click();
    await expect(panel).toHaveClass(/dev-compact/);
    await expectPanelGeometry(panel, page);
    await panel.getByRole("button", { name: "Play train", exact: true }).scrollIntoViewIfNeeded();
    await expectCenterReachable(panel.getByRole("button", { name: "Play train", exact: true }));
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const expand = panel.getByRole("button", { name: "Expand dev controls", exact: true });
    await expectCenterReachable(close);
    await expectCenterReachable(expand);
    await page.screenshot({ path: info.outputPath("compact-scrolled.png") });
    await expand.click();
    await expect(panel).not.toHaveClass(/dev-compact/);
    await close.click();
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("Backquote");
    await expect(panel).toBeVisible();
    await expectCenterReachable(panel.getByRole("button", { name: "Close dev panel", exact: true }));
  });
}

test("movement, station jump, heading keyboard and compact playback preserve state", async ({ page }) => {
  const panel = await startPausedDemo(page);
  // The demo moves before Pause can be clicked. Establish the reset location as the baseline.
  await panel.getByRole("button", { name: "Reset train to Jamaica", exact: true }).click();
  const coordinates = panel.getByTestId("dev-coordinates");
  const original = await coordinates.innerText();
  const position = panel.getByRole("slider", { name: "Route position", exact: true });
  const initialProgress = Number(await position.inputValue());
  await panel.getByRole("slider", { name: "Train speed", exact: true }).fill("120");
  await expect(panel.locator(".dev-slider output").first()).toHaveText("120 km/h");
  await panel.getByRole("button", { name: "+250 m", exact: true }).click();
  await expect(coordinates).not.toHaveText(original);
  expect(Number(await position.inputValue())).toBeCloseTo(initialProgress + 250, 0);
  await panel.getByRole("button", { name: "−250 m", exact: true }).click();
  await expect(coordinates).toHaveText(original);
  await position.fill(String(Math.round(initialProgress + 1000)));
  await expect(coordinates).not.toHaveText(original);
  await panel.getByRole("button", { name: "Reset train to Jamaica", exact: true }).click();
  await expect(coordinates).toHaveText(original);
  await panel.getByRole("button", { name: "Direction →", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Direction ←", exact: true })).toBeVisible();
  // Reset starts at the end of the reverse path; restore forward motion so
  // the later playback check does not immediately stop at that endpoint.
  await panel.getByRole("button", { name: "Direction ←", exact: true }).click();
  const station = panel.getByLabel("Jump to", { exact: true });
  const destination = await station.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).find((value) => value && Number(value) > 1000),
  );
  expect(destination).toBeTruthy();
  await station.selectOption(destination!);
  expect(Number(await position.inputValue())).toBeCloseTo(Number(destination), 0);
  await panel.getByRole("button", { name: "Reset train to Jamaica", exact: true }).click();
  await panel.getByLabel("Heading", { exact: true }).selectOption("manual");
  const joystick = panel.getByRole("slider", { name: "Simulated phone heading" });
  for (const [key, value] of [["End", "355"], ["ArrowRight", "0"], ["ArrowUp", "5"], ["ArrowLeft", "0"], ["ArrowDown", "355"], ["Home", "0"]]) {
    await joystick.press(key);
    await expect(joystick).toHaveAttribute("aria-valuenow", value);
  }
  const tilt = panel.getByRole("slider", { name: "Phone tilt", exact: true });
  await tilt.fill("0");
  await expect(panel.getByTestId("dev-detection")).toHaveText("Paused — check sensors / tilt");
  await tilt.fill("90");
  await panel.getByRole("button", { name: "Compact dev controls", exact: true }).click();
  await expect(panel.getByLabel("Heading", { exact: true })).toHaveValue("manual");
  await joystick.press("End");
  await joystick.press("ArrowRight");
  await expect(joystick).toHaveAttribute("aria-valuenow", "0");
  await panel.getByRole("button", { name: "Play train", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Pause train", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Pause train", exact: true }).click();
  await panel.getByRole("button", { name: "Close dev panel", exact: true }).click();
  await page.keyboard.press("Backquote");
  await expect(panel).toHaveClass(/dev-compact/);
  await expect(joystick).toHaveAttribute("aria-valuenow", "0");
  await panel.getByRole("button", { name: "Expand dev controls", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "Train speed", exact: true })).toHaveValue("120");
});
