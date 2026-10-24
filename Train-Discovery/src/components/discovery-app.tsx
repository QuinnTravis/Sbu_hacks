"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Info,
  Route as RouteIcon,
  Check,
  ChevronRight,
  Compass as CompassIcon,
  LocateFixed,
  MapPin,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrainFront,
  WifiOff,
  X,
} from "lucide-react";
import { useSensors } from "@/hooks/use-sensors";
import { useAudioGuide } from "@/hooks/use-audio-guide";
import { audioEvidence, audioNarration } from "@/lib/narration";
import {
  bearing,
  distance,
  formatDistance,
  isPointedAt,
  routeDistance,
  cameraHeading,
  normalize,
} from "@/lib/geo";
import { discard, enqueue } from "@/lib/queue";
import { readRide, writeRide } from "@/lib/storage";
import { DEMO_LOCATION, demoPath, pathTimeline, pointAlong } from "@/lib/demo";
import { DevPanel, type HeadingMode } from "./dev-panel";
import type { Place, Position, RailData, Ride } from "@/lib/types";
import { Network } from "./network";

const WINDOW_RANK: Record<string, number> = {
  "Former use": 0,
  Heritage: 1,
  Nature: 2,
  Landmark: 3,
  Station: 4,
};

function windowRank(category: string) {
  return WINDOW_RANK[category] ?? 5;
}
import { Compass } from "./compass";
import { PlaceCard } from "./place-card";
import { AudioGuideBar } from "./audio-guide-bar";

