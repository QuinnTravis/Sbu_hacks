import { describe, expect, it, vi } from "vitest";
import { wikimediaPhoto } from "../src/lib/wikimedia-photo";
import type { Place } from "../src/lib/types";

const place: Place = {
  id: "osm-way-12",
  name: "Adam-Derby House",
  lat: 40.867,
  lon: -73.534,
  category: "Heritage",
  routeIds: ["3"],
  wikipedia: "Adam-Derby House",
  evidence: [],
  sourceUrl: "https://www.openstreetmap.org/way/12",
  tags: {},
};

const summary = {
  type: "standard",
  thumbnail: { source: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/AdamDerbyMansions.jpg/330px-AdamDerbyMansions.jpg" },
};
const commons = {
  query: { pages: { "123": { imageinfo: [{
    descriptionurl: "https://commons.wikimedia.org/wiki/File:AdamDerbyMansions.jpg",
    extmetadata: {
      Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Example">Example&nbsp;author</a>' },
      LicenseShortName: { value: "CC BY-SA 4.0" },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
    },
  }] } } },
};

function mockFetch(photoSummary: unknown = summary, imageInfo: unknown = commons) {
  return vi.fn(async (input: string | URL | Request) =>
    new Response(JSON.stringify(String(input).includes("api/rest_v1") ? photoSummary : imageInfo), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("Wikimedia photograph fallback", () => {
  it("returns a Commons image with its author, source page and license", async () => {
    const fetcher = mockFetch();
    expect(await wikimediaPhoto(place, fetcher)).toEqual({
      url: summary.thumbnail.source,
      source: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:AdamDerbyMansions.jpg",
      authors: [{ displayName: "Example author", uri: "https://commons.wikimedia.org/wiki/File:AdamDerbyMansions.jpg" }],
      license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
    });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetcher).mock.calls[0][0])).toContain("Adam-Derby_House");
  });

  it("rejects external image hosts and missing Commons credit pages", async () => {
    const external = { ...summary, thumbnail: { source: "https://bad.example/asset.jpg" } };
    expect(await wikimediaPhoto(place, mockFetch(external))).toBeNull();
    expect(await wikimediaPhoto(place, mockFetch(summary, { query: { pages: {} } }))).toBeNull();
  });

  it("rejects unsupported language prefixes and Wikipedia disambiguation pages", async () => {
    expect(await wikimediaPhoto({ ...place, wikipedia: "de:Some Page" }, mockFetch())).toBeNull();
    expect(await wikimediaPhoto(place, mockFetch({ ...summary, type: "disambiguation" }))).toBeNull();
  });
});
