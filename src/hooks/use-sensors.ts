"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angleDelta, cameraHeading, normalize } from "@/lib/geo";
import type { Position } from "@/lib/types";

type CompassEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};
type PermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<string>;
};
type Status =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "flat"
  | "inaccurate";

export function useSensors() {
  const [position, setPosition] = useState<Position | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<Status>("idle");
  const [compassStatus, setCompassStatus] = useState<Status>("idle");
  const [now, setNow] = useState(0);
  const watch = useRef<number | null>(null);
  const removeCompass = useRef<(() => void) | null>(null);
  const [headingAt, setHeadingAt] = useState(0);
  const generation = useRef(0);
  const smooth = useRef<number | null>(null);

  const locate = useCallback(() => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setGpsStatus("unavailable");
      return;
    }
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    setGpsStatus("requesting");
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        });
        setGpsStatus(p.coords.accuracy > 80 ? "inaccurate" : "active");
        setNow(Date.now());
      },
      (error) => {
        setGpsStatus(error.code === 1 ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  }, []);

  const point = useCallback(async () => {
    const currentGeneration = ++generation.current;
    if (!window.isSecureContext || !("DeviceOrientationEvent" in window)) {
      setCompassStatus("unavailable");
      return;
    }
    setCompassStatus("requesting");
    try {
      const ctor = DeviceOrientationEvent as PermissionConstructor;
      // Must run inside the button's user gesture, before any network or GPS await.
      if (
        ctor.requestPermission &&
        (await ctor.requestPermission(true)) !== "granted"
      ) {
        setCompassStatus("denied");
        return;
      }
      if (currentGeneration !== generation.current) return;
      removeCompass.current?.();
      const listener = (raw: Event) => {
        const event = raw as CompassEvent;
        const apple =
          typeof event.webkitCompassHeading === "number" &&
          Number.isFinite(event.webkitCompassHeading);
        if (
          !apple &&
          !(event.absolute || event.type === "deviceorientationabsolute")
        )
          return;
        if (
          apple &&
          typeof event.webkitCompassAccuracy === "number" &&
          (event.webkitCompassAccuracy < 0 || event.webkitCompassAccuracy > 25)
        ) {
          setCompassStatus("inaccurate");
          setHeading(null);
          return;
        }
        if (
          event.beta === null ||
          event.gamma === null ||
          (!apple && event.alpha === null)
        )
          return;
        const alpha = apple
          ? normalize(360 - event.webkitCompassHeading!)
          : event.alpha!;
        const value = cameraHeading(alpha, event.beta, event.gamma);
        if (value === null) {
          setCompassStatus("flat");
          setHeading(null);
          return;
        }
        smooth.current =
          smooth.current === null
            ? value
            : normalize(
                smooth.current + angleDelta(value, smooth.current) * 0.35,
              );
        setHeadingAt(Date.now());
        setHeading(smooth.current);
        setCompassStatus("active");
      };
      window.addEventListener("deviceorientationabsolute", listener);
      window.addEventListener("deviceorientation", listener);
      removeCompass.current = () => {
        window.removeEventListener("deviceorientationabsolute", listener);
        window.removeEventListener("deviceorientation", listener);
      };
    } catch {
      setCompassStatus("denied");
    }
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    removeCompass.current?.();
    removeCompass.current = null;
    setHeading(null);
    smooth.current = null;
    setCompassStatus("idle");
    setGpsStatus("idle");
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
      removeCompass.current?.();
    };
  }, []);

  return {
    position,
    heading: now - headingAt < 4000 ? heading : null,
    gpsStatus,
    compassStatus,
    now,
    locate,
    point,
    stop,
  };
}
