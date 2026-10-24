import { database } from "@/lib/supabase";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^(?:[1-9]|1[0-3])$/.test(id))
    return Response.json({ error: "Unknown LIRR route." }, { status: 400 });
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
