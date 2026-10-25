import { sameDiscoverySite } from "./discovery-targets";
import type { Place, Ride } from "./types";

/** Hide a place, and other map nodes for the same site, for the rest of the ride. */
export function dismiss(ride: Ride, place: Place): Ride {
  const sites = ride.dismissedSites ?? [];
  const dismissed = [...ride.dismissed];
  const add = (id: string) => {
    if (!dismissed.includes(id)) dismissed.push(id);
  };
  add(place.id);
  for (const site of sites) if (sameDiscoverySite(site, place)) add(site.id);
  const known = sites.some((site) => site.id === place.id);
  if (known && dismissed.length === ride.dismissed.length) return ride;
  return {
    ...ride,
    dismissed,
    dismissedSites: known
      ? sites
      : [...sites, { id: place.id, name: place.name, lat: place.lat, lon: place.lon }],
  };
}
