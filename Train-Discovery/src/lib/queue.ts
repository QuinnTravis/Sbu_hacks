import { sameDiscoverySite } from "./discovery-targets";
import type { DismissedSite, Place, Ride } from "./types";

function siteOf(place: Place): DismissedSite {
  return { id: place.id, name: place.name, lat: place.lat, lon: place.lon };
}

function sitePlace(site: DismissedSite): Place {
  return {
    id: site.id,
    name: site.name,
    lat: site.lat,
    lon: site.lon,
    category: "",
    routeIds: [],
    sourceUrl: "https://www.openstreetmap.org/",
    tags: {},
    evidence: [],
  };
}

function remember(sites: DismissedSite[], additions: DismissedSite[]): DismissedSite[] {
  const merged = [...sites];
  for (const site of additions) {
    if (!merged.some((item) => item.id === site.id)) merged.push(site);
  }
  return merged;
}

function sameKnownSite(ride: Ride, place: Place): boolean {
  return (
    ride.queue.some((entry) => sameDiscoverySite(entry.place, place)) ||
    (ride.dismissedSites ?? []).some((site) => sameDiscoverySite(sitePlace(site), place))
  );
}

export function enqueue(
  ride: Ride,
  place: Place,
  distance: number,
  now = Date.now(),
): Ride {
  if (ride.dismissed.includes(place.id) || sameKnownSite(ride, place)) return ride;
  return { ...ride, queue: [...ride.queue, { place, foundAt: now, distance }] };
}

export function discard(ride: Ride, id: string): Ride {
  const queued = ride.queue.find((entry) => entry.place.id === id)?.place;
  const remembered = (ride.dismissedSites ?? []).find((site) => site.id === id);
  const target = queued ?? (remembered ? sitePlace(remembered) : undefined);
  const matches = (place: Place) => (target ? sameDiscoverySite(place, target) : place.id === id);
  const removed = ride.queue.filter((entry) => matches(entry.place));
  const dismissedSites = remember(
    ride.dismissedSites ?? [],
    removed.map((entry) => siteOf(entry.place)),
  );
  const dismissed = [...ride.dismissed];
  const add = (value: string) => {
    if (!dismissed.includes(value)) dismissed.push(value);
  };
  add(id);
  for (const entry of removed) add(entry.place.id);
  if (target) {
    for (const site of dismissedSites) {
      if (sameDiscoverySite(sitePlace(site), target)) add(site.id);
    }
  }
  return {
    ...ride,
    queue: ride.queue.filter((entry) => !matches(entry.place)),
    dismissed,
    ...(dismissedSites.length ? { dismissedSites } : {}),
  };
}
