import { database } from "@/lib/supabase";
import { staticJourney } from "@/lib/network-data";
import { LOCALES } from "@/locales";
import { networkForRoute } from "@/networks";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const network = networkForRoute(id);
  if (!network)
    return Response.json({ error: "Unknown route." }, { status: 400 });
  if (network.id === "california-zephyr") {
    const requested = new URL(request.url).searchParams.get("locale");
    const locale = LOCALES.some((l) => l.code === requested) ? requested : "en";
    const journey = staticJourney(id, locale);
    if (!journey) return Response.json({ error: "Unknown route." }, { status: 404 });
    return Response.json(journey, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  }
  try {
    const { data, error } = await database()
      .from("places")
      .select("data")
      .contains("route_ids", [id])
      .limit(2000);
    if (error) throw error;
    return Response.json(
      {
        places: (data ?? []).map((row) => row.data),
        updatedAt: new Date().toISOString(),
        networkId: network.id,
        routeId: id,
      },
      { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } },
    );
  } catch {
    return Response.json(
      {
        error: "Could not load this journey. Check your connection and retry.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
