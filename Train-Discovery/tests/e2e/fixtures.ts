import { test as base } from "@playwright/test";

export { expect, type Locator, type Page } from "@playwright/test";

/** On-demand story checks call paid search and model APIs; tests that need one mock it themselves. */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.route("**/api/story/**", (route) =>
      route.fulfill({ status: 404, json: { error: "story_unavailable" } }));
    await provide(context);
  },
});
