import type { NetworkConfig } from "./types";

/**
 * Long Island Rail Road, the original network. Retained but disabled: it is
 * not offered in the interface, and `/?network=lirr` loads it for development.
 */
export const lirr: NetworkConfig = {
  id: "lirr",
  name: "LIRR",
  badge: "LIRR",
  operator: "MTA Long Island Rail Road",
  enabled: false,
  dataPath: "/data/lirr.json",
  routeIdPattern: /^(?:[1-9]|1[0-3])$/,
  demo: {
    routeId: "10",
    // Official MTA GTFS coordinate for Jamaica station (stop 102).
    location: { lat: 40.69960817, lon: -73.80852987 },
    place: "Jamaica",
    speedKmh: 60,
    maxSpeedKmh: 240,
    jumps: [],
  },
  segments: [],
  map: {
    bounds: { minLat: 40.36, maxLat: 41.15, minLon: -74.06, maxLon: -71.69 },
    verticalScale: 1.06,
    regionLabels: [
      { text: "LONG ISLAND SOUND", lat: 41.0, lon: -72.775 },
      { text: "ATLANTIC OCEAN", lat: 40.42, lon: -72.99 },
    ],
    // Penn Station, Jamaica, Hicksville, Stony Brook, Montauk, Greenport, Port Washington, Long Beach.
    stationLabels: ["237", "102", "92", "14", "141", "73", "171", "113"],
    caption: "New York · Long Island",
  },
  corridorM: 1200,
  poiBudget: 40,
  nearbyM: 1100,
  attribution: [
    { label: "MTA LIRR GTFS", url: "https://www.mta.info/developers", license: "MTA published transit data" },
  ],
};
