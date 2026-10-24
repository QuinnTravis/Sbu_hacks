// Core data types shared by every part of TransitFlow.
// Times are seconds after midnight of the service day.

export type Mode = 'subway' | 'rail' | 'bus';

export interface Stop {
  id: string;
  name: string;
  shortName?: string;
  mode: Mode;
  lat: number;
  lon: number;
  /** Station complex this stop belongs to, when an indoor graph exists or may exist. */
  stationId?: string;
  /** Minimum time to change between two trips at this same stop (published, not physical). */
  sameStopChangeSec?: number;
}

export interface Route {
  id: string;
  shortName: string;
  longName: string;
  mode: Mode;
  agency: string;
  color: string;
  textColor: string;
  /** Doors close / boarding cutoff before scheduled departure. */
  boardBufferSec: number;
  delayModelId: string;
}

export interface StopTime {
  stopId: string;
  arr: number;
  dep: number;
}

export interface Trip {
  id: string;
  routeId: string;
  patternId: string;
  directionId: 0 | 1;
  headsign: string;
  /** Service variant, e.g. "Electric to Huntington" */
  service: string;
  stopTimes: StopTime[];
}

export interface Pattern {
  id: string;
  routeId: string;
  directionId: 0 | 1;
  service: string;
  stops: string[];
  /** Sorted by departure from first stop. All trips share the stop sequence. */
  tripIds: string[];
}

/** Equivalent of a GTFS transfers.txt row (min_transfer_time). Directional. */
export interface ScheduledTransfer {
  from: string;
  to: string;
  minTransferSec: number;
}

export interface Timetable {
  id: string;
  label: string;
  provenance: Provenance;
  stops: Record<string, Stop>;
  routes: Record<string, Route>;
  trips: Record<string, Trip>;
  patterns: Pattern[];
  transfers: ScheduledTransfer[];
}

export type Provenance =
  | 'live'
  | 'published'
  | 'historical'
  | 'synthetic'
  | 'model'
  | 'illustrative'
  | 'unavailable';

// ---------- Indoor station graphs ----------

export type NodeKind =
  | 'platform'
  | 'mezzanine'
  | 'concourse'
  | 'street'
  | 'entrance'
  | 'busstop'
  | 'passage';

export type EdgeKind =
  | 'walk'
  | 'stairs'
  | 'escalator'
  | 'elevator'
  | 'fare'
  | 'crosswalk'
  | 'street';

export interface StationNode {
  id: string;
  label: string;
  level: number;
  x: number;
  y: number;
  kind: NodeKind;
  /** Position along a platform, used for train-car guidance. */
  position?: 'front' | 'middle' | 'rear';
  landmark?: string;
}

export interface StationEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** Median traversal time for a typical regular rider in uncrowded conditions. */
  medianSec: number;
  /** Log-normal dispersion of traversal time. */
  sigma: number;
  accessible: boolean;
  /** 0 = unaffected by crowding, 1 = proportional, >1 = more than proportional. */
  crowdSensitivity: number;
  /** Mean extra queueing seconds per unit of crowding above normal. */
  queueSec?: number;
  oneWay?: boolean;
  label?: string;
  /** Optional rider-facing instruction for traversing this edge forward. */
  instruction?: string;
  instructionReverse?: string;
}

export interface PlatformBinding {
  stopId: string;
  routeId: string;
  directionId: 0 | 1;
  /** Restrict to one service variant of the route (e.g. diesel vs electric). */
  service?: string;
  label: string;
  /** Platform nodes a rider can alight at / board from. */
  nodes: string[];
}

export interface StationGraph {
  id: string;
  name: string;
  levels: { level: number; label: string; y: number }[];
  nodes: StationNode[];
  edges: StationEdge[];
  bindings: PlatformBinding[];
  verification: 'illustrative' | 'verified';
  sourceNote: string;
  width: number;
  height: number;
}

// ---------- Context ----------

export interface EventWindow {
  id: string;
  label: string;
  venue: string;
  startSec: number;
  endSec: number;
  /** Station id -> peak crowd multiplier (1 = normal). */
  stationImpact: Record<string, number>;
  /** Route id -> multiplier on mean lateness of trips while crowding is active. */
  routeDelayImpact: Record<string, number>;
  provenance: Provenance;
}

export interface RealtimeTripUpdate {
  tripId: string;
  delaySec: number;
}

export interface ServiceAlert {
  id: string;
  header: string;
  description: string;
  routeIds?: string[];
  stationId?: string;
  /** Edge ids out of service (e.g. elevators). */
  edgeOutages?: string[];
}

export interface RealtimeSnapshot {
  source: 'demo' | 'mta-gtfs-rt';
  /** Service-day seconds at which the feed was generated. */
  feedTimestampSec: number;
  tripUpdates: RealtimeTripUpdate[];
  alerts: ServiceAlert[];
}

export interface Familiarity {
  kind: 'regular' | 'first-time';
}

export interface ModelContext {
  /** Service-day seconds of "now" (used for realtime freshness). */
  nowSec: number;
  events: EventWindow[];
  realtime: RealtimeSnapshot | null;
  /** Feed older than this is treated as stale and ignored. */
  staleAfterSec: number;
  accessible: boolean;
  familiarity: Familiarity['kind'];
}
