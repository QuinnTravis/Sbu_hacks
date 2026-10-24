import { z } from "zod";

export const nearbySchema = z.object({
  lat: z.coerce.number().finite().min(40.4).max(41.2),
  lon: z.coerce.number().finite().min(-74.2).max(-71.7),
  route: z.string().regex(/^(?:[1-9]|1[0-3])$/),
});
export const placeIdSchema = z
  .string()
  .regex(/^osm-(node|way|relation)-[0-9]{1,15}$/);
