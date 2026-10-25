import { afterEach, describe, expect, it, vi } from "vitest";
import { isDismissed } from "../src/lib/discovery-targets";
import { dismiss } from "../src/lib/dismiss";
import { distance } from "../src/lib/geo";
import { readRide, STORAGE_KEY, writeRide } from "../src/lib/storage";
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
const ride: Ride = { routeId: "10", startedAt: 1, replay: false, dismissed: [] };
const north = (id: string, name: string, meters: number): Place => ({
  ...place,
  id,
  name,
  lat: place.lat + (meters / 6371008.8) * (180 / Math.PI),
});

function stubStorage() {
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  });
  return memory;
}

describe("not interested", () => {
  it("hides every node of the site for the rest of the ride and keeps a different landmark", () => {
    const hidden = dismiss(ride, place);
    expect(hidden.dismissed).toEqual([place.id]);
    expect(hidden.dismissedSites).toEqual([{ id: place.id, name: place.name, lat: place.lat, lon: place.lon }]);
    expect(ride.dismissed).toEqual([]);

    const entrance = north("osm-node-2", place.name, 30);
    const styled = north("osm-node-3", "Test-place", 20);
    const far = north("osm-node-far", place.name, 220);
    const other = north("osm-node-other", "Other landmark", 40);
    expect(distance(place, far)).toBeGreaterThanOrEqual(180);
    const none = new Map<string, Place>();
    expect(isDismissed(entrance, hidden, none)).toBe(true);
    expect(isDismissed(styled, hidden, none)).toBe(true);
    expect(isDismissed(far, hidden, none)).toBe(false);
    expect(isDismissed(other, hidden, none)).toBe(false);
  });

  it("is idempotent and records a sibling id against the remembered site", () => {
    const hidden = dismiss(ride, place);
    expect(dismiss(hidden, place)).toBe(hidden);
    const sibling = north("osm-node-2", place.name, 30);
    const both = dismiss(hidden, sibling);
    expect(both.dismissed).toEqual([place.id, sibling.id]);
    expect(both.dismissedSites?.map((site) => site.id)).toEqual([place.id, sibling.id]);
  });
});

describe("persisted rides", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps dismissed sites across reload", () => {
    stubStorage();
    expect(writeRide(dismiss(ride, place))).toBe(true);
    const loaded = readRide();
    expect(loaded).not.toBeNull();
    expect(isDismissed(north("osm-node-2", place.name, 20), loaded!, new Map())).toBe(true);
  });

  it("loads a ride saved before the queue was removed and drops the old queue", () => {
    const memory = stubStorage();
    memory.set(STORAGE_KEY, JSON.stringify({
      ...ride,
      dismissed: ["old-1"],
      queue: [{ place, foundAt: 1, distance: 40 }],
    }));
    const loaded = readRide();
    expect(loaded).toEqual({ ...ride, dismissed: ["old-1"] });
    expect(loaded && "queue" in loaded).toBe(false);
  });
});
