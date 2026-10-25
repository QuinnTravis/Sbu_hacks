"use client";

import { useEffect, useRef, useState } from "react";
import type { Facing } from "@/lib/route-geometry";
import type { Place } from "@/lib/types";
import { selectCue, type LookAheadCue } from "./cues";
import type { RouteTracking } from "./use-route-tracking";

function same(a: LookAheadCue | null, b: LookAheadCue | null) {
  if (!a || !b) return a === b;
  return a.poiId === b.poiId && a.phase === b.phase && a.side === b.side &&
    Math.round((a.etaSeconds ?? -1) / 10) === Math.round((b.etaSeconds ?? -1) / 10);
}

/** The one look-ahead cue to show, re-evaluated as the train moves. */
export function useLookAhead(input: {
  places: Place[];
  tracking: RouteTracking;
  facing: Facing;
  bookmarked: ReadonlySet<string>;
  enabled: boolean;
  /** Changes when a new ride starts, so places can be cued again. */
  rideKey: number | null;
  now: number;
  onCue?: (cue: LookAheadCue) => void;
}): LookAheadCue | null {
  const { places, tracking, facing, bookmarked, enabled, rideKey, now, onCue } = input;
  const [cue, setCue] = useState<LookAheadCue | null>(null);
  const announced = useRef(new Set<string>());
  const lastStartedAt = useRef<number | null>(null);
  const onCueRef = useRef(onCue);

  useEffect(() => {
    onCueRef.current = onCue;
  }, [onCue]);

  useEffect(() => {
    announced.current = new Set();
    lastStartedAt.current = null;
    queueMicrotask(() => setCue(null));
  }, [rideKey]);

  useEffect(() => {
    if (!enabled || tracking.km === null) {
      queueMicrotask(() => setCue((current) => (current ? null : current)));
      return;
    }
    const result = selectCue({
      places,
      km: tracking.km,
      direction: tracking.direction,
      speedKmh: tracking.speedKmh,
      facing,
      bookmarked,
      announced: announced.current,
      current: cue,
      lastStartedAt: lastStartedAt.current,
      now,
    });
    if (result.isNew && result.cue) {
      announced.current.add(result.cue.poiId);
      lastStartedAt.current = now;
      onCueRef.current?.(result.cue);
    }
    if (!same(cue, result.cue)) queueMicrotask(() => setCue(result.cue));
  }, [enabled, tracking.km, tracking.direction, tracking.speedKmh, facing, places, bookmarked, now, cue]);

  return cue;
}
