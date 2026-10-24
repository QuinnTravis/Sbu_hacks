import { readFile, rename, writeFile } from "node:fs/promises";
import {
  evidenceHash,
  mergeEvidence,
  searchEvidence,
  verifyPlace,
} from "../src/lib/verification";
import type { Place } from "../src/lib/types";

async function main() {
  if (!process.env.GEMINI_API_KEY)
    throw new Error(
      "Set GEMINI_API_KEY in .env.local before generating content.",
    );
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error("--limit must be 1–500.");
  const catalog: { places: Place[] } = JSON.parse(
    await readFile("public/data/places.json", "utf8"),
  );
  const pending = catalog.places
    .filter(
      (p) =>
        p.evidence.length &&
        (!p.story || p.story.evidenceHash !== evidenceHash(p.evidence)),
    )
    .slice(0, limit);
  let failed = 0;
  for (const place of pending) {
    try {
      const found = await searchEvidence(place).catch((error: unknown) => {
        console.error(
          `${place.id}: search skipped (${error instanceof Error ? error.message : "Wikipedia unavailable"})`,
        );
        return [];
      });
      place.evidence = mergeEvidence(place.evidence, found);
      if (!place.evidence.length)
        throw new Error("No evidence after search; refusing generation.");
      place.story = await verifyPlace(place);
      await writeFile("public/data/places.json.tmp", JSON.stringify(catalog));
      await rename("public/data/places.json.tmp", "public/data/places.json");
      console.log(`Verified ${place.name}: ${place.story.summary}`);
    } catch (error) {
      failed++;
      console.error(
        `${place.id}: ${error instanceof Error ? error.message : "Verification failed"}`,
      );
    }
  }
  console.log(
    `${pending.length - failed} published locally; ${failed} failed closed. Run content:publish to update Supabase.`,
  );
  if (failed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Content job failed.");
  process.exitCode = 1;
});
