import type { NetworkConfig } from "./types";

/**
 * Amtrak's California Zephyr, Chicago to Emeryville. Route 96 in Amtrak's
 * GTFS; westbound (shape 173) is the canonical direction. Stop IDs were
 * checked against the feed's stops.txt (feed version 20261024).
 */
export const californiaZephyr: NetworkConfig = {
  id: "california-zephyr",
  name: "California Zephyr",
  badge: "Amtrak",
  operator: "Amtrak",
  enabled: true,
  dataPath: "/data/networks/california-zephyr/rail.json",
  routeIdPattern: /^cz-[a-z]{3,12}$/,
  demo: {
    routeId: "cz-rockies",
    // Denver Union Station, from Amtrak's stops.txt (DEN).
    location: { lat: 39.752959, lon: -104.999929 },
    place: "Denver",
    speedKmh: 200,
    maxSpeedKmh: 400,
    jumps: [
      { id: "denver", label: "Denver", lat: 39.752959, lon: -104.999929 },
      { id: "moffat", label: "Moffat Tunnel", lat: 39.9011, lon: -105.6438 },
      { id: "granby", label: "Granby", lat: 40.084188, lon: -105.935503 },
      { id: "gore", label: "Gore Canyon", lat: 40.0137, lon: -106.4528 },
      { id: "glenwood", label: "Glenwood Springs", lat: 39.547903, lon: -107.323218 },
    ],
  },
  segments: [
    { id: "cz-plains", name: "The Plains", fromStopId: "CHI", toStopId: "DEN", experience: "full" },
    { id: "cz-rockies", name: "The Rockies", fromStopId: "DEN", toStopId: "GSC", experience: "full" },
    { id: "cz-canyons", name: "Canyon Country", fromStopId: "GSC", toStopId: "SLC", experience: "full" },
    { id: "cz-basin", name: "The Great Basin", fromStopId: "SLC", toStopId: "RNO", experience: "full" },
    { id: "cz-sierra", name: "The Sierra", fromStopId: "RNO", toStopId: "RSV", experience: "full" },
    { id: "cz-bay", name: "To the Bay", fromStopId: "RSV", toStopId: "EMY", experience: "full" },
  ],
  map: {
    bounds: { minLat: 37.4, maxLat: 42.3, minLon: -122.9, maxLon: -87.1 },
    verticalScale: 2.4,
    regionLabels: [
      { text: "GREAT PLAINS", lat: 40.0, lon: -97.5 },
      { text: "ROCKY MOUNTAINS", lat: 38.7, lon: -106.6 },
      { text: "SIERRA NEVADA", lat: 38.2, lon: -119.9 },
    ],
    stationLabels: ["CHI", "OMA", "DEN", "GSC", "SLC", "RNO", "EMY"],
    caption: "Chicago · Emeryville",
  },
  corridorM: 5000,
  poiBudget: 60,
  nearbyM: 5000,
  attribution: [
    {
      label: "Amtrak GTFS",
      url: "https://content.amtrak.com/content/gtfs/GTFS.zip",
      license: "Published by Amtrak",
    },
  ],
};
