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
  POINTING_RADIUS_M,
  bearing,
  distance,
  formatDistance,
  routeDistance,
  cameraHeading,
  normalize,
} from "@/lib/geo";
import { discard, enqueue } from "@/lib/queue";
import {
  isSaved,
  mergeCatalogPlaces,
  mergeSavedNarration,
  refreshQueuedPlaces,
  refreshSaved,
  savePlace,
  unsavePlace,
} from "@/lib/saved";
import {
  chooseReplayTarget,
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
  const [homeView, setHomeView] = useState<"map" | "discoveries">("map");
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [savedCursor, setSavedCursor] = useState(0);
  const [discoveryList, setDiscoveryList] = useState<"ride" | "saved">("ride");
  const [poiOpen, setPoiOpen] = useState(false);
  const [poiExpanded, setPoiExpanded] = useState(false);
  const [poiSnapshot, setPoiSnapshot] = useState<PointingCandidate[]>([]);
  const [activePoiId, setActivePoiId] = useState<string | null>(null);
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
          setRide((current) => {
            if (!current) return current;
            const queue = refreshQueuedPlaces(
              current.queue,
              catalog,
              savedRef.current,
            );
            return queue === current.queue ? current : { ...current, queue };
          });
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
  const nearbyAudioPlaces = useMemo(
    () =>
      position && gpsFresh && !offRoute && ride
        ? places
            .filter(
              (place) =>
                !ride.dismissed.includes(place.id) &&
                distance(position, place) <= 1100 &&
                (Boolean(audioNarration(place)) ||
                  audioEvidence(place).length > 0),
            )
            .sort(
              (a, b) =>
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
    const merge = (place: Place) =>
      place.id === narratedPlace.id &&
      (place.story?.verifiedAt !== narratedPlace.story?.verifiedAt ||
        place.story?.evidenceHash !== narratedPlace.story?.evidenceHash)
        ? narratedPlace
        : place;
    setRide((current) => {
      if (
        !current ||
        !current.queue.some((entry) => merge(entry.place) !== entry.place)
      )
        return current;
      return {
        ...current,
        queue: current.queue.map((entry) => ({
          ...entry,
          place: merge(entry.place),
        })),
      };
    });
    setPlaces((current) =>
      current.some((place) => merge(place) !== place)
        ? current.map(merge)
        : current,
    );
    setSaved((current) => mergeSavedNarration(current, narratedPlace));
  }, []);
  const audioGuide = useAudioGuide(
    ride?.queue,
    nearbyAudioPlaces,
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
  const queueTone =
    view === "queue" && packageState === "error"
      ? "is-failed"
      : view === "queue" && replayStatus === "empty"
        ? "is-unsourced"
        : view === "queue" && catalogPending
          ? "is-waiting"
          : "";

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
      setActivePoiId(null);
      setPoiExpanded(false);
      setPoiOpen(true);
    }, 450);
    return () => clearTimeout(timer);
  }, [candidateKey, dismissedPoiKey, poiOpen, rideRouteId, view]);
  useEffect(() => {
    if (!candidateKey) queueMicrotask(() => setDismissedPoiKey(""));
  }, [candidateKey]);
  const activePoiIndex =
    ride?.queue.findIndex((entry) => entry.place.id === activePoiId) ?? -1;
  const activePoi =
    activePoiIndex >= 0 ? ride?.queue[activePoiIndex] : undefined;
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
  const currentIndex = Math.max(
    0,
    Math.min(cardIndex, (ride?.queue.length ?? 1) - 1),
  );
  const currentEntry = ride?.queue[currentIndex];
  const savedIndex = saved.length
    ? Math.max(0, Math.min(savedCursor, saved.length - 1))
    : 0;
  const visibleSaved = saved[savedIndex];
  const queuedSaved =
    visibleSaved && ride
      ? ride.queue.find((entry) =>
          sameDiscoverySite(entry.place, visibleSaved.place),
        )
      : undefined;
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
      Device storage is full or blocked. Keep this tab open to retain your queue
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
    setCardIndex(0);
    setPoiOpen(false);
    setActivePoiId(null);
    setDismissedPoiKey("");
    setDiscoveryList("ride");
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
    setEndConfirm(false);
  };
  const selectCandidate = (candidate: PointingCandidate) => {
    const now = Date.now();
    const existing =
      ride?.queue.findIndex((entry) =>
        sameDiscoverySite(entry.place, candidate.place),
      ) ?? -1;
    setCardIndex(existing >= 0 ? existing : (ride?.queue.length ?? 0));
    setActivePoiId(
      existing >= 0 ? ride!.queue[existing].place.id : candidate.place.id,
    );
    setPoiExpanded(true);
    setPoiOpen(true);
    setDiscoveryList("ride");
    setView("point");
    setRide((current) =>
      current
        ? enqueue(current, candidate.place, candidate.meters, now)
        : current,
    );
    audioGuide.schedule(candidate.place, now);
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
        {!ride && homeView === "discoveries" ? (
          <section
            className={`home-discoveries${saved.length ? " is-filled" : ""}`}
            aria-label="Saved discoveries"
          >
            {!hydrated ? (
              <div className="home-discoveries-card" role="status">
                Loading saved discoveries…
              </div>
            ) : saved.length === 0 ? (
              <div className="home-discoveries-card">
                <span className="empty-window" aria-hidden="true">
                  <BookOpen size={31} strokeWidth={1.5} />
                </span>
                <h1>No saved discoveries yet</h1>
                <button
                  className="primary-button"
                  onClick={() => setHomeView("map")}
                >
                  Start discovering
                  <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <>
                <div className="queue-heading">
                  <h2>Saved</h2>
                  <span className="count-badge">{saved.length}</span>
                </div>
                <SavedPlaces
                  entries={saved}
                  index={savedIndex}
                  onIndex={setSavedCursor}
                  onToggle={toggleSaved}
                  position={position}
                />
              </>
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
              <div
                className={`ride-heading${endConfirm ? " is-confirming" : ""}`}
              >
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
                {endConfirm ? (
                  <div className="end-confirm">
                    <span>End ride and clear the queue?</span>
                    <button
                      className="icon-button"
                      onClick={() => setEndConfirm(false)}
                      aria-label="Keep riding"
                    >
                      <X size={18} />
                    </button>
                    <button
                      className="end-confirm-action"
                      onClick={finish}
                    >
                      End ride
                    </button>
                  </div>
                ) : (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      ride.queue.length ? setEndConfirm(true) : finish()
                    }
                    aria-label="End ride"
                  >
                    End
                  </button>
                )}
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
                  if (!position) return;
                  setRide((current) =>
                    current
                      ? enqueue(current, place, distance(position, place))
                      : current,
                  );
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
                          entry={activePoi}
                          index={activePoiIndex}
                          total={ride.queue.length}
                          onNavigate={(index) => {
                            setActivePoiId(ride.queue[index]?.place.id ?? null);
                            setCardIndex(index);
                          }}
                          onNarrate={() =>
                            audioGuide.replay(activePoi.place.id)
                          }
                          saved={isSaved(saved, activePoi.place)}
                          onSave={() => toggleSaved(activePoi.place)}
                        />
                        <button
                          className="text-button poi-discard"
                          onClick={() => {
                            setRide((current) =>
                              current
                                ? discard(current, activePoi.place.id)
                                : current,
                            );
                            dismissPoi();
                          }}
                        >
                          Discard discovery
                        </button>
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
              {view === "queue" && (
                <section
                  className="queue-panel"
                  aria-label={
                    discoveryList === "saved"
                      ? "Saved discoveries"
                      : "Your discovery queue"
                  }
                >
                  <div className="queue-heading">
                    <h2>My discoveries</h2>
                  </div>
                  <div
                    className="queue-segments"
                    role="group"
                    aria-label="Discovery list"
                  >
                    <button
                      aria-pressed={discoveryList === "ride"}
                      onClick={() => setDiscoveryList("ride")}
                    >
                      This ride
                      <span className="segment-count">
                        {ride.queue.length}
                      </span>
                    </button>
                    <button
                      aria-pressed={discoveryList === "saved"}
                      onClick={() => setDiscoveryList("saved")}
                    >
                      Saved
                      <span className="segment-count">{saved.length}</span>
                    </button>
                  </div>
                  {discoveryList === "saved" ? (
                    <SavedPlaces
                      entries={saved}
                      index={savedIndex}
                      onIndex={setSavedCursor}
                      onToggle={toggleSaved}
                      distance={queuedSaved?.distance}
                      position={position}
                      onNarrate={
                        queuedSaved
                          ? () => audioGuide.replay(queuedSaved.place.id)
                          : undefined
                      }
                      onDiscard={
                        queuedSaved
                          ? () =>
                              setRide((current) =>
                                current
                                  ? discard(current, queuedSaved.place.id)
                                  : current,
                              )
                          : undefined
                      }
                    />
                  ) : currentEntry ? (
                    <>
                      <PlaceCard
                        key={currentEntry.place.id}
                        entry={currentEntry}
                        index={currentIndex}
                        total={ride.queue.length}
                        onNavigate={setCardIndex}
                        onNarrate={() =>
                          audioGuide.replay(currentEntry.place.id)
                        }
                        saved={isSaved(saved, currentEntry.place)}
                        onSave={() => toggleSaved(currentEntry.place)}
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
                              <span className="queue-index">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="queue-strip-name">
                                {entry.place.name}
                              </span>
                              <span className="candidate-distance">
                                {formatDistance(entry.distance)}
                              </span>
                              <ChevronRight size={13} />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className={`queue-empty${queueTone ? ` ${queueTone}` : ""}`}
                    >
                      <div className="empty-window">
                        <CompassIcon size={31} strokeWidth={1.2} />
                      </div>
                      {queueTone === "is-waiting" && (
                        <span className="steel-meter" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                      )}
                      <h3>
                        {view === "queue" && packageState === "error"
                          ? "Places didn’t load"
                          : view === "queue" && replayStatus === "empty"
                            ? "No sourced place in range."
                            : view === "queue" && catalogPending
                              ? "Loading places…"
                              : "Point your phone at a place"}
                      </h3>
                    </div>
                  )}
                </section>
              )}
            </div>
            {storageNotice}
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
            aria-current={homeView === "discoveries" ? "page" : undefined}
            onClick={() => setHomeView("discoveries")}
          >
            <span className="nav-icon">
              <BookOpen size={25} strokeWidth={1.8} />
              {saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
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

function SavedPlaces({
  entries,
  index,
  onIndex,
  onToggle,
  onNarrate,
  onDiscard,
  distance: cardDistance,
  position,
}: {
  entries: SavedEntry[];
  index: number;
  onIndex: (index: number) => void;
  onToggle: (place: Place) => void;
  onNarrate?: () => void;
  onDiscard?: () => void;
  distance?: number;
  position?: { lat: number; lon: number } | null;
}) {
  if (!entries.length) {
    return (
      <div className="queue-empty">
        <h3>Nothing saved yet.</h3>
      </div>
    );
  }
  const current = Math.max(0, Math.min(index, entries.length - 1));
  const entry = entries[current];
  return (
    <>
      <PlaceCard
        key={entry.place.id}
        entry={{
          place: entry.place,
          foundAt: entry.savedAt,
          distance: cardDistance ?? Number.NaN,
        }}
        index={current}
        total={entries.length}
        onNavigate={onIndex}
        saved
        onSave={() => onToggle(entry.place)}
        onNarrate={onNarrate}
        onDiscard={onDiscard}
      />
      {entries.length > 1 && (
        <div className="queue-strip">
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
                <span className="queue-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="queue-strip-name">{item.place.name}</span>
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
