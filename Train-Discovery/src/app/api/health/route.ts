import { database } from "@/lib/supabase";

export async function GET() {
  try {
    const { count, error } = await database()
      .from("places")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return Response.json(
      {
        status: "ok",
        places: count,
        photography: Boolean(
          process.env.GOOGLE_PLACES_API_KEY && process.env.SUPABASE_SECRET_KEY,
        ),
        verification: Boolean(process.env.GEMINI_API_KEY),
        audio: Boolean(process.env.ELEVENLABS_API_KEY && process.env.SUPABASE_SECRET_KEY),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
