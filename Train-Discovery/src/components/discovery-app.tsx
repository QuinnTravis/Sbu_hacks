"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Info,
  Route as RouteIcon,
  Check,
  ChevronRight,
  LocateFixed,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrainFront,
  WifiOff,
  X,
} from "lucide-react";
import { useSensors } from "@/hooks/use-sensors";
import { useAudioGuide } from "@/hooks/use-audio-guide";
import { nearbyNarrationScore } from "@/lib/podcast-director";
import { placeAnnouncement } from "@/lib/audio-journey";
import {
  POINTING_RADIUS_M,
  bearing,
  distance,
  formatDistance,
  routeDistance,
  cameraHeading,
  normalize,
} from "@/lib/geo";
import { dismiss } from "@/lib/dismiss";
import {
  isSaved,
  mergeCatalogPlaces,
  mergeSavedNarration,
  refreshSaved,
  savePlace,
  unsavePlace,
} from "@/lib/saved";
import {
  chooseReplayTarget,
  isDismissed,
  rankPointingCandidates,
  replayCatalogStatus,
  sameDiscoverySite,
} from "@/lib/discovery-targets";
import type { PointingCandidate } from "@/lib/discovery-targets";
import { readRide, readSaved, writeRide, writeSaved } from "@/lib/storage";
import { DEMO_LOCATION, demoPath, pathTimeline, pointAlong } from "@/lib/demo";
import { DevPanel, type HeadingMode } from "./dev-panel";
import type { Place, Position, RailData, Ride, SavedEntry } from "@/lib/types";
import { Network } from "./network";
import { Compass } from "./compass";
import { PlaceCard } from "./place-card";
import { AudioGuideBar } from "./audio-guide-bar";
import { CandidateSheet } from "./candidate-sheet";
import { PoiSheet } from "./poi-sheet";
import "./ride-screen.css";

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
  const [replayOffset, setReplayOffset] = useState(0);
  const [devOpen, setDevOpen] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [direction, setDirection] = useState(1);
  const [headingMode, setHeadingMode] = useState<HeadingMode>("auto");
  const [manualHeading, setManualHeading] = useState(0);
  const [manualPitch, setManualPitch] = useState(90);
  const [playing, setPlaying] = useState(true);
  const [view, setView] = useState<"point" | "saved">("point");
  const [homeView, setHomeView] = useState<"map" | "saved">("map");
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [savedCursor, setSavedCursor] = useState(0);
  const [poiOpen, setPoiOpen] = useState(false);
  const [poiExpanded, setPoiExpanded] = useState(false);
  const [poiSnapshot, setPoiSnapshot] = useState<PointingCandidate[]>([]);
  const [activePoi, setActivePoi] = useState<{ place: Place; distance: number } | null>(null);
  const [dismissedPoiKey, setDismissedPoiKey] = useState("");
  const savedRef = useRef(saved);
  const storageBroken = useRef(false);
  const sensors = useSensors();
  const selectionPosition = demoLocation ? DEMO_LOCATION : sensors.position;
  const route = rail.routes.find((r) => r.id === (ride?.routeId || selected));
  const rideRouteId = ride?.routeId;

  useEffect(() => {
    queueMicrotask(() => {
      const storedRide = readRide();
      if (storedRide && rail.routes.some((r) => r.id === storedRide.routeId)) {
        setRide(storedRide);
        setSelected(storedRide.routeId);
      }
      setSaved(readSaved());
      if (new URLSearchParams(window.location.search).has("dev"))
        setDevOpen(true);
      setHydrated(true);
      setOnline(navigator.onLine);
    });
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .catch(() => {});
      } else {
        // A worker left over from `next start` can serve stale CSS/JS to `next dev`.
        const appWorkerUrl = new URL("/sw.js", window.location.origin).href;
        void navigator.serviceWorker
          .getRegistrations()
          .then(async (registrations) => {
            const appRegistrations = registrations.filter((registration) =>
              [
                registration.installing,
                registration.waiting,
                registration.active,
              ].some((worker) => worker?.scriptURL === appWorkerUrl),
            );
            if (!appRegistrations.length) return;
            const removed = await Promise.all(
              appRegistrations.map((registration) => registration.unregister()),
            );
            if (!removed.some(Boolean)) return;
            const staleAssetCaches = (await caches.keys()).filter(
              (key) =>
                key.startsWith("train-discovery-") &&
                (key.endsWith("-assets") || key.endsWith("-shell")),
            );
            await Promise.all(
              staleAssetCaches.map((key) => caches.delete(key)),
            );
            window.location.reload();
          })
          .catch(() => {});
      }
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [rail.routes]);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    if (!hydrated) return;
    const rideOk = writeRide(ride);
    const savedOk = writeSaved(saved);
    const failed = !rideOk || !savedOk;
    if (storageBroken.current === failed) return;
    storageBroken.current = failed;
    queueMicrotask(() => setStorageError(failed));
  }, [ride, saved, hydrated]);

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
          const catalog = data.places as Place[];
          setPlaces((current) =>
            mergeCatalogPlaces(current, catalog, savedRef.current),
          );
          setPackageState(
            response.headers.get("X-Discovery-Cache") === "offline"
              ? "cached"
              : "ready",
          );
          setSaved((current) => refreshSaved(current, catalog));
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
  const placesById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places],
  );
  const replayTarget =
    position && ride?.replay
      ? chooseReplayTarget(places, ride, position, placesById)
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
          : null;
  const gpsFresh = Boolean(
    position &&
    sensors.now - position.timestamp < 20000 &&
    position.accuracy <= 80 &&
    (ride?.replay || sensors.gpsStatus === "active"),
  );
  const offRoute = Boolean(
    position && route && routeDistance(position, route) > 1500,
  );
  const nearbyAudioPlaces = useMemo(() => {
    if (!position || !gpsFresh || offRoute || !ride) return [];
    return places
      .flatMap((place) => {
        if (isDismissed(place, ride, placesById)) return [];
        const score = nearbyNarrationScore(place, distance(position, place));
        return score === null ? [] : [{ place, score }];
      })
      .sort((a, b) => b.score - a.score)
      .map(({ place }) => place);
  }, [position, gpsFresh, offRoute, ride, places, placesById]);
  const areaAudioPlaces = useMemo(() => {
    if (!position || !gpsFresh || offRoute || !ride) return [];
    const nearbyIds = new Set(nearbyAudioPlaces.map((place) => place.id));
    return places
      .filter((place) => {
        const meters = distance(position, place);
        return !nearbyIds.has(place.id) &&
          place.routeIds.includes(ride.routeId) &&
          meters > 1100 && meters <= 5000 &&
          Boolean(placeAnnouncement(place, "area")) &&
          !isDismissed(place, ride, placesById);
      })
      .sort((a, b) => distance(position, a) - distance(position, b))
      .slice(0, 3);
  }, [position, gpsFresh, offRoute, ride, places, placesById, nearbyAudioPlaces]);
  const rememberNarration = useCallback((narratedPlace: Place) => {
    if (!narratedPlace?.story) return;
    // Keep the spoken, checked claims and their exact passages on the saved
    // card as well. No second, uncited copy of the story is generated.
    const merge = (place: Place) =>
      place.id === narratedPlace.id &&
      (place.story?.verifiedAt !== narratedPlace.story?.verifiedAt ||
        place.story?.evidenceHash !== narratedPlace.story?.evidenceHash)
        ? narratedPlace
        : place;
    setActivePoi((current) =>
      current && merge(current.place) !== current.place
        ? { ...current, place: narratedPlace }
        : current,
    );
    setPlaces((current) =>
      current.some((place) => merge(place) !== place)
        ? current.map(merge)
        : current,
    );
    setSaved((current) => mergeSavedNarration(current, narratedPlace));
  }, []);
  const audioGuide = useAudioGuide(
    nearbyAudioPlaces,
    areaAudioPlaces,
    ride?.dismissed,
    ride?.startedAt ?? null,
    {
      routeId: ride?.routeId ?? "",
      routeName: route?.name ?? "",
      stops: route?.stops ?? [],
      position: gpsFresh && !offRoute ? position : null,
      simulation: Boolean(ride?.replay),
      livePosition:
        ride &&
        !ride.replay &&
        gpsFresh &&
        !offRoute &&
        sensors.gpsStatus === "active"
          ? sensors.position
          : null,
      onNarrated: rememberNarration,
    },
  );
  const canDetect = Boolean(
    ride &&
    gpsFresh &&
    !offRoute &&
    heading !== null &&
    (activeHeadingMode !== "phone" || sensors.compassStatus === "active"),
  );
  const catalogPending = packageState === "idle" || packageState === "loading";
  const replayStatus = replayCatalogStatus(
    Boolean(ride?.replay),
    activeHeadingMode === "auto",
    replayTarget,
    packageState,
  );
  const detectionPaused =
    !canDetect && replayStatus === "loading"
      ? "Paused — loading places…"
      : !canDetect && replayStatus === "unavailable"
        ? "Paused — places didn’t load"
        : !canDetect && replayStatus === "empty"
          ? "Paused — no sourced place in range."
          : undefined;

  const liveCandidates = useMemo(() => {
    if (!canDetect || !position || heading === null || !ride) return [];
    return rankPointingCandidates(places, position, heading, ride, placesById);
  }, [canDetect, position, heading, ride, places, placesById]);
  const directionEmpty = Boolean(
    canDetect &&
    !catalogPending &&
    packageState !== "error" &&
    liveCandidates.length === 0,
  );
  const liveCandidatesRef = useRef(liveCandidates);
  useEffect(() => {
    liveCandidatesRef.current = liveCandidates;
  }, [liveCandidates]);
  const candidateKey = liveCandidates
    .map((candidate) => candidate.place.id)
    .sort()
    .join("|");
  useEffect(() => {
    if (
      !rideRouteId ||
      view !== "point" ||
      poiOpen ||
      !candidateKey ||
      candidateKey === dismissedPoiKey
    )
      return;
    // Hold the aim briefly, then retain these rows until the rider dismisses them.
    const timer = setTimeout(() => {
      setPoiSnapshot(liveCandidatesRef.current);
      setActivePoi(null);
      setPoiExpanded(false);
      setPoiOpen(true);
    }, 450);
    return () => clearTimeout(timer);
  }, [candidateKey, dismissedPoiKey, poiOpen, rideRouteId, view]);
  useEffect(() => {
    if (!candidateKey) queueMicrotask(() => setDismissedPoiKey(""));
  }, [candidateKey]);
  const dismissPoi = () => {
    setDismissedPoiKey(candidateKey);
    setPoiOpen(false);
    setPoiExpanded(false);
  };

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
  const savedIndex = saved.length
    ? Math.max(0, Math.min(savedCursor, saved.length - 1))
    : 0;
  const toggleSaved = (place: Place) => {
    const removedIndex = saved.findIndex((entry) =>
      sameDiscoverySite(entry.place, place),
    );
    if (removedIndex >= 0) {
      const nextIndex = removedIndex < savedIndex ? savedIndex - 1 : savedIndex;
      setSavedCursor(Math.max(0, Math.min(nextIndex, saved.length - 2)));
    }
    setSaved((current) =>
      isSaved(current, place)
        ? unsavePlace(current, place)
        : savePlace(current, place),
    );
  };
  const storageNotice = storageError ? (
    <p className="inline-notice" role="alert">
      Device storage is full or blocked. Keep this tab open to retain your ride
      and saved discoveries.
    </p>
  ) : null;
  const nearestStation =
    position && route
      ? [...route.stops].sort(
          (a, b) => distance(position, a) - distance(position, b),
        )[0]
      : null;
  const start = (replay = false) => {
    replay = replay || demoLocation;
    const id = selected || (replay ? "10" : null);
    if (!id) return;
    if (!replay) {
      void sensors.point();
      sensors.locate();
    } else sensors.stop();
    setReplayOffset(0);
    setDirection(1);
    setHeadingMode(replay ? "auto" : "phone");
    setPlaying(true);
    setPoiOpen(false);
    setActivePoi(null);
    setDismissedPoiKey("");
    setView("point");
    setSelected(id);
    setRide({
      routeId: id,
      startedAt: Date.now(),
      replay,
      dismissed: [],
    });
  };
  const seek = (meters: number) => {
    setReplayOffset(
      Math.max(0, Math.min(timeline.total, meters)) - startMeters,
    );
  };
  const changeHeadingMode = (mode: HeadingMode) => {
    setHeadingMode(mode);
    if (mode === "phone") void sensors.point();
  };
  const changeLocationSource = (replay: boolean) => {
    sensors.stop();
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
    setPoiOpen(false);
    setActivePoi(null);
  };
  const selectCandidate = (candidate: PointingCandidate) => {
    setActivePoi({ place: candidate.place, distance: candidate.meters });
    setPoiExpanded(true);
    setPoiOpen(true);
    setView("point");
    audioGuide.schedule(candidate.place, Date.now());
  };
  const notInterested = (place: Place) => {
    setRide((current) => (current ? dismiss(current, place) : current));
    setActivePoi(null);
    dismissPoi();
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
    <div
      className={`app-shell ${!ride ? "route-select-shell" : `ride-map-shell is-${view}${poiOpen && view === "point" ? " has-poi-sheet" : ""}${poiOpen && poiExpanded && view === "point" ? " is-poi-expanded" : ""}`}`}
    >
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
          {!online && (
            <span className="offline-label">
              <WifiOff size={14} />
              Offline
            </span>
          )}
        </div>
      </header>
      <main id="main-content">
        {!ride && homeView === "saved" ? (
          <section
            className={`home-discoveries${saved.length ? " is-filled" : ""}`}
            aria-label="Saved discoveries"
          >
            {!hydrated ? (
              <div className="saved-empty" role="status">
                Loading saved discoveries…
              </div>
            ) : (
              <SavedPlaces
                entries={saved}
                index={savedIndex}
                onIndex={setSavedCursor}
                onToggle={toggleSaved}
                position={position}
              >
                <button
                  className="primary-button"
                  onClick={() => setHomeView("map")}
                >
                  Start discovering
                  <ArrowRight size={18} />
                </button>
              </SavedPlaces>
            )}
            {storageNotice}
          </section>
        ) : !ride ? (
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
                        </span>
                        {Number.isFinite(meters) && (
                          <span className="route-distance">
                            {formatDistance(meters)}
                          </span>
                        )}
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
            <div
              className="ride-top-controls"
              inert={poiOpen && poiExpanded && view === "point"}
            >
              <div className="ride-heading">
                <div className="ride-heading-text">
                  <div className="ride-route-name">
                    <h1>{route?.name.replace(" Branch", "")}</h1>
                  </div>
                  <p>
                    {nearestStation
                      ? `Near ${nearestStation.name.replace(" Station", "")}`
                      : "Waiting for location"}
                    {ride.replay ? (
                      <span> · Simulated ride</span>
                    ) : (
                      !canDetect && <span> · Paused</span>
                    )}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={finish}
                  aria-label="End ride"
                >
                  End
                </button>
              </div>
              <AudioGuideBar
                guide={audioGuide}
                saved={Boolean(
                  audioGuide.currentPlace &&
                  isSaved(saved, audioGuide.currentPlace),
                )}
                onSave={() => {
                  const place = audioGuide.currentPlace;
                  if (!place) return;
                  setSaved((current) => savePlace(current, place));
                }}
              />
              {packageState === "error" && (
                <div className="catalog-alert" role="alert">
                  <p>Couldn’t load places.</p>
                  <button
                    className="text-button"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    <RefreshCw size={13} />
                    Retry
                  </button>
                </div>
              )}
              {!ride.replay &&
                !canDetect &&
                poiOpen &&
                (gpsMessage || compassMessage) && (
                  <div className="ride-sensor-warning" role="status">
                    <p>{gpsMessage || compassMessage}</p>
                    <button className="text-button" onClick={resume}>
                      Retry sensors
                    </button>
                  </div>
                )}
            </div>
            {poiOpen && poiExpanded && view === "point" && (
              <div className="ride-expanded-status" role="status">
                <span className="ride-expanded-route">
                  {route?.name.replace(" Branch", "")}
                </span>
                <span>
                  {ride.replay
                    ? "Simulated ride"
                    : canDetect
                      ? "Discovering"
                      : "Sensors paused"}
                </span>
              </div>
            )}
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
                aria-pressed={view === "saved"}
                onClick={() => setView("saved")}
              >
                <span className="nav-icon">
                  <BookOpen size={25} strokeWidth={1.8} />
                  {saved.length > 0 && (
                    <span className="nav-count">{saved.length}</span>
                  )}
                </span>
                <span>Saved</span>
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
                  paths={route?.paths}
                  places={places}
                  color={route?.color}
                  liveHeading={activeHeadingMode === "phone"}
                  idleLabel={
                    ride.replay && activeHeadingMode === "auto" && !replayTarget
                      ? "Simulated aim"
                      : undefined
                  }
                  settling={Boolean(
                    ride.replay &&
                    activeHeadingMode === "auto" &&
                    catalogPending,
                  )}
                />
                <div className="ride-sensor-overlay">
                  {replayStatus === "empty" && (
                    <p className="aim-status" role="status">
                      No sourced place in range.
                    </p>
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
                  {directionEmpty && (
                    <p className="direction-empty" role="status">
                      Nothing in this direction.
                    </p>
                  )}
                  <div className="ride-status-row">
                    {ride.replay ? (
                      <div className="replay-controls">
                        {activeHeadingMode !== "auto" && (
                          <span>
                            {activeHeadingMode === "phone"
                              ? "Simulated train · phone compass"
                              : "Simulated train · joystick"}
                          </span>
                        )}
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
                          <button
                            className="secondary-button"
                            onClick={resume}
                          >
                            {sensors.gpsStatus === "idle"
                              ? "Enable sensors"
                              : "Retry sensors"}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="nearby-status">
                      <MapPin size={15} />
                      <span>
                        {catalogPending
                          ? "Loading places…"
                          : packageState === "error"
                            ? "Places unavailable"
                            : `${places.filter((p) => position && distance(position, p) < POINTING_RADIUS_M).length} places nearby`}
                      </span>
                      {packageState === "cached" && (
                        <span className="cached-label">Cached</span>
                      )}
                    </div>
                  </div>
                </div>
                <PoiSheet
                  open={poiOpen && view === "point"}
                  expanded={poiExpanded}
                  onExpandedChange={setPoiExpanded}
                  onDismiss={dismissPoi}
                  label={
                    activePoi
                      ? activePoi.place.name
                      : "Places in this direction"
                  }
                >
                  {!ride.replay &&
                    !canDetect &&
                    poiExpanded &&
                    (gpsMessage || compassMessage) && (
                      <div className="poi-sensor-warning" role="status">
                        <p>{gpsMessage || compassMessage}</p>
                        <button className="text-button" onClick={resume}>
                          Retry sensors
                        </button>
                      </div>
                    )}
                  {activePoi && view === "point" ? (
                    <>
                      {!poiExpanded && (
                        <button
                          className="poi-summary"
                          onClick={() => setPoiExpanded(true)}
                        >
                          <span>
                            <strong>{activePoi.place.name}</strong>
                            <small>{formatDistance(activePoi.distance)}</small>
                          </span>
                          <ChevronRight size={20} aria-hidden="true" />
                        </button>
                      )}
                      <div hidden={!poiExpanded}>
                        <PlaceCard
                          key={activePoi.place.id}
                          place={activePoi.place}
                          distance={activePoi.distance}
                          onNarrate={() => audioGuide.replay(activePoi.place)}
                          saved={isSaved(saved, activePoi.place)}
                          onSave={() => toggleSaved(activePoi.place)}
                          onNotInterested={() => notInterested(activePoi.place)}
                        />
                      </div>
                    </>
                  ) : (
                    <CandidateSheet
                      candidates={view === "point" ? poiSnapshot : []}
                      empty={false}
                      onSelect={selectCandidate}
                    />
                  )}
                </PoiSheet>
              </section>
              {view === "saved" && (
                <section className="saved-panel" aria-label="Saved discoveries">
                  <SavedPlaces
                    entries={saved}
                    index={savedIndex}
                    onIndex={setSavedCursor}
                    onToggle={toggleSaved}
                    position={position}
                    onNarrate={audioGuide.replay}
                  />
                </section>
              )}
            </div>
            {storageNotice}
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
        pausedReason={detectionPaused}
      />
      {!ride && (
        <nav className="floating-nav home-nav" aria-label="Main navigation">
          <button
            aria-current={homeView === "map" ? "page" : undefined}
            onClick={() => setHomeView("map")}
          >
            <span className="nav-icon">
              <RouteIcon size={25} strokeWidth={1.8} />
            </span>
            My ride
          </button>
          <button
            aria-current={homeView === "saved" ? "page" : undefined}
            onClick={() => setHomeView("saved")}
          >
            <span className="nav-icon">
              <BookOpen size={25} strokeWidth={1.8} />
              {saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </span>
            Saved
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

function SavedPlaces({
  entries,
  index,
  onIndex,
  onToggle,
  onNarrate,
  position,
  children,
}: {
  entries: SavedEntry[];
  index: number;
  onIndex: (index: number) => void;
  onToggle: (place: Place) => void;
  onNarrate?: (place: Place) => void;
  position?: { lat: number; lon: number } | null;
  children?: ReactNode;
}) {
  if (!entries.length) {
    return (
      <div className="saved-empty">
        <span className="empty-window" aria-hidden="true">
          <BookOpen size={31} strokeWidth={1.5} />
        </span>
        <h2>Nothing saved yet</h2>
        {children}
      </div>
    );
  }
  const current = Math.max(0, Math.min(index, entries.length - 1));
  const entry = entries[current];
  return (
    <>
      <h2 className="saved-heading">Saved</h2>
      <PlaceCard
        key={entry.place.id}
        place={entry.place}
        distance={position ? distance(position, entry.place) : Number.NaN}
        index={current}
        total={entries.length}
        onNavigate={onIndex}
        saved
        onSave={() => onToggle(entry.place)}
        onNarrate={onNarrate ? () => onNarrate(entry.place) : undefined}
      />
      {entries.length > 1 && (
        <div className="saved-strip">
          {entries.map((item, i) => {
            const meters = position
              ? distance(position, item.place)
              : Number.NaN;
            return (
              <button
                key={item.place.id}
                onClick={() => onIndex(i)}
                className={current === i ? "selected" : ""}
                aria-pressed={current === i}
              >
                <span className="saved-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="saved-strip-name">{item.place.name}</span>
                {Number.isFinite(meters) ? (
                  <span className="candidate-distance">
                    {formatDistance(meters)}
                  </span>
                ) : null}
                <ChevronRight size={13} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
