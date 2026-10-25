/**
 * Write and check stories for a static route package (F2). Each story has a
 * summary, an interesting fact, and a spoken script (hook, detail, why, and
 * an optional look-for phrase); every sentence carries an exact quote that a
 * second model verifies. Unsupported sentences are dropped; a place with no
 * supported summary keeps no story and is narrated from basic facts or not at all.
 *
 *   npm run content:network -- --limit=30
 *   npm run content:network -- --id=wd-Q3318219 --force
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import { evidenceHash, verifyPlace } from "../src/lib/verification";
import type { Place } from "../src/lib/types";

const FILE = "public/data/networks/california-zephyr/places/cz-rockies.json";
// Places the demo passes or points at go first, so a quota cut still covers them.
const DEMO_FIRST = [
  "Denver Union Station", "Moffat Tunnel", "Rollins Pass", "Winter Park Resort station", "Fraser–Winter Park station",
  "Winter Park", "Fraser", "Granby station", "Granby", "Colorado River", "Fraser River", "Hot Sulphur Springs",
  "Byers Canyon", "Kremmling", "Gore Canyon", "State Bridge", "Dotsero", "Eagle River", "Glenwood Canyon",
  "Hanging Lake", "Glenwood Springs station", "Glenwood Springs", "Hotel Colorado", "Glenwood Caverns",
  "Roaring Fork River", "South Platte River", "Arvada", "Eldorado Canyon State Park", "James Peak", "Blue River",
];
const PACE_MS = 13_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argument(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY in .env before generating stories.");
  const limit = Number(argument("limit") ?? 200);
  const only = argument("id");
  const force = process.argv.includes("--force");
  const catalog: { places: Place[] } = JSON.parse(await readFile(FILE, "utf8"));
  const rank = (place: Place) => {
    const index = DEMO_FIRST.indexOf(place.name);
    return index >= 0 ? index : DEMO_FIRST.length + (place.kind === "poi" ? 0 : 100) - Math.min(50, place.fame ?? 0);
  };
  const pending = catalog.places
    .filter((place) => place.evidence.length > 0)
    .filter((place) => (only ? place.id === only : true))
    .filter((place) => force || !place.story?.narration || place.story.evidenceHash !== evidenceHash(place.evidence))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
  console.log(`${pending.length} places to write and verify`);
  let done = 0;
  let failed = 0;
  for (const place of pending) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const story = await verifyPlace(place, 90_000, { narration: true });
        place.story = story;
        done += 1;
        await writeFile(`${FILE}.tmp`, JSON.stringify(catalog));
        await rename(`${FILE}.tmp`, FILE);
        const parts = Object.keys(story.narration ?? {}).join("+") || "summary only";
        console.log(`✓ ${place.name} (${parts})`);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/429|quota|rate/i.test(message) && attempt < 2) {
          console.log(`… rate limited on ${place.name}; waiting a minute`);
          await sleep(65_000);
          continue;
        }
        failed += 1;
        console.log(`✗ ${place.name}: ${message.slice(0, 160)}`);
        break;
      }
    }
    await sleep(PACE_MS);
  }
  console.log(`${done} verified, ${failed} failed closed`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
