import { afterEach, describe, expect, it, vi } from "vitest";
import { distance } from "../src/lib/geo";
import { dismiss } from "../src/lib/dismiss";
import {
  isSaved,
  mergeCatalogPlaces,
  mergeSavedNarration,
  refreshSaved,
  savePlace,
  unsavePlace,
} from "../src/lib/saved";
import { readRide, readSaved, SAVED_KEY, writeRide, writeSaved } from "../src/lib/storage";
import type { Place, Ride, Story } from "../src/lib/types";

const evidence = [{
  id: "archive",
  title: "King Manor",
  url: "https://en.wikipedia.org/wiki/King_Manor",
  text: "King Manor was built in the eighteenth century. A later wing was added in 1800.",
  retrievedAt: "2026-10-24",
  license: "CC BY-SA 4.0",
}];
const story: Story = {
  summary: "King Manor is a historic house with a later wing.",
  claims: [{
    text: "King Manor was built in the eighteenth century.",
    evidenceId: "archive",
    quote: "King Manor was built in the eighteenth century.",
  }],
  funFact: {
    text: "A later wing was added in 1800.",
    evidenceId: "archive",
    quote: "A later wing was added in 1800.",
  },
  verifiedAt: "2026-10-24T12:00:00Z",
  generator: "gemini-2.5-flash",
  verifier: "gemini-2.5-flash-lite",
  evidenceHash: "hash-rich",
};
const place: Place = {
  id: "osm-node-1",
  name: "King Manor Museum",
  lat: 40.703,
  lon: -73.803,
  category: "Heritage",
  routeIds: ["10"],
  sourceUrl: "https://www.openstreetmap.org/node/1",
  tags: { architect: "Unknown" },
  evidence: [],
};
const rich: Place = { ...place, story, evidence };
const ride: Ride = { routeId: "10", startedAt: 1, replay: false, dismissed: [] };

function north(meters: number, patch: Partial<Place> = {}): Place {
  return {
    ...place,
    ...patch,
    lat: place.lat + (meters / 6371008.8) * (180 / Math.PI),
  };
}

describe("saved discoveries", () => {
  it("saves the place and its checked story once", () => {
    const library = savePlace([], rich, 50);
    expect(library).toHaveLength(1);
    expect(library[0].savedAt).toBe(50);
    expect(library[0].place.id).toBe(place.id);
    expect(library[0].place.name).toBe(place.name);
    expect(library[0].place.lat).toBe(place.lat);
    expect(library[0].place.category).toBe("Heritage");
    expect(library[0].place.sourceUrl).toBe(place.sourceUrl);
    expect(library[0].place.tags).toEqual({ architect: "Unknown" });
    expect(library[0].place.story).toEqual(story);
    expect(library[0].place.evidence).toEqual(evidence);
    expect(isSaved(library, place)).toBe(true);
    expect(savePlace(library, rich, 80)).toBe(library);
  });

  it("unsaves a place", () => {
    const library = savePlace([], place, 1);
    expect(unsavePlace(library, place)).toEqual([]);
    expect(isSaved(unsavePlace(library, place), place)).toBe(false);
    expect(unsavePlace(library, { ...place, id: "other", name: "Other house" })).toBe(library);
  });

  it("keeps one entry for another map node of the same site and prefers the richer story", () => {
    const sibling = north(30, { id: "osm-node-2" });
    expect(distance(place, sibling)).toBeLessThan(180);
    const saved = savePlace(savePlace([], place, 1), sibling, 2);
    expect(saved).toHaveLength(1);
    expect(saved[0].place.id).toBe(place.id);

    const richer = savePlace(saved, north(20, { id: "osm-node-3", story, evidence }), 3);
    expect(richer).toHaveLength(1);
    expect(richer[0].savedAt).toBe(1);
    expect(richer[0].place.story?.evidenceHash).toBe("hash-rich");
    expect(unsavePlace(richer, sibling)).toEqual([]);

    const far = north(220, { id: "osm-node-far" });
    expect(distance(place, far)).toBeGreaterThanOrEqual(180);
    expect(savePlace(savePlace([], place), far)).toHaveLength(2);
  });

  it("merges a checked story into the saved copy without adding a second place or story", () => {
    const narrated = { ...place, story, evidence };
    expect(mergeSavedNarration([], narrated)).toEqual([]);
    const library = savePlace([], { ...place, story: undefined, evidence: [] }, 4);
    const merged = mergeSavedNarration(library, narrated);
    expect(merged).toHaveLength(1);
    expect(merged[0].place.story).toEqual(story);
    expect(merged[0].place.evidence).toEqual(evidence);
    expect(merged[0].savedAt).toBe(4);
    expect(mergeSavedNarration(merged, narrated)).toBe(merged);

    const sibling = mergeSavedNarration(
      savePlace([], place, 8),
      { ...north(25, { id: "osm-node-9" }), story, evidence },
    );
    expect(sibling).toHaveLength(1);
    expect(sibling[0].place.story?.generator).toBe("gemini-2.5-flash");
    expect(sibling[0].place.story?.summary).toBe(story.summary);
  });

  it("does not replace a richer saved story when the catalog record is thinner", () => {
    const library = savePlace([], rich, 1);
    const thin: Place = { ...place, story: undefined, evidence: [] };
    expect(refreshSaved(library, [thin])).toBe(library);

    const shorter = [{ ...evidence[0], text: "King Manor." }];
    expect(refreshSaved(library, [{ ...place, story: undefined, evidence: shorter }])).toBe(library);
    expect(library[0].place.evidence[0].text).toContain("eighteenth century");

    const withoutFact: Story = { ...story, funFact: undefined, evidenceHash: "hash-thin" };
    expect(refreshSaved(library, [{ ...place, story: withoutFact, evidence }])).toBe(library);
    expect(library[0].place.story?.funFact?.quote).toBe("A later wing was added in 1800.");

    const adopted = refreshSaved(savePlace([], thin, 3), [rich]);
    expect(adopted).toHaveLength(1);
    expect(adopted[0].place.story?.evidenceHash).toBe("hash-rich");

    expect(mergeCatalogPlaces([rich], [thin], [])[0].story?.evidenceHash).toBe("hash-rich");
    expect(mergeCatalogPlaces([thin], [thin], library)[0].story?.evidenceHash).toBe("hash-rich");
    expect(mergeCatalogPlaces([thin], [thin], library)[0].evidence[0].text).toContain("eighteenth century");
  });
});

