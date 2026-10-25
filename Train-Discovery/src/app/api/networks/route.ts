import { NETWORKS } from "@/networks";
import { railFor } from "@/lib/network-data";

/** Networks and their rides. Static, so it is prerendered at build time. */
export async function GET() {
  return Response.json({
    networks: Object.values(NETWORKS).map((network) => ({
      id: network.id,
      name: network.name,
      operator: network.operator,
      enabled: network.enabled,
      segments: network.segments,
      routes: railFor(network.id).routes.map((route) => ({
        id: route.id,
        name: route.name,
        experience: route.experience ?? "full",
        stops: route.stops.map((stop) => stop.id),
      })),
    })),
  });
}
