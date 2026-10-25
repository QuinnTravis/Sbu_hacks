import { afterEach, describe, expect, it, vi } from "vitest";
import { distance } from "../src/lib/geo";
import { discard, enqueue } from "../src/lib/queue";
import { readRide, writeRide } from "../src/lib/storage";
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
      { ...place, id: "osm-node-2", name: "Second landmark" },
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

  it("keeps one card for a second map node of the same site", () => {
    const north = (id: string, name: string, meters: number): Place => ({
      ...place,
      id,
      name,
      lat: place.lat + (meters / 6371008.8) * (180 / Math.PI),
    });
    const saved = enqueue(ride, place, 40, 1);
    const entrance = north("osm-node-2", place.name, 30);
    const styled = north("osm-node-3", "Test-place", 20);
    expect(distance(place, entrance)).toBeLessThan(180);
    expect(enqueue(saved, entrance, 30, 2)).toBe(saved);
    expect(enqueue(saved, styled, 20, 3)).toBe(saved);
    expect(saved.queue.map((entry) => entry.place.id)).toEqual([place.id]);

    const far = north("osm-node-far", place.name, 220);
    const other = north("osm-node-other", "Other landmark", 40);
    expect(distance(place, far)).toBeGreaterThanOrEqual(180);
    const kept = enqueue(enqueue(saved, other, 50, 4), far, 220, 5);
    expect(kept.queue.map((entry) => entry.place.id)).toEqual([place.id, other.id, far.id]);

    const blank = enqueue(
      enqueue(ride, { ...place, id: "blank-a", name: " " }, 10, 6),
      { ...place, id: "blank-b", name: "" },
      12,
      7,
    );
    expect(blank.queue.map((entry) => entry.place.id)).toEqual(["blank-a", "blank-b"]);
  });

  it("dismisses every node of a site and still keeps a different nearby landmark", () => {
    const sibling = { ...place, id: "osm-node-2" };
    const other = { ...place, id: "yard", name: "Johnson Yard", lat: place.lat + 0.0004 };
    const legacy: Ride = {
      ...ride,
      queue: [
        { place, foundAt: 1, distance: 10 },
        { place: sibling, foundAt: 2, distance: 12 },
        { place: other, foundAt: 3, distance: 40 },
      ],
    };
    const dismissed = discard(legacy, place.id);
    expect(legacy.queue).toHaveLength(3);
    expect(dismissed.queue.map((entry) => entry.place.id)).toEqual([other.id]);
    expect(dismissed.dismissed).toEqual([place.id, sibling.id]);
    const later = { ...place, id: "osm-node-9", name: "test place" };
    expect(enqueue(dismissed, later, 15, 8)).toBe(dismissed);
    expect(enqueue(dismissed, sibling, 12, 9)).toBe(dismissed);
    const added = enqueue(dismissed, { ...other, id: "yard-gate", name: "Yard gate" }, 18, 10);
    expect(added.queue.map((entry) => entry.place.id)).toEqual([other.id, "yard-gate"]);
  });
});

describe("dismissed sites survive reload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not restore a second node of a discarded site", () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });
    const saved = enqueue(ride, place, 40, 1);
    const dismissed = discard(saved, place.id);
    expect(writeRide(dismissed)).toBe(true);
    const loaded = readRide();
    const sibling = { ...place, id: "osm-node-2" };
    expect(loaded).not.toBeNull();
    expect(enqueue(loaded!, sibling, 20, 2)).toBe(loaded);
    expect(loaded!.queue).toHaveLength(0);
  });
});