export function DiscoveryApp({ rail }: { rail: RailData }) {
  const [demoLocation, setDemoLocation] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [allRoutes, setAllRoutes] = useState(false);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [packageState, setPackageState] = useState<
    "idle" | "loading" | "ready" | "cached" | "error"
  >("idle");
  const [retry, setRetry] = useState(0);
  const [online, setOnline] = useState(true);
  const [cardIndex, setCardIndex] = useState(0);
  const [replayOffset, setReplayOffset] = useState(0);
  const [devOpen, setDevOpen] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [direction, setDirection] = useState(1);
  const [headingMode, setHeadingMode] = useState<HeadingMode>("auto");
  const [manualHeading, setManualHeading] = useState(0);
  const [manualPitch, setManualPitch] = useState(90);
  const [playing, setPlaying] = useState(true);
  const [endConfirm, setEndConfirm] = useState(false);
  const [view, setView] = useState<"point" | "queue">("point");
  const candidates = useRef(new Map<string, number>());
  const lastDetection = useRef(0);
  const sensors = useSensors();
  const selectionPosition = demoLocation ? DEMO_LOCATION : sensors.position;
  const route = rail.routes.find((r) => r.id === (ride?.routeId || selected));
  const rideRouteId = ride?.routeId;

  useEffect(() => {
    queueMicrotask(() => {
      const saved = readRide();
      if (saved && rail.routes.some((r) => r.id === saved.routeId)) {
        setRide(saved);
        setSelected(saved.routeId);
      }
      if (new URLSearchParams(window.location.search).has("dev"))
        setDevOpen(true);
      setHydrated(true);
      setOnline(navigator.onLine);
    });
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [rail.routes]);

  useEffect(() => {
    if (!hydrated) return;
    if (!writeRide(ride)) queueMicrotask(() => setStorageError(true));
  }, [ride, hydrated]);

  useEffect(() => {
    if (!rideRouteId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      setPackageState("loading");
      setPlaces([]);
    });
    fetch(`/api/journeys/${rideRouteId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Journey unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setPlaces(data.places);
          setPackageState(
            response.headers.get("X-Discovery-Cache") === "offline"
              ? "cached"
              : "ready",
          );
          const refreshed = new Map<string, Place>(
            data.places.map((place: Place) => [place.id, place]),
          );
          setRide((current) =>
            current
              ? {
                  ...current,
                  queue: current.queue.map((entry) => ({
                    ...entry,
                    place: refreshed.get(entry.place.id) ?? entry.place,
                  })),
                }
              : current,
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setPackageState("error");
      });
    return () => controller.abort();
  }, [rideRouteId, retry]);

  const { path: replayPath, startIndex: replayStart } = useMemo(
    () => demoPath(route),
    [route],
  );
  const timeline = useMemo(() => pathTimeline(replayPath), [replayPath]);
  const startMeters = timeline.meters[replayStart] ?? 0;
  const progress = Math.max(
    0,
    Math.min(timeline.total, startMeters + replayOffset),
  );
  const replayPosition: Position | null = useMemo(() => {
    if (!ride?.replay) return null;
    const point = pointAlong(timeline, progress);
    return point ? { ...point, accuracy: 5, timestamp: sensors.now } : null;
  }, [ride?.replay, timeline, progress, sensors.now]);

  useEffect(() => {
    if (!ride?.replay || !playing) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min((now - last) / 1000, 0.5);
      last = now;
      if (document.hidden) return;
      setReplayOffset((offset) =>
        Math.max(
          -startMeters,
          Math.min(
            timeline.total - startMeters,
            offset + direction * (speed / 3.6) * elapsed,
          ),
        ),
      );
    }, 200);
    return () => clearInterval(timer);
  }, [ride?.replay, playing, speed, direction, startMeters, timeline.total]);

  useEffect(() => {
    if (
      ride?.replay &&
      playing &&
      ((direction === 1 && progress >= timeline.total) ||
        (direction === -1 && progress <= 0))
    )
      queueMicrotask(() => setPlaying(false));
  }, [ride?.replay, playing, direction, progress, timeline.total]);

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (
        event.key === "`" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,[contenteditable]")
        )
      ) {
        event.preventDefault();
        setDevOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);

  const position = ride?.replay ? replayPosition : sensors.position;
  const replayTarget =
    position && ride?.replay
      ? places
          .filter((p) => distance(position, p) < 1200)
          .sort(
            (a, b) =>
              Number(Boolean(b.evidence.length)) -
                Number(Boolean(a.evidence.length)) ||
              distance(position, a) - distance(position, b),
          )[0]
      : null;
  const activeHeadingMode =
    !ride?.replay && headingMode === "auto" ? "phone" : headingMode;
  const heading =
    activeHeadingMode === "phone"
      ? sensors.heading
      : activeHeadingMode === "manual"
        ? cameraHeading(normalize(360 - manualHeading), manualPitch, 0)
        : position && replayTarget
          ? bearing(position, replayTarget)
          : 70;
  const gpsFresh = Boolean(
    position &&
    sensors.now - position.timestamp < 20000 &&
    position.accuracy <= 80 &&
    (ride?.replay || sensors.gpsStatus === "active"),
  );
  const offRoute = Boolean(
    position && route && routeDistance(position, route) > 1500,
  );
  const nearbyAudioPlaces = useMemo(
    () =>
      position && gpsFresh && !offRoute && ride
        ? places
            .filter((place) =>
              !ride.dismissed.includes(place.id) &&
              distance(position, place) <= 1100 &&
              (Boolean(audioNarration(place)) || audioEvidence(place).length > 0),
            )
            .sort((a, b) =>
              Number(audioNarration(b)?.kind === "verified") -
                Number(audioNarration(a)?.kind === "verified") ||
              distance(position, a) - distance(position, b),
            )
        : [],
    [position, gpsFresh, offRoute, ride, places],
  );
  const rememberNarration = useCallback((narratedPlace: Place) => {
    if (!narratedPlace?.story) return;
    // Keep the spoken, checked claims and their exact passages on the saved
    // card as well. No second, uncited copy of the story is generated.
    const merge = (place: Place) => place.id === narratedPlace.id &&
      (place.story?.verifiedAt !== narratedPlace.story?.verifiedAt ||
       place.story?.evidenceHash !== narratedPlace.story?.evidenceHash)
      ? narratedPlace : place;
    setRide((current) => {
      if (!current || !current.queue.some((entry) => merge(entry.place) !== entry.place)) return current;
      return { ...current, queue: current.queue.map((entry) => ({ ...entry, place: merge(entry.place) })) };
    });
    setPlaces((current) => current.some((place) => merge(place) !== place) ? current.map(merge) : current);
  }, []);
  const audioGuide = useAudioGuide(
    ride?.queue,
    nearbyAudioPlaces,
    ride?.dismissed,
    ride?.startedAt ?? null,
    { routeId: ride?.routeId ?? "", stops: route?.stops ?? [], position: gpsFresh && !offRoute ? position : null,
      onNarrated: rememberNarration },
  );
  const canDetect = Boolean(
    ride &&
    gpsFresh &&
    !offRoute &&
    heading !== null &&
    (activeHeadingMode !== "phone" || sensors.compassStatus === "active"),
  );

  useEffect(() => {
    if (ride?.queue.length === 1) queueMicrotask(() => setView("queue"));
  }, [ride?.queue.length]);

  useEffect(() => {
    if (!canDetect || !position || heading === null || document.hidden) {
      candidates.current.clear();
      return;
    }
    const now = Date.now();
    const matched = places
      .filter(
        (place) =>
          isPointedAt(position, heading, place) &&
          !ride?.dismissed.includes(place.id) &&
          !ride?.queue.some((entry) => entry.place.id === place.id),
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.story)) - Number(Boolean(a.story)) ||
          windowRank(a.category) - windowRank(b.category) ||
          Number(Boolean(b.evidence.length)) -
            Number(Boolean(a.evidence.length)) ||
          distance(position, a) - distance(position, b),
      );
    const ids = new Set(matched.map((p) => p.id));
    for (const id of candidates.current.keys())
      if (!ids.has(id)) candidates.current.delete(id);
    for (const place of matched) {
      const since = candidates.current.get(place.id);
      if (since === undefined) {
        candidates.current.set(place.id, now);
        continue;
      }
      if (now - since >= 900 && now - lastDetection.current >= 2500) {
        lastDetection.current = now;
        setRide((current) =>
          current
            ? enqueue(current, place, distance(position, place), now)
            : current,
        );
        break;
      }
    }
  }, [canDetect, position, heading, places, sensors.now, ride]);

  const ranked = useMemo(
    () =>
      rail.routes
        .map((r) => ({
          route: r,
          distance: selectionPosition
            ? routeDistance(selectionPosition, r)
            : Infinity,
        }))
        .sort(
          (a, b) =>
            a.distance - b.distance || a.route.name.localeCompare(b.route.name),
        ),
    [rail.routes, selectionPosition],
  );
  const nearby = ranked.filter((r) => r.distance <= 3000);
  const visibleRoutes = (
    selectionPosition && nearby.length && !allRoutes && !search
      ? nearby
      : ranked
  ).filter((r) => r.route.name.toLowerCase().includes(search.toLowerCase()));
  const currentIndex = Math.max(
    0,
    Math.min(cardIndex, (ride?.queue.length ?? 1) - 1),
  );
  const currentEntry = ride?.queue[currentIndex];
  const nearestStation =
    position && route
      ? [...route.stops].sort(
          (a, b) => distance(position, a) - distance(position, b),
        )[0]
      : null;
  const selectedDistance = ranked.find(
    (r) => r.route.id === selected,
  )?.distance;

  const start = (replay = false) => {
    replay = replay || demoLocation;
    const id = selected || (replay ? "10" : null);
    if (!id) return;
    if (!replay) {
      void sensors.point();
      sensors.locate();
    } else sensors.stop();
    candidates.current.clear();
    setReplayOffset(0);
    setDirection(1);
    setHeadingMode(replay ? "auto" : "phone");
    setPlaying(true);
    setCardIndex(0);
    setView("point");
    setSelected(id);
    setRide({
      routeId: id,
      startedAt: Date.now(),
      replay,
      queue: [],
      dismissed: [],
    });
  };
  const seek = (meters: number) => {
    setReplayOffset(
      Math.max(0, Math.min(timeline.total, meters)) - startMeters,
    );
    candidates.current.clear();
    lastDetection.current = 0;
  };
  const changeHeadingMode = (mode: HeadingMode) => {
    setHeadingMode(mode);
    candidates.current.clear();
    if (mode === "phone") void sensors.point();
  };
  const changeLocationSource = (replay: boolean) => {
    sensors.stop();
    candidates.current.clear();
    setHeadingMode(replay ? "auto" : "phone");
    setRide((current) => (current ? { ...current, replay } : current));
    if (!replay) {
      void sensors.point();
      sensors.locate();
    }
  };
  const devStations = useMemo(
    () =>
      (route?.stops ?? [])
        .flatMap((station) => {
          let nearest = Infinity,
            index = 0;
          timeline.path.forEach(([lat, lon], i) => {
            const meters = distance(station, { lat, lon });
            if (meters < nearest) {
              nearest = meters;
              index = i;
            }
          });
          return nearest < 200
            ? [{ ...station, offset: timeline.meters[index] }]
            : [];
        })
        .sort((a, b) => a.offset - b.offset),
    [route, timeline],
  );
  const resume = () => {
    void sensors.point();
    sensors.locate();
  };
  const finish = () => {
    sensors.stop();
    setRide(null);
    setPlaces([]);
    setEndConfirm(false);
    candidates.current.clear();
  };
  const gpsMessage =
    sensors.gpsStatus === "denied"
      ? "Location is blocked. Enable it in your browser settings, then retry."
      : sensors.gpsStatus === "inaccurate"
        ? "GPS is imprecise. Discovery resumes when the signal improves."
        : sensors.gpsStatus === "requesting"
          ? "Finding your train…"
          : sensors.gpsStatus === "unavailable"
            ? "Location unavailable. Move closer to a window and retry."
            : sensors.gpsStatus === "idle"
              ? "Enable location and compass to discover."
              : !gpsFresh
                ? "GPS signal lost. Waiting for a fresh location."
                : null;
  const compassMessage =
    sensors.compassStatus === "denied"
      ? "Compass access is blocked. Enable Motion & Orientation in your browser settings."
      : sensors.compassStatus === "flat"
        ? "Hold your phone upright and point its back toward a landmark."
        : sensors.compassStatus === "inaccurate"
          ? "Compass interference detected. Move your phone away from metal."
          : sensors.compassStatus === "unavailable"
            ? "This browser has no usable compass. Try Safari on iPhone or Chrome on Android."
            : heading === null
              ? "Waiting for an absolute compass reading. Hold your phone upright."
              : null;

  return (
    <div className={`app-shell ${!ride ? "route-select-shell" : ""}`}>
      <header className="app-header">
        <Link className="brand" href="/" aria-label="Train Discovery home">
          <span className="brand-mark">
            <TrainFront size={19} strokeWidth={1.8} />
          </span>
          <span>Train Discovery</span>
        </Link>
        <div className="header-right">
          <button
            className="header-link dev-toggle"
            onClick={() => setDevOpen((open) => !open)}
            aria-label={devOpen ? "Close dev panel" : "Open dev panel"}
            aria-expanded={devOpen}
            title="Dev panel (`)"
          >
            <SlidersHorizontal size={19} />
          </button>
          <span className="rail-badge">LIRR</span>
          {!online && (
            <span className="offline-label">
              <WifiOff size={14} />
              Offline
            </span>
          )}
          <Link className="header-link" href="/about">
            <Info size={22} />
            <span className="sr-only">About</span>
          </Link>
        </div>
      </header>
      <main id="main-content">
        {!ride ? (
          <section
            className="selection-map-screen"
            aria-label="Choose a train route"
          >
            <div className="map-topline">
              <h1>Explore LIRR</h1>
              <button
                className="map-action"
                onClick={() => start(true)}
                disabled={!hydrated}
                aria-label="Start Jamaica demo ride"
                title="Jamaica demo"
              >
                <Play size={18} fill="currentColor" />
              </button>
            </div>
            <div className="selection-map">
              <Network
                routes={rail.routes}
                selected={selected}
                position={sensors.position}
                onSelectRoute={(id) => {
                  setSelected(id);
                  setAllRoutes(true);
                  setRouteSheetOpen(true);
                }}
                onLocate={() => {
                  setDemoLocation(false);
                  setAllRoutes(false);
                  setRouteSheetOpen(true);
                  sensors.locate();
                }}
              />
              <button
                className="map-location-button"
                aria-label="Find routes near me"
                onClick={() => {
                  setDemoLocation(false);
                  setAllRoutes(false);
                  setRouteSheetOpen(true);
                  sensors.locate();
                }}
                disabled={sensors.gpsStatus === "requesting"}
              >
                <LocateFixed
                  size={21}
                  className={sensors.gpsStatus === "requesting" ? "spin" : ""}
                />
              </button>
              {demoLocation && (
                <button
                  className="map-demo-label"
                  onClick={() => setRouteSheetOpen(true)}
                >
                  <MapPin size={14} /> Jamaica demo
                </button>
              )}
            </div>
            <section
              className={`route-sheet ${routeSheetOpen ? "is-open" : "is-collapsed"}`}
              aria-labelledby="route-sheet-title"
            >
              <button
                className="sheet-handle"
                aria-label={
                  routeSheetOpen ? "Collapse route list" : "Expand route list"
                }
                aria-expanded={routeSheetOpen}
                onClick={() => setRouteSheetOpen((open) => !open)}
              >
                <span />
              </button>
              <div className="sheet-heading">
                <h2 id="route-sheet-title">
                  {selected && route
                    ? route.name.replace(" Branch", "")
                    : selectionPosition && nearby.length && !allRoutes
                      ? demoLocation
                        ? "Routes near Jamaica"
                        : "Routes near you"
                      : "Choose a route"}
                </h2>
                {selectionPosition && nearby.length > 0 && (
                  <button
                    className="text-button"
                    onClick={() => setAllRoutes((value) => !value)}
                  >
                    {allRoutes ? "Nearby" : "All routes"}
                  </button>
                )}
              </div>
              {routeSheetOpen && (
                <>
                  <label className="route-search sheet-search">
                    <Search size={20} />
                    <input
                      type="search"
                      aria-label="Search LIRR routes"
                      placeholder="Search routes"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        className="search-clear"
                        aria-label="Clear route search"
                        onClick={() => setSearch("")}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </label>
                  {["denied", "unavailable", "inaccurate"].includes(
                    sensors.gpsStatus,
                  ) && (
                    <p className="inline-notice" role="status">
                      {gpsMessage}
                    </p>
                  )}
                  {route?.serviceNote && (
                    <p className="inline-notice">{route.serviceNote}</p>
                  )}
                  <div
                    className="route-list"
                    role="group"
                    aria-label="LIRR branches"
                  >
                    {visibleRoutes.map(({ route: item, distance: meters }) => (
                      <button
                        key={item.id}
                        className={`route-row ${selected === item.id ? "is-selected" : ""}`}
                        onClick={() => setSelected(item.id)}
                        aria-pressed={selected === item.id}
                      >
                        <span className="route-icon">
                          <TrainFront size={22} strokeWidth={1.8} />
                        </span>
                        <span className="route-name">
                          {item.name.replace(" Branch", "")}
                          {Number.isFinite(meters) && (
                            <small>{formatDistance(meters)} away</small>
                          )}
                        </span>
                        {selected === item.id ? (
                          <span className="route-check">
                            <Check size={17} />
                          </span>
                        ) : (
                          <ChevronRight className="route-chevron" size={19} />
                        )}
                      </button>
                    ))}
                    {!visibleRoutes.length && (
                      <p className="no-results">No routes match “{search}”.</p>
                    )}
                  </div>
                  {selected && route && (
                    <div className="sheet-selected-route">
                      <span
                        className="route-color"
                        style={{ background: route.color }}
                      />
                      <span>{route.name.replace(" Branch", "")}</span>
                      {selectedDistance !== undefined &&
                        selectedDistance > 3000 &&
                        Number.isFinite(selectedDistance) && (
                          <small>Not nearby</small>
                        )}
                    </div>
                  )}
                  <button
                    className="primary-button start-button sheet-start"
                    disabled={!selected || !hydrated}
                    onClick={() => start()}
                  >
                    <span>Start ride</span>
                    <ArrowRight size={19} />
                  </button>
                  {!demoLocation && (
                    <button
                      className="demo-switch"
                      onClick={() => {
                        sensors.stop();
                        setDemoLocation(true);
                        setAllRoutes(false);
                      }}
                    >
                      Use Jamaica demo
                    </button>
                  )}
                </>
              )}
            </section>
          </section>
        ) : (
          <div className="ride-layout">
            <div className="ride-heading">
              <div>
                <div className="ride-route-name">
                  <span
                    className="route-color"
                    style={{ background: route?.color }}
                  />
                  <h1>{route?.name.replace(" Branch", "")}</h1>
                  <span className="ride-running">
                    <span />
                    {ride.replay
                      ? "Replay"
                      : canDetect
                        ? "Discovering"
                        : "Paused"}
                  </span>
                </div>
                <p>
                  {nearestStation
                    ? `Near ${nearestStation.name.replace(" Station", "")}`
                    : "Waiting for location"}
                </p>
              </div>
              {endConfirm ? (
                <div className="end-confirm">
                  <span>Clear this ride and its queue?</span>
                  <button className="text-button" onClick={finish}>
                    End ride
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setEndConfirm(false)}
                    aria-label="Keep riding"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() =>
                    ride.queue.length ? setEndConfirm(true) : finish()
                  }
                >
                  End ride
                  <X size={14} />
                </button>
              )}
            </div>
            <AudioGuideBar
              guide={audioGuide}
              saved={Boolean(ride.queue.some((entry) => entry.place.id === audioGuide.currentPlace?.id))}
              onSave={() => {
                if (!audioGuide.currentPlace || !position) return;
                const place = audioGuide.currentPlace;
                setRide((current) => current ? enqueue(current, place, distance(position, place)) : current);
              }}
            />
            <div className="mobile-tabs floating-nav">
              <button
                aria-pressed={view === "point"}
                onClick={() => setView("point")}
              >
                <span className="nav-icon">
                  <RouteIcon size={25} strokeWidth={1.8} />
                </span>
                Discover
              </button>
              <button
                aria-pressed={view === "queue"}
                onClick={() => setView("queue")}
              >
                <span className="nav-icon">
                  <BookOpen size={25} strokeWidth={1.8} />
                  <span className="nav-count">{ride.queue.length}</span>
                </span>
                <span>My discoveries</span>
              </button>
              <Link href="/about">
                <span className="nav-icon">
                  <Info size={25} strokeWidth={1.8} />
                </span>
                About
              </Link>
            </div>
            <div className={`ride-columns mobile-${view}`}>
              <section className="point-panel" aria-label="Point your phone">
                <Compass
                  heading={heading}
                  position={position}
                  places={places}
                />
                {ride.replay ? (
                  <div className="replay-controls">
                    <span>
                      {activeHeadingMode === "phone"
                        ? "Simulated train · phone compass"
                        : activeHeadingMode === "manual"
                          ? "Simulated train · joystick"
                          : "Simulated location & heading"}
                    </span>
                    <button
                      className="icon-button"
                      onClick={() => setPlaying((v) => !v)}
                      aria-label={playing ? "Pause replay" : "Play replay"}
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  </div>
                ) : (
                  <div className="sensor-controls">
                    {gpsMessage && <p role="status">{gpsMessage}</p>}
                    {!gpsMessage && compassMessage && (
                      <p role="status">{compassMessage}</p>
                    )}
                    {(!canDetect || sensors.gpsStatus === "idle") && (
                      <button className="secondary-button" onClick={resume}>
                        <Radio size={15} />
                        {sensors.gpsStatus === "idle"
                          ? "Enable sensors"
                          : "Retry sensors"}
                      </button>
                    )}
                    {canDetect && (
                      <span className="sensors-ready">
                        <Radio size={14} />
                        Location & compass active
                      </span>
                    )}
                  </div>
                )}
                {ride.replay &&
                  activeHeadingMode === "phone" &&
                  compassMessage && (
                    <p className="inline-notice" role="status">
                      {compassMessage}
                    </p>
                  )}
                {ride.replay &&
                  activeHeadingMode === "manual" &&
                  heading === null && (
                    <p className="inline-notice" role="status">
                      Simulated phone is flat. Increase Phone tilt to point
                      outward.
                    </p>
                  )}
                {!ride.replay && activeHeadingMode === "manual" && (
                  <p className="inline-notice">
                    Real GPS · simulated joystick heading
                  </p>
                )}
                {offRoute && !ride.replay && (
                  <p className="inline-notice">
                    You seem far from this branch. Check your selected route.
                  </p>
                )}
                <div className="nearby-status">
                  <MapPin size={15} />
                  <span>
                    {packageState === "loading"
                      ? "Loading places…"
                      : `${places.filter((p) => position && distance(position, p) < 1200).length} places nearby`}
                  </span>
                  {packageState === "cached" && (
                    <span className="cached-label">Cached</span>
                  )}
                </div>
                {packageState === "error" && (
                  <div className="inline-notice" role="alert">
                    Couldn’t load places.{" "}
                    <button
                      className="text-button"
                      onClick={() => setRetry((v) => v + 1)}
                    >
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  </div>
                )}
              </section>
              <section
                className="queue-panel"
                aria-label="Your discovery queue"
              >
                <div className="queue-heading">
                  <h2>My discoveries</h2>
                  <span className="count-badge">{ride.queue.length}</span>
                </div>
                {currentEntry ? (
                  <>
                    <PlaceCard
                      key={currentEntry.place.id}
                      entry={currentEntry}
                      index={currentIndex}
                      total={ride.queue.length}
                      onNavigate={setCardIndex}
                      onNarrate={() => audioGuide.replay(currentEntry.place.id)}
                      onDiscard={() =>
                        setRide((current) =>
                          current
                            ? discard(current, currentEntry.place.id)
                            : current,
                        )
                      }
                    />
                    {ride.queue.length > 1 && (
                      <div className="queue-strip">
                        {ride.queue.map((entry, i) => (
                          <button
                            key={entry.place.id}
                            onClick={() => setCardIndex(i)}
                            className={currentIndex === i ? "selected" : ""}
                            aria-pressed={currentIndex === i}
                          >
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            {entry.place.name}
                            <ChevronRight size={13} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="queue-empty">
                    <div className="empty-window">
                      <CompassIcon size={31} strokeWidth={1.2} />
                    </div>
                    <h3>
                      Your next discovery
                      <br />
                      is just outside.
                    </h3>
                    <p>
                      Point your phone at a nearby place.
                      <br />
                      Its story stays here until you discard it.
                    </p>
                  </div>
                )}
              </section>
            </div>
            {storageError && (
              <p className="inline-notice" role="alert">
                Device storage is full or blocked. Keep this tab open to retain
                your queue.
              </p>
            )}
            <p className="sr-only" aria-live="polite">
              {ride.queue.length
                ? `${ride.queue.length} discoveries in your queue. Latest: ${ride.queue[ride.queue.length - 1].place.name}.`
                : "No discoveries yet."}
            </p>
          </div>
        )}
      </main>
      <DevPanel
        open={devOpen}
        onClose={() => setDevOpen(false)}
        replay={Boolean(ride?.replay)}
        playing={playing}
        onPlay={() => setPlaying((p) => !p)}
        speed={speed}
        onSpeed={setSpeed}
        direction={direction}
        onReverse={() => setDirection((d) => -d)}
        progress={progress}
        total={timeline.total}
        onSeek={seek}
        onReset={() => seek(startMeters)}
        mode={activeHeadingMode}
        onMode={changeHeadingMode}
        manualHeading={manualHeading}
        onHeading={setManualHeading}
        pitch={manualPitch}
        onPitch={setManualPitch}
        position={position}
        heading={heading}
        active={canDetect}
        places={places}
        onLocation={changeLocationSource}
        started={Boolean(ride)}
        onStart={() => {
          setDemoLocation(true);
          start(true);
        }}
        stations={devStations}
        onStation={seek}
        queueCount={ride?.queue.length ?? 0}
      />
      {!ride && (
        <nav className="floating-nav home-nav" aria-label="Main navigation">
          <button
            aria-current="page"
            onClick={() =>
              document
                .querySelector<HTMLInputElement>(".route-search input")
                ?.focus()
            }
          >
            <span className="nav-icon">
              <RouteIcon size={25} strokeWidth={1.8} />
            </span>
            My ride
          </button>
          <button disabled aria-label="My discoveries — start a ride first">
            <span className="nav-icon">
              <BookOpen size={25} strokeWidth={1.8} />
            </span>
            Discoveries
          </button>
          <Link href="/about">
            <span className="nav-icon">
              <Info size={25} strokeWidth={1.8} />
            </span>
            About
          </Link>
        </nav>
      )}
    </div>
  );
}
