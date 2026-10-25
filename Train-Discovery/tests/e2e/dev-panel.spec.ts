import { expect, test } from "./fixtures";

test("dev panel controls movement, joystick detection, tilt, and phone mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", {
      configurable: true,
      value: async () => "granted",
    });
  });
  await page.route("**/api/journeys/10", (r) =>
    r.fulfill({
      json: {
        places: [
          {
            id: "osm-node-7654",
            name: "Jamaica test landmark",
            lat: 40.704,
            lon: -73.80853,
            category: "History",
            routeIds: ["10"],
            sourceUrl: "https://www.openstreetmap.org/node/7654",
            tags: {},
            evidence: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/photos/**", (r) =>
    r.fulfill({ status: 503, json: { error: "Not configured" } }),
  );
  await page.goto("/?network=lirr&dev");
  const panel = page.getByRole("complementary", { name: "Developer controls" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Start Jamaica demo" }).click();
  await panel.getByRole("button", { name: "Pause train" }).click();
  await page.getByLabel("Heading", { exact: true }).selectOption("manual");
  const joystick = page.getByRole("slider", {
    name: "Simulated phone heading",
  });
  await joystick.focus();
  await joystick.press("End");
  await expect(joystick).toHaveAttribute("aria-valuenow", "355");
  await joystick.press("ArrowRight");
  await expect(joystick).toHaveAttribute("aria-valuenow", "0");
  const box = await joystick.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 12, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(joystick).toHaveAttribute("aria-valuenow", "90");
  await joystick.focus();
  await joystick.press("Home");
  await panel.getByRole("button", { name: "Close dev panel", exact: true }).click();
  await page.getByRole("button", { name: /Jamaica test landmark,/ }).click();
  await expect(
    page.getByRole("heading", { name: "Jamaica test landmark" }),
  ).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Backquote");
  await expect(panel).toBeVisible();
  const coords = panel.getByTestId("dev-coordinates");
  const before = await coords.innerText();
  await panel.getByRole("button", { name: "+250 m", exact: true }).click();
  await expect(coords).not.toHaveText(before);
  const advanced = await coords.innerText();
  await panel.getByRole("button", { name: "Reset train to Jamaica" }).click();
  await expect(coords).not.toHaveText(advanced);
  const reset = (await coords.innerText()).split(", ").map(Number);
  const original = before.split(", ").map(Number);
  expect(Math.abs(reset[0] - original[0])).toBeLessThan(0.0003);
  expect(Math.abs(reset[1] - original[1])).toBeLessThan(0.0003);
  await page.getByRole("slider", { name: "Phone tilt" }).fill("0");
  await expect(
    panel.getByText("Paused — check sensors / tilt", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Jamaica test landmark" }),
  ).toBeVisible();
  await page.getByLabel("Heading", { exact: true }).selectOption("phone");
  await expect(
    panel.locator("dd").filter({ hasText: /^Phone compass$/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated train · phone compass", { exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await panel
    .getByRole("button", { name: "Close dev panel", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Backquote");
  await expect(panel).toBeVisible();
});
