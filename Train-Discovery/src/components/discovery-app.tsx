"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Binoculars,
  ChevronRight,
  Compass as CompassIcon,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { useSensors } from "@/hooks/use-sensors";
import { useAudioGuide } from "@/hooks/use-audio-guide";
import { audioEvidence, audioNarration } from "@/lib/narration";
import { POINTING_RADIUS_M, bearing, distance, routeDistance, cameraHeading, normalize } from "@/lib/geo";
import { discard, enqueue } from "@/lib/queue";
import {
  isSaved,
  markDiscovered,
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
import { demoPath, pathTimeline, pointAlong } from "@/lib/demo";
import { features } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { translate } from "@/lib/i18n-core";
import { useSettings } from "@/lib/settings";
import { clipKey } from "@/lib/clip-key";
import { composePlaceScript, cueLine, scriptText, INTRO_COUNT } from "@/lib/narration-script";
import { kmAhead, projectOnRoute, sideOf, type Direction } from "@/lib/route-geometry";
import type { JourneyPackage } from "@/lib/package-types";
import type { PlaceComposer } from "@/lib/podcast-director";
import {
  DEFAULT_NETWORK_ID,
  NETWORKS,
  hasFullExperience,
  isNetworkId,
  networkForRoute,
  type NetworkId,
} from "@/networks";
import { entryKm } from "@/features/look-ahead/cues";
import { sideAdvice, minutesAt, type Timetable } from "@/features/look-ahead/advisor";
import { useRouteTracking } from "@/features/look-ahead/use-route-tracking";
import { useLookAhead } from "@/features/look-ahead/use-look-ahead";
import { LookAheadBanner, SideIcon } from "@/features/look-ahead/look-ahead-banner";
import { AdvisorSheet } from "@/features/look-ahead/advisor-sheet";
import type { LookAheadCue } from "@/features/look-ahead/cues";
import { DevPanel, type HeadingMode } from "./dev-panel";
import type { Place, Position, RailData, Ride, SavedEntry } from "@/lib/types";
import { Compass } from "./compass";
import { PlaceCard } from "./place-card";
import { AudioGuideBar } from "./audio-guide-bar";
import { CandidateSheet } from "./candidate-sheet";
import { PoiSheet } from "./poi-sheet";
import { AppHeader } from "./app-header";
import { BottomNav, type Tab } from "./bottom-nav";
import { HomeScreen } from "./home-screen";
import { BookmarksScreen } from "./bookmarks-screen";
import { SettingsScreen } from "./settings-screen";
import "./gaze.css";
import "./ride-screen.css";

const EMPTY_RAIL: RailData = { source: "", importedAt: "", version: "", routes: [] };

export function DiscoveryApp({ rail: defaultRail }: { rail: RailData }) {
  const i18n = useI18n();
  const { t, plural, code } = i18n;
  const { settings, update: updateSettings } = useSettings();
  const [networkId, setNetworkId] = useState<NetworkId>(DEFAULT_NETWORK_ID);
  const [extraRail, setExtraRail] = useState<Partial<Record<NetworkId, RailData>>>({});
  const network = NETWORKS[networkId];
  const rail = networkId === DEFAULT_NETWORK_ID ? defaultRail : extraRail[networkId] ?? EMPTY_RAIL;
  const railLoading = rail === EMPTY_RAIL;
  const staticNetwork = network.id === "california-zephyr";
  const [demoLocation, setDemoLocation] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [allRoutes, setAllRoutes] = useState(false);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [journey, setJourney] = useState<Omit<JourneyPackage, "places"> | null>(null);
  const [packageState, setPackageState] = useState<
    "idle" | "loading" | "ready" | "cached" | "error"
  >("idle");
  const [retry, setRetry] = useState(0);
  const [online, setOnline] = useState(true);
  const [cardIndex, setCardIndex] = useState(0);
  const [replayOffset, setReplayOffset] = useState(0);
  const [devOpen, setDevOpen] = useState(false);
  const [speed, setSpeed] = useState(network.demo.speedKmh);
  const [direction, setDirection] = useState<Direction>(1);
  const [headingMode, setHeadingMode] = useState<HeadingMode>("auto");
  const [manualHeading, setManualHeading] = useState(0);
  const [manualPitch, setManualPitch] = useState(90);
  const [playing, setPlaying] = useState(true);
  const [endConfirm, setEndConfirm] = useState(false);
  const [tab, setTab] = useState<Tab>("ride");
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [preRide, setPreRide] = useState<{ replay: boolean } | null>(null);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorDirection, setAdvisorDirection] = useState<Direction>(1);
  const [cueAnnouncement, setCueAnnouncement] = useState("");
  const [poiOpen, setPoiOpen] = useState(false);
  const [poiExpanded, setPoiExpanded] = useState(false);
  const [poiSnapshot, setPoiSnapshot] = useState<PointingCandidate[]>([]);
  const [activePoiId, setActivePoiId] = useState<string | null>(null);
  const [dismissedPoiKey, setDismissedPoiKey] = useState("");
  const savedRef = useRef(saved);
  const placesRef = useRef(places);
  const storageBroken = useRef(false);
  const introCounter = useRef(0);
  const announceRef = useRef<((cue: LookAheadCue) => void) | null>(null);
  const sensors = useSensors();
  const route = rail.routes.find((r) => r.id === (ride?.routeId || selected));
  const rideRouteId = ride?.routeId;
  const fullExperience = Boolean(route && staticNetwork && hasFullExperience(route.id));
  const pointingRadius = staticNetwork ? network.nearbyM : POINTING_RADIUS_M;
  const view = tab === "ride" ? "point" : "queue";

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("network");
      const storedRide = readRide();
      const rideNetwork = storedRide ? networkForRoute(storedRide.routeId)?.id : undefined;
      // `/?network=lirr` loads a disabled network for development (DECISIONS D5).
      const chosen: NetworkId = isNetworkId(requested) ? requested : rideNetwork ?? DEFAULT_NETWORK_ID;
      setNetworkId(chosen);
      setSpeed(NETWORKS[chosen].demo.speedKmh);
      if (storedRide && networkForRoute(storedRide.routeId)?.id === chosen) {
        setRide(storedRide);
        setSelected(storedRide.routeId);
      }
      setSaved(readSaved());
      if (params.has("dev")) setDevOpen(true);
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
                (key.startsWith("gaze-") || key.startsWith("train-discovery-")) &&
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
  }, []);

  // Networks other than the default are fetched, not bundled into the page.
  useEffect(() => {
    if (networkId === DEFAULT_NETWORK_ID || extraRail[networkId]) return;
    const controller = new AbortController();
    fetch(NETWORKS[networkId].dataPath, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("rail"))))
      .then((data: RailData) => setExtraRail((current) => ({ ...current, [networkId]: data })))
      .catch(() => {});
    return () => controller.abort();
  }, [networkId, extraRail]);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    if (!hydrated) return;
    const rideOk = writeRide(ride);
    const savedOk = writeSaved(saved);
    const failed = !rideOk || !savedOk;
    if (storageBroken.current === failed) return;
    storageBroken.current = failed;
    queueMicrotask(() => setStorageError(failed));
  }, [ride, saved, hydrated]);

  // The route package loads for the ride, or for the advisor before a ride starts.
  const packageRouteId = rideRouteId ?? (preRide && selected ? selected : null);
  const packageLocale = packageRouteId && networkForRoute(packageRouteId)?.id === "california-zephyr" ? code : null;
  useEffect(() => {
    if (!packageRouteId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      setPackageState("loading");
    });
    fetch(`/api/journeys/${packageRouteId}${packageLocale ? `?locale=${encodeURIComponent(packageLocale)}` : ""}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Journey unavailable");
        const { places: catalog, ...extras } = (await response.json()) as JourneyPackage;
        if (controller.signal.aborted) return;
        setPlaces((current) => mergeCatalogPlaces(current.filter((place) => place.routeIds.includes(packageRouteId)), catalog, savedRef.current));
        setJourney(extras);
        setPackageState(
          response.headers.get("X-Discovery-Cache") === "offline" ? "cached" : "ready",
        );
        setRide((current) => {
          if (!current) return current;
          const queue = refreshQueuedPlaces(current.queue, catalog, savedRef.current);
          return queue === current.queue ? current : { ...current, queue };
        });
        setSaved((current) => refreshSaved(current, catalog));
      })
      .catch(() => {
        if (!controller.signal.aborted) setPackageState("error");
      });
    return () => controller.abort();
  }, [packageRouteId, packageLocale, retry]);

  // Segment rides start at their first stop (or last, riding the other way);
  // branch networks start beside the demo station.
  const { path: replayPath, startIndex: replayStart } = useMemo(() => {
    if (route?.experience && route.paths.length === 1) return { path: route.paths[0], startIndex: 0 };
    return demoPath(route, network.demo.location);
  }, [route, network]);
  const timeline = useMemo(() => pathTimeline(replayPath), [replayPath]);
  const totalKm = timeline.total / 1000;
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
    if (!ride?.replay || !playing || preRide) return;
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
  }, [ride?.replay, playing, speed, direction, startMeters, timeline.total, preRide]);

  useEffect(() => {
    // An empty timeline means the route has not loaded yet, not that the train arrived.
    if (
      ride?.replay &&
      playing &&
      timeline.total > 0 &&
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
      ? chooseReplayTarget(places, ride, position, placesById, pointingRadius)
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
    position && route && routeDistance(position, route) > Math.max(1500, staticNetwork ? 3000 : 0),
  );

  const tracking = useRouteTracking({
    route,
    enabled: staticNetwork && Boolean(ride),
    position: ride && !ride.replay ? sensors.position : null,
    replay: ride?.replay ? { km: progress / 1000, speedKmh: playing ? speed : 0, direction } : null,
    now: sensors.now,
  });
  const bookmarkedIds = useMemo(
    () => new Set(saved.filter((entry) => !ride || entry.place.routeIds.includes(ride.routeId)).map((entry) => entry.place.id)),
    [saved, ride],
  );
  const lookAheadPlaces = useMemo(
    () => places.filter((place) => place.kind !== "place" || bookmarkedIds.has(place.id)),
    [places, bookmarkedIds],
  );
  const mapPlaces = useMemo(
    () => places.filter((place) => place.kind !== "place"),
    [places],
  );
  const onCue = useCallback((cue: LookAheadCue) => announceRef.current?.(cue), []);
  const cue = useLookAhead({
    places: lookAheadPlaces,
    tracking,
    facing: settings.facing,
    bookmarked: bookmarkedIds,
    enabled: features.lookAhead && fullExperience && Boolean(ride) && !preRide,
    rideKey: ride?.startedAt ?? null,
    now: sensors.now,
    onCue,
  });
  const cuePlace = cue ? placesById.get(cue.poiId) ?? null : null;

  const nearbyAudioPlaces = useMemo(() => {
    if (!(position && gpsFresh && !offRoute && ride)) return [];
    if (staticNetwork && tracking.km !== null) {
      // Narrate a place as the train reaches it along the line, up to the corridor's width away.
      const travel = tracking.direction ?? 1;
      return places
        .filter((place) => {
          if (ride.dismissed.includes(place.id) || (place.lateralM ?? Infinity) > network.nearbyM) return false;
          const entry = entryKm(place, travel);
          if (entry === null) return false;
          const ahead = kmAhead(entry, tracking.km!, travel);
          return ahead > -0.4 && ahead < 1.2;
        })
        .sort((a, b) => kmAhead(entryKm(a, travel) ?? 0, tracking.km!, travel) - kmAhead(entryKm(b, travel) ?? 0, tracking.km!, travel));
    }
    return places
      .filter((place) =>
        !ride.dismissed.includes(place.id) &&
        distance(position, place) <= 1100 &&
        (Boolean(audioNarration(place)) || audioEvidence(place).length > 0),
      )
      .sort((a, b) =>
        Number(audioNarration(b)?.kind === "verified") -
          Number(audioNarration(a)?.kind === "verified") ||
        distance(position, a) - distance(position, b),
      );
  }, [position, gpsFresh, offRoute, ride, places, staticNetwork, tracking.km, tracking.direction, network.nearbyM]);

  // A story checked on the server replaces the place everywhere it is shown.
  const mergeStory = useCallback((narratedPlace: Place) => {
    if (!narratedPlace?.story) return;
    const merge = (place: Place) => place.id === narratedPlace.id &&
      (place.story?.verifiedAt !== narratedPlace.story?.verifiedAt ||
       place.story?.evidenceHash !== narratedPlace.story?.evidenceHash)
      ? narratedPlace : place;
    setRide((current) => {
      if (!current || !current.queue.some((entry) => merge(entry.place) !== entry.place)) return current;
      return { ...current, queue: current.queue.map((entry) => ({ ...entry, place: merge(entry.place) })) };
    });
    setPlaces((current) => current.some((place) => merge(place) !== place) ? current.map(merge) : current);
    setSaved((current) => mergeSavedNarration(current, narratedPlace));
  }, []);
  const rememberNarration = useCallback((narratedPlace: Place) => {
    introCounter.current += 1;
    setSaved((current) => markDiscovered(current, narratedPlace));
    mergeStory(narratedPlace);
  }, [mergeStory]);

  // Places about to be shown or spoken get their story checked ahead of time.
  const storyRequests = useRef(new Set<string>());
  const storyTargets = useMemo(() => {
    if (!ride) return [];
    const targets = [
      ...ride.queue.map((entry) => entry.place),
      ...(cuePlace ? [cuePlace] : []),
      ...poiSnapshot.map((candidate) => candidate.place),
      ...nearbyAudioPlaces.slice(0, 3),
    ];
    return targets.filter((place) => !place.story);
  }, [ride, cuePlace, poiSnapshot, nearbyAudioPlaces]);
  useEffect(() => {
    for (const place of storyTargets) {
      if (storyRequests.current.has(place.id)) continue;
      storyRequests.current.add(place.id);
      fetch(`/api/story/${encodeURIComponent(place.id)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { story?: Place["story"]; evidence?: Place["evidence"] } | null) => {
          if (data?.story) mergeStory({ ...place, story: data.story, evidence: data.evidence ?? place.evidence });
        })
        // Offline: ask again the next time the place comes up.
        .catch(() => storyRequests.current.delete(place.id));
    }
  }, [storyTargets, mergeStory]);

  // Static networks compose each story locally: verified claims (or a checked
  // translation), a labeled excerpt, or basic map facts, plus templated leads.
  const rideStartStop = useMemo(() => {
    if (!route || !ride) return null;
    return (tracking.direction ?? direction) === -1 ? route.stops[route.stops.length - 1] : route.stops[0];
  }, [route, ride, direction, tracking.direction]);
  const tunnelExit = useMemo(() => {
    if (tracking.km === null || !tracking.direction) return false;
    return (journey?.connectivity ?? []).some((zone) => {
      if (zone.reason !== "tunnel") return false;
      const exit = tracking.direction === 1 ? zone.endKm : zone.startKm;
      const since = kmAhead(tracking.km!, exit, tracking.direction!);
      return since >= 0 && since < 1.5;
    });
  }, [journey?.connectivity, tracking.km, tracking.direction]);
  const compose: PlaceComposer | null = useMemo(() => {
    if (!staticNetwork) return null;
    const clips = journey?.clips ?? {};
    return (place, context) => {
      const side = tracking.direction ? sideOf(place, tracking.direction, settings.facing) : null;
      const count = introCounter.current;
      const traveled = tracking.km !== null ? Math.abs(tracking.km - (tracking.direction === -1 ? totalKm : 0)) : 0;
      const callback = context === "nearby" && tunnelExit
        ? translate(code, "narration.context.afterTunnel")
        : context === "nearby" && count % 3 === 2 && traveled >= 10 && rideStartStop
          ? translate(code, "narration.callback.distance", {
              distance: new Intl.NumberFormat(code, { style: "unit", unit: "kilometer", unitDisplay: "long", maximumFractionDigits: 0 }).format(Math.round(traveled / 5) * 5),
              place: rideStartStop.name,
            })
          : null;
      const script = composePlaceScript({
        place, code, context, side,
        content: journey?.content?.[place.id],
        introIndex: count % INTRO_COUNT,
        callback,
      });
      if (!script) return null;
      return {
        script: {
          name: place.name,
          text: scriptText(script),
          kind: script.kind,
          sources: script.sources,
          language: script.language,
        },
        parts: script.parts.map((part) => ({
          text: part.text,
          ...(clips[clipKey(part.text, script.language)] ? { clip: clips[clipKey(part.text, script.language)].url } : {}),
        })),
      };
    };
  }, [staticNetwork, journey?.clips, journey?.content, tracking.direction, tracking.km, settings.facing, code, tunnelExit, rideStartStop, totalKm]);

  const audioGuide = useAudioGuide(
    ride?.queue,
    nearbyAudioPlaces,
    ride?.dismissed,
    ride?.startedAt ?? null,
    {
      routeId: ride?.routeId ?? "", routeName: route?.name ?? "", stops: route?.stops ?? [],
      position: gpsFresh && !offRoute ? position : null,
      simulation: Boolean(ride?.replay),
      livePosition: ride && !ride.replay && gpsFresh && !offRoute && sensors.gpsStatus === "active"
        ? sensors.position : null,
      onNarrated: rememberNarration,
      language: code,
      nearbyMeters: staticNetwork ? network.nearbyM + 1000 : undefined,
      compose,
      clips: journey?.clips,
      liveAudio: staticNetwork ? features.liveNarration : true,
      ...(staticNetwork && route ? { segment: { network: network.name, segment: route.name } } : {}),
    },
  );
  const { announce, stop: stopAudio } = audioGuide;

  useEffect(() => {
    announceRef.current = (next: LookAheadCue) => {
      const place = placesRef.current.find((candidate) => candidate.id === next.poiId);
      if (!place) return;
      const side = t(`side.${next.side ?? "unknown"}`);
      const eta = next.etaSeconds;
      setCueAnnouncement(eta === null || next.phase === "now"
        ? t("lookAhead.announceNow", { side, name: place.name })
        : t("lookAhead.announce", { side, eta: i18n.duration(eta), name: place.name }));
      if (eta === null || eta < 20) return;
      const cue = { placeId: place.id, side: next.side ?? null, minutes: Math.max(1, Math.round(eta / 60)), saved: bookmarkedIds.has(place.id) };
      announce({
        key: `cue:${place.id}`,
        name: place.name,
        request: { type: "announcement", ...(staticNetwork ? { cue, ...(code !== "en" ? { locale: code } : {}) } : {}) },
        fallback: {
          name: place.name,
          text: cueLine(code, { name: place.name, side: cue.side, minutes: cue.minutes, saved: cue.saved }),
          kind: "announcement",
          sources: [],
          language: code,
        },
        // Never speak a cue after the place has passed.
        expiresAt: Date.now() + Math.max(5_000, (eta - 15) * 1000),
        priority: 0,
      });
    };
  }, [announce, bookmarkedIds, code, i18n, staticNetwork, t]);

  // Narration off in Settings stops the guide.
  useEffect(() => {
    if (!settings.sound) stopAudio();
  }, [settings.sound, stopAudio]);

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
      ? t("ride.pausedLoading")
      : !canDetect && replayStatus === "unavailable"
        ? t("ride.pausedUnavailable")
        : !canDetect && replayStatus === "empty"
          ? t("ride.pausedEmpty")
          : undefined;
  const queueTone =
    tab === "discoveries" && packageState === "error"
      ? "is-failed"
      : tab === "discoveries" && replayStatus === "empty"
        ? "is-unsourced"
        : tab === "discoveries" && catalogPending
          ? "is-waiting"
          : "";

  const liveCandidates =
    canDetect && position && heading !== null && ride
      ? rankPointingCandidates(places, position, heading, ride, placesById, 4, pointingRadius)
      : [];
  const directionEmpty = Boolean(
    canDetect &&
    !catalogPending &&
    packageState !== "error" &&
    liveCandidates.length === 0,
  );
  const liveCandidatesRef = useRef(liveCandidates);
  useEffect(() => {
    liveCandidatesRef.current = liveCandidates;
  });
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

  const currentIndex = Math.max(
    0,
    Math.min(cardIndex, (ride?.queue.length ?? 1) - 1),
  );
  const currentEntry = ride?.queue[currentIndex];
  const toggleBookmark = useCallback((place: Place) => {
    const queued = ride?.queue.some((entry) => sameDiscoverySite(entry.place, place));
    setSaved((current) => (isSaved(current, place)
      ? unsavePlace(current, place)
      : savePlace(current, place, Date.now(), {
          routeId: ride?.routeId ?? place.routeIds[0],
          networkId: network.id,
          ...(queued ? { discoveredAt: Date.now() } : {}),
        })));
  }, [ride, network.id]);
  const storageNotice = storageError ? (
    <p className="inline-notice" role="alert">{t("storage.failed")}</p>
  ) : null;
  const nearestStation =
    position && route
      ? [...route.stops].sort(
          (a, b) => distance(position, a) - distance(position, b),
        )[0]
      : null;

  const resetPoi = () => {
    setPoiOpen(false);
    setPoiExpanded(false);
    setActivePoiId(null);
    setDismissedPoiKey("");
  };
  const begin = (replay: boolean, id: string, travel: Direction = 1) => {
    if (!replay) {
      void sensors.point();
      sensors.locate();
    } else sensors.stop();
    // Riding the other way starts at the far end of the segment.
    setReplayOffset(travel === -1 ? timeline.total - startMeters : 0);
    setDirection(travel);
    setSpeed(network.demo.speedKmh);
    setHeadingMode(replay ? "auto" : "phone");
    setPlaying(true);
    setCardIndex(0);
    resetPoi();
    setTab("ride");
    setSelected(id);
    setPreRide(null);
    setRide({
      routeId: id,
      networkId: network.id,
      startedAt: Date.now(),
      replay,
      queue: [],
      dismissed: [],
    });
  };
  const start = (replay = false) => {
    if (railLoading) return;
    replay = replay || demoLocation;
    const id = selected || (replay ? network.demo.routeId : null);
    if (!id) return;
    // Full-experience segments show "Best side to sit" before the ride starts.
    if (features.lookAhead && staticNetwork && hasFullExperience(id)) {
      setSelected(id);
      setAdvisorDirection(1);
      setPreRide({ replay });
      return;
    }
    begin(replay, id);
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
  // Dev-panel shortcuts: configured places, then stations, as offsets along the replay path.
  const devStations = useMemo(() => {
    const along = (point: { lat: number; lon: number }) => {
      let nearest = Infinity;
      let index = 0;
      timeline.path.forEach(([lat, lon], i) => {
        const meters = distance(point, { lat, lon });
        if (meters < nearest) {
          nearest = meters;
          index = i;
        }
      });
      return { nearest, offset: timeline.meters[index] };
    };
    const jumps = route && network.segments.length
      ? network.demo.jumps.flatMap((jump) => {
          const projection = route.paths[0] ? projectOnRoute({ path: timeline.path, km: timeline.meters.map((m) => m / 1000), totalKm: timeline.total / 1000 }, jump) : null;
          return projection && projection.lateralM < 2000
            ? [{ id: `jump-${jump.id}`, name: jump.label, offset: projection.km * 1000 }]
            : [];
        })
      : [];
    const stations = (route?.stops ?? []).flatMap((station) => {
      const { nearest, offset } = along(station);
      return nearest < 200 ? [{ ...station, offset }] : [];
    });
    return [...jumps, ...stations.sort((a, b) => a.offset - b.offset)];
  }, [route, timeline, network]);
  const resume = () => {
    void sensors.point();
    sensors.locate();
  };
  const finish = () => {
    sensors.stop();
    setRide(null);
    setPlaces([]);
    setJourney(null);
    setEndConfirm(false);
    setAdvisorOpen(false);
    resetPoi();
  };
  /** Adds a place to the ride and opens its story in the sheet, over the map. */
  const openPlace = (place: Place, meters: number) => {
    const now = Date.now();
    const existing =
      ride?.queue.findIndex((entry) => sameDiscoverySite(entry.place, place)) ?? -1;
    setCardIndex(existing >= 0 ? existing : (ride?.queue.length ?? 0));
    setActivePoiId(existing >= 0 ? ride!.queue[existing].place.id : place.id);
    setPoiExpanded(true);
    setPoiOpen(true);
    setTab("ride");
    setRide((current) => (current ? enqueue(current, place, meters, now) : current));
    setSaved((current) => markDiscovered(current, place, now));
    if (existing < 0) audioGuide.schedule(place, now);
  };
  const selectCandidate = (candidate: PointingCandidate) =>
    openPlace(candidate.place, candidate.meters);
  const gpsMessage =
    sensors.gpsStatus === "denied"
      ? t("gps.denied")
      : sensors.gpsStatus === "inaccurate"
        ? t("gps.inaccurate")
        : sensors.gpsStatus === "requesting"
          ? t("gps.requesting")
          : sensors.gpsStatus === "unavailable"
            ? t("gps.unavailable")
            : sensors.gpsStatus === "idle"
              ? t("gps.idle")
              : !gpsFresh
                ? t("gps.lost")
                : null;
  const compassMessage =
    sensors.compassStatus === "denied"
      ? t("compass.denied")
      : sensors.compassStatus === "flat"
        ? t("compass.flat")
        : sensors.compassStatus === "inaccurate"
          ? t("compass.inaccurate")
          : sensors.compassStatus === "unavailable"
            ? t("compass.unavailable")
            : heading === null
              ? t("compass.waitingReading")
              : null;

  // Side advice for the next half hour: by current speed, or by the timetable when stopped.
  const timetable: Timetable = useMemo(
    () => (journey?.timetable ?? []).map(({ km, minutes }) => ({ km, minutes })),
    [journey?.timetable],
  );
  const nextWindow = useMemo(() => {
    if (!fullExperience || tracking.km === null || !tracking.direction) return null;
    const speedKmh = tracking.speedKmh && tracking.speedKmh > 5 ? tracking.speedKmh : null;
    let toKm = tracking.km + tracking.direction * (speedKmh ? speedKmh / 2 : 25);
    if (!speedKmh && timetable.length > 1) {
      const now = minutesAt(timetable, tracking.km);
      const later = timetable.find((stop) => now !== null && Math.abs(stop.minutes - now) >= 30 && kmAhead(stop.km, tracking.km!, tracking.direction!) > 0);
      if (later) toKm = later.km;
    }
    const advice = sideAdvice(lookAheadPlaces, { fromKm: tracking.km, toKm, direction: tracking.direction, facing: settings.facing }, bookmarkedIds);
    return advice.left.count + advice.right.count ? advice.better : null;
  }, [fullExperience, tracking.km, tracking.direction, tracking.speedKmh, timetable, lookAheadPlaces, settings.facing, bookmarkedIds]);

  const showAdvisor = Boolean(preRide) || advisorOpen;
  const advisor = showAdvisor && route ? (
    <AdvisorSheet
      places={lookAheadPlaces}
      fromKm={preRide ? (advisorDirection === -1 ? totalKm : 0) : tracking.km ?? 0}
      totalKm={totalKm}
      direction={preRide ? advisorDirection : tracking.direction}
      facing={settings.facing}
      bookmarked={bookmarkedIds}
      timetable={timetable}
      ends={{ start: route.stops[0]?.name ?? "", end: route.stops[route.stops.length - 1]?.name ?? "" }}
      loading={packageState === "loading" || packageState === "idle"}
      preRide={Boolean(preRide)}
      onDirection={preRide ? setAdvisorDirection : undefined}
      onFacing={(facing) => updateSettings({ facing })}
      onStart={preRide ? () => begin(preRide.replay, route.id, advisorDirection) : undefined}
      onClose={() => {
        setPreRide(null);
        setAdvisorOpen(false);
      }}
    />
  ) : null;

  const queueCount = ride?.queue.length ?? null;
  const thumbnails = journey?.thumbnails ?? {};
  const historyFor = (id: string) => journey?.history?.find((image) => image.poiId === id);
  const sideFor = (place: Place) =>
    tracking.direction ? sideOf(place, tracking.direction, settings.facing) : null;
  const routeTitle = route?.name.replace(" Branch", "") ?? "";

  const renderBookmarkCard = (entry: SavedEntry, index: number) => {
    const queued = ride?.queue.find((item) => sameDiscoverySite(item.place, entry.place));
    return (
      <PlaceCard
        key={entry.place.id}
        entry={{ place: entry.place, foundAt: entry.savedAt, distance: queued?.distance ?? Number.NaN }}
        index={index}
        total={1}
        onNavigate={() => {}}
        bookmarked
        onToggleBookmark={() => toggleBookmark(entry.place)}
        onNarrate={queued ? () => audioGuide.replay(queued.place.id) : undefined}
        content={journey?.content?.[entry.place.id]}
        history={historyFor(entry.place.id)}
        side={sideFor(entry.place)}
      />
    );
  };
  const bookmarksScreen = (
    <BookmarksScreen
      entries={saved}
      routes={rail.routes}
      ride={ride ? { routeId: ride.routeId, km: tracking.km, direction: tracking.direction, speedKmh: tracking.speedKmh, discoveredIds: new Set(ride.queue.map((entry) => entry.place.id)) } : null}
      thumbnails={thumbnails}
      onRemove={(entry) => toggleBookmark(entry.place)}
      renderCard={renderBookmarkCard}
    />
  );
  const poiExpandedOnMap = poiOpen && poiExpanded && view === "point";
  // Grip row, then a summary or up to four candidate rows, then the body's bottom padding.
  const poiContentHeight = 56 + (activePoi ? 84 : Math.max(1, poiSnapshot.length) * 64 + 8) + 18;

  return (
    <div
      style={ride ? ({ "--poi-sheet-content-height": `${poiContentHeight}px` } as CSSProperties) : undefined}
      className={`app-shell ${!ride ? "route-select-shell" : `ride-map-shell is-${view}${poiOpen && view === "point" ? " has-poi-sheet" : ""}${poiExpandedOnMap ? " is-poi-expanded" : ""}`} tab-${tab}`}
    >
      <AppHeader online={online} devOpen={devOpen} onToggleDev={() => setDevOpen((open) => !open)} />
      <main id="main-content">
        {!ride && tab === "bookmarks" ? (
          bookmarksScreen
        ) : !ride && tab === "settings" ? (
          <SettingsScreen />
        ) : !ride && tab === "discoveries" ? (
          <section className="home-discoveries" aria-labelledby="home-discoveries-title">
            <div className="screen-heading">
              <h1 id="home-discoveries-title">{t("nav.discoveries")}</h1>
            </div>
            <div className="home-discoveries-card">
              <span className="empty-window" aria-hidden="true">
                <Binoculars size={31} strokeWidth={1.5} />
              </span>
              <h2>{t("home.discoveriesEmpty")}</h2>
              <button className="primary-button" onClick={() => setTab("ride")}>
                {t("home.startDiscovering")}
                <ArrowRight size={18} />
              </button>
              {saved.length > 0 && (
                <button className="text-button" onClick={() => setTab("bookmarks")}>
                  {t("home.openBookmarks")}
                </button>
              )}
            </div>
            {storageNotice}
          </section>
        ) : !ride ? (
          <HomeScreen
            network={network}
            routes={rail.routes}
            railLoading={railLoading}
            hydrated={hydrated}
            selected={selected}
            onSelect={(id, fromMap) => {
              setSelected(id);
              if (fromMap) {
                setAllRoutes(true);
                setRouteSheetOpen(true);
              }
            }}
            search={search}
            onSearch={setSearch}
            allRoutes={allRoutes}
            onAllRoutes={setAllRoutes}
            sheetOpen={routeSheetOpen}
            onSheetOpen={setRouteSheetOpen}
            demoLocation={demoLocation}
            onUseDemo={() => {
              sensors.stop();
              setDemoLocation(true);
              setAllRoutes(false);
            }}
            onLocate={() => {
              setDemoLocation(false);
              setAllRoutes(false);
              setRouteSheetOpen(true);
              sensors.locate();
            }}
            position={sensors.position}
            gpsStatus={sensors.gpsStatus}
            gpsMessage={gpsMessage}
            onStart={start}
          />
        ) : (
          <div className="ride-layout">
            <div className="ride-top-controls" inert={poiExpandedOnMap}>
              <div className={`ride-heading${endConfirm ? " is-confirming" : ""}`}>
                <div className="ride-heading-text">
                  <div className="ride-route-name">
                    <h1>{routeTitle}</h1>
                  </div>
                  <p>
                    {nearestStation
                      ? t("ride.near", { station: nearestStation.name.replace(" Station", "") })
                      : t("ride.waitingLocation")}
                    {ride.replay ? (
                      <span> · {t("ride.simulated")}</span>
                    ) : (
                      !canDetect && <span> · {t("ride.paused")}</span>
                    )}
                  </p>
                </div>
                {endConfirm ? (
                  <div className="end-confirm">
                    <span>{t("ride.endConfirm")}</span>
                    <button
                      className="icon-button"
                      onClick={() => setEndConfirm(false)}
                      aria-label={t("ride.keepRiding")}
                    >
                      <X size={18} />
                    </button>
                    <button className="end-confirm-action" onClick={finish}>
                      {t("ride.end")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      ride.queue.length ? setEndConfirm(true) : finish()
                    }
                    aria-label={t("ride.end")}
                  >
                    {t("ride.endShort")}
                  </button>
                )}
              </div>
              <AudioGuideBar
                guide={audioGuide}
                bookmarked={Boolean(audioGuide.currentPlace && isSaved(saved, audioGuide.currentPlace))}
                onToggleBookmark={() => {
                  const place = audioGuide.currentPlace;
                  if (!place) return;
                  toggleBookmark(place);
                  if (!position || isSaved(saved, place)) return;
                  setRide((current) => current ? enqueue(current, place, distance(position, place)) : current);
                }}
                soundOff={!settings.sound}
                onSoundOn={() => updateSettings({ sound: true })}
              />
              {view === "point" && cue && cuePlace && cuePlace.id !== audioGuide.currentPlace?.id && (
                <LookAheadBanner
                  cue={cue}
                  place={cuePlace}
                  thumbnail={thumbnails[cuePlace.id]}
                  bookmarked={bookmarkedIds.has(cuePlace.id)}
                  hasHistory={Boolean(historyFor(cuePlace.id))}
                  onOpen={() => openPlace(cuePlace, position ? distance(position, cuePlace) : Number.NaN)}
                  onToggleBookmark={() => toggleBookmark(cuePlace)}
                />
              )}
              {packageState === "error" && (
                <div className="catalog-alert" role="alert">
                  <p>{t("ride.catalogFailed")}</p>
                  <button
                    className="text-button"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    <RefreshCw size={13} />
                    {t("app.retry")}
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
                      {t("ride.retrySensors")}
                    </button>
                  </div>
                )}
            </div>
            {audioGuide.caption && !poiExpandedOnMap && (
              <div className="ride-caption-slot">
                <p className="ride-caption" lang={audioGuide.script?.language ?? "en"}>{audioGuide.caption}</p>
              </div>
            )}
            {poiExpandedOnMap && (
              <div className="ride-expanded-status" role="status">
                <span className="ride-expanded-route">{routeTitle}</span>
                <span>
                  {ride.replay
                    ? t("ride.simulated")
                    : canDetect
                      ? t("ride.discovering")
                      : t("ride.sensorsPaused")}
                </span>
              </div>
            )}
            <div className={`ride-columns mobile-${view}`}>
              <section className="point-panel" aria-label={t("ride.pointPanel")}>
                <Compass
                  heading={heading}
                  position={tracking.estimated && tracking.estimatedPosition ? tracking.estimatedPosition : position}
                  paths={route?.paths}
                  places={mapPlaces}
                  color={route?.color}
                  liveHeading={activeHeadingMode === "phone"}
                  idleLabel={
                    ride.replay && activeHeadingMode === "auto" && !replayTarget
                      ? t("compass.simulatedAim")
                      : undefined
                  }
                  settling={Boolean(
                    ride.replay && activeHeadingMode === "auto" && catalogPending,
                  )}
                  radius={pointingRadius}
                />
                <div className="ride-sensor-overlay">
                  {replayStatus === "empty" && !(staticNetwork && !fullExperience) && (
                    <p className="aim-status" role="status">{t("ride.noSourced")}</p>
                  )}
                  {ride.replay && activeHeadingMode === "phone" && compassMessage && (
                    <p className="inline-notice" role="status">{compassMessage}</p>
                  )}
                  {ride.replay && activeHeadingMode === "manual" && heading === null && (
                    <p className="inline-notice" role="status">{t("ride.flatSim")}</p>
                  )}
                  {!ride.replay && activeHeadingMode === "manual" && (
                    <p className="inline-notice">{t("ride.gpsJoystick")}</p>
                  )}
                  {offRoute && !ride.replay && (
                    <p className="inline-notice">{t("ride.offRoute")}</p>
                  )}
                  {staticNetwork && !fullExperience && (
                    <p className="inline-notice">{t("ride.stationsOnly")}</p>
                  )}
                  {directionEmpty && (
                    <p className="direction-empty" role="status">
                      {t("chooser.empty")}
                    </p>
                  )}
                  <div className="ride-status-row">
                    {ride.replay ? (
                      <div className="replay-controls">
                        {activeHeadingMode !== "auto" && (
                          <span>
                            {activeHeadingMode === "phone"
                              ? t("ride.simPhone")
                              : t("ride.simJoystick")}
                          </span>
                        )}
                        <button
                          className="icon-button"
                          onClick={() => setPlaying((v) => !v)}
                          aria-label={playing ? t("ride.pauseReplay") : t("ride.playReplay")}
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
                            {sensors.gpsStatus === "idle" ? t("ride.enableSensors") : t("ride.retrySensors")}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="nearby-status">
                      <MapPin size={15} />
                      <span>
                        {catalogPending
                          ? t("ride.loadingPlaces")
                          : packageState === "error"
                            ? t("ride.placesUnavailable")
                            : plural("ride.placesNearby", mapPlaces.filter((p) => position && distance(position, p) < pointingRadius).length)}
                      </span>
                      {packageState === "cached" && (
                        <span className="cached-label">{t("ride.cached")}</span>
                      )}
                    </div>
                    {fullExperience && features.lookAhead && (
                      <button
                        type="button"
                        className="side-advice-pill"
                        onClick={() => setAdvisorOpen(true)}
                        aria-haspopup="dialog"
                      >
                        <SideIcon
                          side={!nextWindow || nextWindow === "even" ? "both" : nextWindow}
                          size={15}
                        />
                        {!nextWindow
                          ? t("advisor.open")
                          : nextWindow === "even"
                            ? t("advisor.nextWindowEven")
                            : t("advisor.nextWindow", { side: t(`side.short.${nextWindow}`) })}
                      </button>
                    )}
                  </div>
                </div>
                <PoiSheet
                  open={poiOpen && view === "point"}
                  expanded={poiExpanded}
                  onExpandedChange={setPoiExpanded}
                  onDismiss={dismissPoi}
                  label={activePoi ? activePoi.place.name : t("chooser.label")}
                >
                  {!ride.replay &&
                    !canDetect &&
                    poiExpanded &&
                    (gpsMessage || compassMessage) && (
                      <div className="poi-sensor-warning" role="status">
                        <p>{gpsMessage || compassMessage}</p>
                        <button className="text-button" onClick={resume}>
                          {t("ride.retrySensors")}
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
                            {Number.isFinite(activePoi.distance) && (
                              <small>{i18n.distance(activePoi.distance)}</small>
                            )}
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
                          onNarrate={() => audioGuide.replay(activePoi.place.id)}
                          bookmarked={isSaved(saved, activePoi.place)}
                          onToggleBookmark={() => toggleBookmark(activePoi.place)}
                          content={journey?.content?.[activePoi.place.id]}
                          history={historyFor(activePoi.place.id)}
                          side={sideFor(activePoi.place)}
                        />
                        <button
                          className="text-button poi-discard"
                          onClick={() => {
                            setRide((current) =>
                              current ? discard(current, activePoi.place.id) : current,
                            );
                            dismissPoi();
                          }}
                        >
                          {t("card.discardDiscovery")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <CandidateSheet
                      candidates={view === "point" ? poiSnapshot : []}
                      empty={false}
                      onSelect={selectCandidate}
                      isBookmarked={(place) => isSaved(saved, place)}
                      onToggleBookmark={toggleBookmark}
                    />
                  )}
                </PoiSheet>
              </section>
              {tab === "discoveries" && (
                <section className="queue-panel" aria-label={t("queue.queueLabel")}>
                  <div className="queue-heading">
                    <h2>{t("queue.title")}</h2>
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
                        bookmarked={isSaved(saved, currentEntry.place)}
                        onToggleBookmark={() => toggleBookmark(currentEntry.place)}
                        onDiscard={() =>
                          setRide((current) =>
                            current ? discard(current, currentEntry.place.id) : current,
                          )
                        }
                        content={journey?.content?.[currentEntry.place.id]}
                        history={historyFor(currentEntry.place.id)}
                        side={sideFor(currentEntry.place)}
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
                              <span className="queue-index">{String(i + 1).padStart(2, "0")}</span>
                              <span className="queue-strip-name">{entry.place.name}</span>
                              {Number.isFinite(entry.distance) && (
                                <span className="candidate-distance">{i18n.distance(entry.distance)}</span>
                              )}
                              <ChevronRight size={13} />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={`queue-empty${queueTone ? ` ${queueTone}` : ""}`}>
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
                        {packageState === "error"
                          ? t("queue.failed")
                          : replayStatus === "empty"
                            ? t("ride.noSourced")
                            : catalogPending
                              ? t("queue.loading")
                              : t("queue.emptyTitle")}
                      </h3>
                    </div>
                  )}
                </section>
              )}
              {tab === "bookmarks" && (
                <section className="queue-panel ride-panel" aria-label={t("nav.bookmarks")}>
                  {bookmarksScreen}
                </section>
              )}
              {tab === "settings" && (
                <section className="queue-panel ride-panel" aria-label={t("nav.settings")}>
                  <SettingsScreen />
                </section>
              )}
            </div>
            {storageNotice}
            <p className="sr-only" aria-live="polite">
              {ride.queue.length
                ? plural("queue.live", ride.queue.length, { name: ride.queue[ride.queue.length - 1].place.name })
                : t("queue.liveEmpty")}
            </p>
            <p className="sr-only" aria-live="polite">{cueAnnouncement}</p>
          </div>
        )}
      </main>
      {advisor}
      <DevPanel
        open={devOpen}
        onClose={() => setDevOpen(false)}
        replay={Boolean(ride?.replay)}
        playing={playing}
        onPlay={() => setPlaying((p) => !p)}
        speed={speed}
        maxSpeed={network.demo.maxSpeedKmh}
        onSpeed={setSpeed}
        direction={direction}
        onReverse={() => setDirection((d) => (d === 1 ? -1 : 1))}
        progress={progress}
        total={timeline.total}
        onSeek={seek}
        onReset={() => seek(startMeters)}
        resetLabel={network.demo.place}
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
        radius={pointingRadius}
        onLocation={changeLocationSource}
        started={Boolean(ride)}
        onStart={() => {
          setDemoLocation(true);
          start(true);
        }}
        startLabel={network.demo.place}
        stations={devStations}
        onStation={seek}
        queueCount={ride?.queue.length ?? 0}
        pausedReason={detectionPaused}
      />
      <BottomNav
        tab={tab}
        onTab={(next) => {
          setTab(next);
          setEndConfirm(false);
        }}
        discoveries={queueCount}
        bookmarks={saved.length}
      />
    </div>
  );
}
