import type { Place, Ride } from "./types";

export function enqueue(
  ride: Ride,
  place: Place,
  distance: number,
  now = Date.now(),
): Ride {
  if (
    ride.dismissed.includes(place.id) ||
    ride.queue.some((entry) => entry.place.id === place.id)
  )
    return ride;
  return { ...ride, queue: [...ride.queue, { place, foundAt: now, distance }] };
}

export function discard(ride: Ride, id: string): Ride {
  return {
    ...ride,
    queue: ride.queue.filter((entry) => entry.place.id !== id),
    dismissed: [...new Set([...ride.dismissed, id])],
  };
}
