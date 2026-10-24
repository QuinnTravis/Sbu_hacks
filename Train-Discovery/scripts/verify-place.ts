import { createClient } from "@supabase/supabase-js";
import { placeSchema } from "../src/lib/storage";
import {
  mergeEvidence,
  searchEvidence,
  verifyPlace,
} from "../src/lib/verification";

async function main() {
  const idArg = process.argv.find((arg) => arg.startsWith("--id="));
  const id = idArg?.slice("--id=".length).trim();
  if (!id || id.length > 160)
    throw new Error("Pass one catalog ID with --id=<place-id>.");
  if (!process.env.SERPER_API_KEY)
    throw new Error("SERPER_API_KEY is required for this targeted search.");
  if (!process.env.GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is required for verification.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  const database = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error: readError } = await database
    .from("places")
    .select("id, data")
    .eq("id", id)
    .single();
  if (readError) throw new Error(`Could not load ${id}: ${readError.message}`);

  const place = placeSchema.parse(row.data);
  if (place.id !== id) throw new Error("Catalog ID and place payload do not match.");
  const found = await searchEvidence(place);
  place.evidence = mergeEvidence(found, place.evidence);
  if (!place.evidence.length)
    throw new Error(`No source passages found for ${id}; refusing to publish.`);
  place.story = await verifyPlace(place);

  const { data: updated, error: writeError } = await database
    .from("places")
    .update({ data: place })
    .eq("id", id)
    .select("id")
    .single();
  if (writeError) throw new Error(`Could not save ${id}: ${writeError.message}`);
  if (updated.id !== id) throw new Error("Updated row ID did not match the requested place.");
  console.log(`Verified and saved ${place.name} (${id}): ${place.story.summary}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Place verification failed.");
  process.exitCode = 1;
});
