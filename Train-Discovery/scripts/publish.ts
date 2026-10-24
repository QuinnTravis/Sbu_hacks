import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import type { Place, RailData } from "../src/lib/types";

export async function publish() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.",
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rail: RailData = JSON.parse(
    await readFile("public/data/lirr.json", "utf8"),
  );
  const { places }: { places: Place[] } = JSON.parse(
    await readFile("public/data/places.json", "utf8"),
  );
  const { data, error } = await db.rpc("refresh_catalog", {
    p_places: places,
    p_routes: rail.routes,
  });
  if (error) throw error;
  console.log(
    `Atomically published ${data} places and ${rail.routes.length} routes.`,
  );
}
publish().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Database publish failed.",
  );
  process.exitCode = 1;
});
