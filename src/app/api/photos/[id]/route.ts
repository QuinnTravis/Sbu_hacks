import { createHmac, randomBytes } from "node:crypto";
import { database } from "@/lib/supabase";
import { placeIdSchema } from "@/lib/validation";
import type { Place } from "@/lib/types";

const ephemeralSecret = randomBytes(32).toString("hex");
const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!placeIdSchema.safeParse(id).success)
    return Response.json({ error: "Unknown place." }, { status: 400, headers });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !process.env.SUPABASE_SECRET_KEY)
    return Response.json(
      { error: "Photography is not connected yet." },
      { status: 503, headers },
    );
  if (process.env.NODE_ENV === "production" && !process.env.RATE_LIMIT_SECRET)
    return Response.json(
      { error: "Photography is temporarily unavailable." },
      { status: 503, headers },
    );
  try {
    const db = database();
    const { data: row, error } = await db
      .from("places")
      .select("data")
      .eq("id", id)
      .single();
    if (error || !row)
      return Response.json(
        { error: "Place not found." },
        { status: 404, headers },
      );
    const place = row.data as Place;
    // Proxy trust must be explicitly configured; otherwise use a conservative shared bucket.
    const client =
      process.env.TRUST_PROXY === "true"
        ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "shared"
        : "shared";
    const hash = createHmac(
      "sha256",
      process.env.RATE_LIMIT_SECRET || ephemeralSecret,
    )
      .update(client)
      .digest("hex");
    const budget = await database(true).rpc("consume_photo_budget", {
      p_client_hash: hash,
    });
    if (budget.error || budget.data !== true)
      return Response.json(
        { error: "Photo allowance reached. Try again later." },
        { status: 429, headers: { ...headers, "Retry-After": "3600" } },
      );
    // Resolve on demand: photo names expire and must not be stored or cached.
    const search = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.location,places.photos,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery: `${place.name}, New York`,
          pageSize: 1,
          locationBias: {
            circle: {
              center: { latitude: place.lat, longitude: place.lon },
              radius: 500,
            },
          },
        }),
      },
    );
    if (!search.ok) throw new Error(`Places search: ${search.status}`);
    const result = (await search.json()).places?.[0];
    const photo = result?.photos?.[0];
    if (
      !photo ||
      !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)
    )
      return Response.json(
        { error: "No photo available." },
        { status: 404, headers },
      );
    // Reject distant search matches instead of attaching a photograph of the wrong place.
    if (
      !result.location ||
      Math.abs(result.location.latitude - place.lat) > 0.006 ||
      Math.abs(result.location.longitude - place.lon) > 0.008
    )
      return Response.json(
        { error: "No matching photo available." },
        { status: 404, headers },
      );
    const media = await fetch(
      `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1000&skipHttpRedirect=true`,
      {
        headers: { "X-Goog-Api-Key": key },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!media.ok) throw new Error(`Places photo: ${media.status}`);
    const { photoUri } = await media.json();
    const imageUrl = new URL(photoUri);
    if (
      imageUrl.protocol !== "https:" ||
      !/(^|\.)googleusercontent\.com$/.test(imageUrl.hostname)
    )
      throw new Error("Unexpected photo host.");
    return Response.json(
      {
        url: photoUri,
        authors: photo.authorAttributions ?? [],
        googleMapsUri: photo.googleMapsUri || result.googleMapsUri,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Photo unavailable. Try again later." },
      { status: 502, headers },
    );
  }
}