describe("saved library storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function memoryStorage() {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });
    return memory;
  }

  it("keeps the library when the rider is not interested in the place and the ride ends", () => {
    memoryStorage();
    const library = savePlace([], rich, 9);
    expect(writeSaved(library)).toBe(true);
    expect(writeRide(dismiss(ride, rich))).toBe(true);
    expect(readRide()?.dismissed).toEqual([place.id]);
    expect(readSaved()[0].place.story).toEqual(story);
    expect(writeRide(null)).toBe(true);
    expect(readRide()).toBeNull();
    expect(isSaved(readSaved(), place)).toBe(true);
    expect(readSaved()[0].place.story?.evidenceHash).toBe("hash-rich");
  });

  it("does not persist photo or audio urls", () => {
    const memory = memoryStorage();
    const dirty = {
      ...rich,
      photoUrl: "https://places.googleapis.com/v1/photo",
      audioUrl: "https://example.com/clip.mp3",
      story: { ...story, audioUrl: "https://example.com/clip.mp3" },
    } as Place;
    const library = savePlace([], dirty, 1);
    expect(library[0].place).not.toHaveProperty("photoUrl");
    expect(library[0].place).not.toHaveProperty("audioUrl");
    expect(library[0].place.story).not.toHaveProperty("audioUrl");
    expect(writeSaved(library)).toBe(true);
    const raw = memory.get(SAVED_KEY) ?? "";
    expect(raw).not.toContain("photoUrl");
    expect(raw).not.toContain("googleapis");
    expect(raw).not.toContain("clip.mp3");
    expect(raw).not.toContain("foundAt");
    expect(readSaved()[0].place.story?.evidenceHash).toBe("hash-rich");
  });

  it("recovers from a storage failure and from unreadable data", () => {
    const library = savePlace([], place, 1);
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    });
    expect(writeSaved(library)).toBe(false);
    expect(library).toHaveLength(1);
    expect(readSaved()).toEqual([]);

    const memory = memoryStorage();
    memory.set(SAVED_KEY, "{");
    expect(readSaved()).toEqual([]);
    memory.set(SAVED_KEY, JSON.stringify([{ savedAt: 1, place: { id: "nope" } }]));
    expect(readSaved()).toEqual([]);
    expect(writeSaved([])).toBe(true);
    expect(readSaved()).toEqual([]);
  });
});
