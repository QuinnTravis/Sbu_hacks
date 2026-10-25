import { staticPlace } from "@/lib/network-data";
import { storyFor } from "@/lib/story-cache";
import { database } from "@/lib/supabase";
import type { Place } from "@/lib/types";
import { placeIdSchema } from "@/lib/validation";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

/** The checked story for one catalog place, written and checked on first request. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = placeIdSchema.safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  let place: Place | undefined = staticPlace(parsed.data)?.place;
  if (!place) {
    try {
      const { data } = await database().from("places").select("data").eq("id", parsed.data).maybeSingle();
      place = (data?.data as Place | undefined) ?? undefined;
    } catch {
      return Response.json({ error: "story_unavailable" }, { status: 503, headers });
    }
  }
  if (!place) return Response.json({ error: "place_not_found" }, { status: 404, headers });
  if (!process.env.GEMINI_API_KEY || !process.env.SERPER_API_KEY) {
    return place.story
      ? Response.json({ story: place.story, evidence: place.evidence }, { headers })
      : Response.json({ error: "story_unavailable" }, { status: 404, headers });
  }
  const found = await storyFor(place);
  if (!found) return Response.json({ error: "story_unavailable" }, { status: 404, headers });
  return Response.json(found, { headers });
}
