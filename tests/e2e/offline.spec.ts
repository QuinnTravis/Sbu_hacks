import { expect, test } from "@playwright/test";

test("installed shell and downloaded journey reopen offline", async ({
  browser,
}) => {
  // Real Supabase catalog; mocked-provider tests in journey.spec.ts stay independent.
  test.skip(
    !process.env.TEST_LIVE_DATABASE,
    "Set TEST_LIVE_DATABASE=1 for the provisioned Supabase integration.",
  );
  const context = await browser.newContext({
    serviceWorkers: "allow",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.getByRole("button", { name: "Try a replay" }).click();
  await expect(page.locator(".nearby-status")).not.toContainText(
    "Loading places",
  );
  await expect
    .poll(async () =>
      page.evaluate(async () =>
        (await caches.open("train-discovery-v2-journeys"))
          .keys()
          .then((keys) => keys.length),
      ),
    )
    .toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Port Jefferson", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Offline", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Cached", { exact: true })).toBeVisible();
  await context.close();
});
