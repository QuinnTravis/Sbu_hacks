import { californiaZephyr } from "./california-zephyr";
import { lirr } from "./lirr";
import type { NetworkConfig, NetworkId } from "./types";

export type { NetworkConfig, NetworkId, Segment, JumpTarget, Experience } from "./types";

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  "california-zephyr": californiaZephyr,
  lirr,
};

export const DEFAULT_NETWORK_ID: NetworkId = "california-zephyr";

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && Object.hasOwn(NETWORKS, value);
}

/** The network that owns a ride ID, enabled or not. */
export function networkForRoute(routeId: string): NetworkConfig | null {
  return Object.values(NETWORKS).find((network) => network.routeIdPattern.test(routeId)) ?? null;
}

/** Networks offered in the interface. */
export function enabledNetworks(): NetworkConfig[] {
  return Object.values(NETWORKS).filter((network) => network.enabled);
}

export function segmentFor(routeId: string) {
  return networkForRoute(routeId)?.segments.find((segment) => segment.id === routeId) ?? null;
}

/** Full-experience rides carry a POI catalog, look-ahead, and stories. */
export function hasFullExperience(routeId: string): boolean {
  const network = networkForRoute(routeId);
  if (!network) return false;
  if (!network.segments.length) return true;
  return segmentFor(routeId)?.experience === "full";
}
