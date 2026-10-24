import { describe, expect, it } from "vitest";
import { discard, enqueue } from "../src/lib/queue";
import type { Place, Ride } from "../src/lib/types";

const place: Place = {
  id: "osm-node-1",
  name: "Test place",
  lat: 40.92,
  lon: -73.12,
  category: "History",
  routeIds: ["10"],
  sourceUrl: "https://www.openstreetmap.org/node/1",
  tags: {},
  evidence: [],
};
const ride: Ride = {
  routeId: "10",
  startedAt: 1,
  replay: false,
  queue: [],
  dismissed: [],
};
describe("persistent discovery queue", () => {
  it("never expires a discovery when position or heading changes", () => {
    const found = enqueue(ride, place, 250, 100);
    expect(found.queue[0]).toEqual({ place, foundAt: 100, distance: 250 });
    expect(enqueue(found, place, 1000, 100000)).toBe(found);
  });
  it("preserves FIFO order and never re-adds a discarded place in the same ride", () => {
    const found = enqueue(
      enqueue(ride, place, 250),
      { ...place, id: "osm-node-2" },
      300,
    );
    expect(found.queue.map((e) => e.place.id)).toEqual([
      "osm-node-1",
      "osm-node-2",
    ]);
    const dismissed = discard(found, place.id);
    expect(dismissed.queue).toHaveLength(1);
    expect(enqueue(dismissed, place, 10)).toBe(dismissed);
    expect(found.queue).toHaveLength(2);
  });
});
