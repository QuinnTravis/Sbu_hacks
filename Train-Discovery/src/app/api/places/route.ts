import { database } from "@/lib/supabase";
import { nearbySchema } from "@/lib/validation";

export async function GET(request: Request) {
  const parsed = nearbySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Choose an LIRR route and a location on Long Island or in New York City.",
      },
      { status: 400 },
    );
  try {
    const { lat, lon, route } = parsed.data;
    const { data, error } = await database().rpc("nearby_places", {
      p_lat: lat,
      p_lon: lon,
      p_route: route,
    });
    if (error) throw error;
    return Response.json(
      { places: (data ?? []).map((row: { data: unknown }) => row.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Nearby places are temporarily unavailable. Your discoveries are still saved.",
      },
      { status: 503 },
    );
  }
}
