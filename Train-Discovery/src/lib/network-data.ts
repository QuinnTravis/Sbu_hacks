import "server-only";
import lirrRail from "../../public/data/lirr.json";
import zephyrRail from "../../public/data/networks/california-zephyr/rail.json";
import rockiesPlaces from "../../public/data/networks/california-zephyr/places/cz-rockies.json";
import rockiesConnectivity from "../../public/data/networks/california-zephyr/connectivity/cz-rockies.json";
import rockiesAir from "../../public/data/networks/california-zephyr/air/cz-rockies.json";
import rockiesHistory from "../../public/data/networks/california-zephyr/history/cz-rockies.json";
import rockiesModels from "../../public/data/networks/california-zephyr/models/cz-rockies.json";
import rockiesContent from "../../public/data/networks/california-zephyr/content/cz-rockies.json";
import rockiesAudio from "../../public/data/networks/california-zephyr/audio/cz-rockies.json";
import { networkForRoute, type NetworkId } from "@/networks";
import { projectOnRoute, routeIndex } from "./route-geometry";
import type {
  NarratorClip,
  AirQualitySnapshot,
  ConnectivityZone,
  HistoricImage,
  JourneyPackage,
  ModelManifest,
  PoiContent,
  Thumbnail,
} from "./package-types";
import type { Place, RailData, RailRoute } from "./types";

/**
 * Static route packages for networks that are not in Supabase (DECISIONS D7).
 * Everything here is bundled at build time, so the demo needs no database.
 */

const RAIL: Record<NetworkId, RailData> = {
  "california-zephyr": zephyrRail as unknown as RailData,
  lirr: lirrRail as unknown as RailData,
};

type PackageFiles = {
  places: Place[];
  connectivity: ConnectivityZone[];
  air: AirQualitySnapshot | null;
  history: HistoricImage[];
  models: ModelManifest[];
  thumbnails: Record<string, Thumbnail>;
  content: Record<string, Record<string, PoiContent>>;
  clips: Record<string, NarratorClip>;
};

const PACKAGES: Record<string, PackageFiles> = {
  "cz-rockies": {
    places: (rockiesPlaces as { places: Place[] }).places,
    connectivity: (rockiesConnectivity as { zones: ConnectivityZone[] }).zones,
    air: (rockiesAir as { snapshot: AirQualitySnapshot | null }).snapshot,
    history: (rockiesHistory as { images: HistoricImage[] }).images,
    models: (rockiesModels as { models: ModelManifest[] }).models,
    thumbnails: (rockiesHistory as { thumbnails?: Record<string, Thumbnail> }).thumbnails ?? {},
    content: rockiesContent as Record<string, Record<string, PoiContent>>,
    clips: (rockiesAudio as { clips: Record<string, NarratorClip> }).clips,
  },
};

export function railFor(networkId: NetworkId): RailData {
  return RAIL[networkId];
}

export function findRoute(routeId: string): { networkId: NetworkId; route: RailRoute } | null {
  const network = networkForRoute(routeId);
  if (!network) return null;
  const route = RAIL[network.id].routes.find((candidate) => candidate.id === routeId);
  return route ? { networkId: network.id, route } : null;
}

export function isStaticRoute(routeId: string): boolean {
  return networkForRoute(routeId)?.id === "california-zephyr";
}

/** A place from any static package, for the photo, audio, and history endpoints. */
export function staticPlace(placeId: string): { place: Place; routeId: string } | null {
  for (const [routeId, files] of Object.entries(PACKAGES)) {
    const place = files.places.find((candidate) => candidate.id === placeId);
    if (place) return { place, routeId };
  }
  return null;
}

export function staticPackageFiles(routeId: string): PackageFiles | null {
  return PACKAGES[routeId] ?? null;
}

/** The route package served by GET /api/journeys/[id] for static networks. */
export function staticJourney(routeId: string, locale: string | null): JourneyPackage | null {
  const found = findRoute(routeId);
  if (!found || found.networkId !== "california-zephyr") return null;
  const files = PACKAGES[routeId];
  const route = found.route;
  const index = route.paths.length === 1 ? routeIndex(route.paths[0]) : null;
  const timetable = index && route.schedule
    ? route.schedule.flatMap(({ stopId, minutes }) => {
        const stop = route.stops.find((candidate) => candidate.id === stopId);
        const projection = stop ? projectOnRoute(index, stop) : null;
        return projection ? [{ stopId, km: +projection.km.toFixed(3), minutes }] : [];
      })
    : undefined;
  const content = locale && locale !== "en" ? files?.content[locale] : undefined;
  // English clips are always included: a story without a translation falls back to English.
  const clips = files
    ? Object.fromEntries(Object.entries(files.clips).filter(([, clip]) => clip.language === "en" || clip.language === locale))
    : {};
  return {
    places: files?.places ?? [],
    updatedAt: new Date().toISOString(),
    networkId: found.networkId,
    routeId,
    ...(timetable ? { timetable } : {}),
    connectivity: files?.connectivity ?? [],
    airQuality: files?.air ?? null,
    history: files?.history ?? [],
    models: files?.models ?? [],
    thumbnails: files?.thumbnails ?? {},
    locale: locale ?? "en",
    ...(content ? { content } : {}),
    clips,
  };
}
