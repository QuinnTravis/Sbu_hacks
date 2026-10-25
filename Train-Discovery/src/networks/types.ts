import type { Coordinate } from "@/lib/types";

export type NetworkId = "california-zephyr" | "lirr";

/** "full" segments have a POI catalog, look-ahead, and stories; "basic" ones announce stations. */
export type Experience = "full" | "basic";

export type Segment = {
  id: string;
  name: string;
  fromStopId: string;
  toStopId: string;
  experience: Experience;
};

/** A dev-panel shortcut. Its position along the ride is computed from the coordinate. */
export type JumpTarget = { id: string; label: string; lat: number; lon: number };

export type MapLabel = { text: string; lat: number; lon: number };

export type NetworkConfig = {
  id: NetworkId;
  name: string;
  /** Short label for the header badge. */
  badge: string;
  operator: string;
  /** Disabled networks are not offered in the interface. `/?network=<id>` still loads them. */
  enabled: boolean;
  /** Public path of the rail snapshot for networks that are not bundled with the page. */
  dataPath: string;
  routeIdPattern: RegExp;
  demo: {
    routeId: string;
    /** Where the simulated ride starts. */
    location: Coordinate;
    /** Name of the demo start, e.g. "Denver". */
    place: string;
    speedKmh: number;
    maxSpeedKmh: number;
    jumps: JumpTarget[];
  };
  /** Segments when one long line is split into rides. Empty for branch networks. */
  segments: Segment[];
  map: {
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    /** Stretch north-south so a long east-west line stays readable. */
    verticalScale: number;
    regionLabels: MapLabel[];
    /** Stop IDs labeled on the selection map. */
    stationLabels: string[];
    caption: string;
  };
  /** Distance from the track within which places are imported. */
  corridorM: number;
  /** Target number of curated places per full-experience segment. */
  poiBudget: number;
  /** Distance from the track within which pointing and nearby narration apply. */
  nearbyM: number;
  attribution: { label: string; url: string; license: string }[];
};
