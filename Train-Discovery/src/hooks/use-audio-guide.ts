"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isActivePlayback,
  journeyMoment,
  narrationFact,
  placeAnnouncement,
  playbackSegments,
  playNowSelection,
  preparationOrder,
  reachedStation,
  stationAnnouncement,
  pointingContext,
  deviceSpeechResume,
  sentenceGapElapsed,
} from "@/lib/audio-journey";
import type { AudioMoment, AudioScript, PendingStation, PlaceAudioContext, RailStop, SelectedStory } from "@/lib/audio-journey";
import {
  planPodcast, podcastCandidatesFromJourney, PODCAST_BREATH_MS,
  PODCAST_INTRO_KEY,
} from "@/lib/podcast-director";
import type { PodcastPlayback, RankedPodcastItem } from "@/lib/podcast-director";
import { distance } from "@/lib/geo";
import type { Place, Position } from "@/lib/types";

type GuideStatus = "off" | "waiting" | "preparing" | "speaking" | "paused" | "unsupported" | "error";
type Playback = {
  moment: AudioMoment;
  controller: AbortController;
  device: boolean;
  ready: boolean;
  token: number;
  utterance?: SpeechSynthesisUtterance;
  segmentTimer?: ReturnType<typeof setTimeout>;
  heldSentence?: number;
  continueSentence?: (index: number) => void;
  editorial?: RankedPodcastItem;
  kind: PodcastPlayback["kind"];
  directSpeech?: boolean;
};
type JourneyContext = {
  routeId: string;
  routeName: string;
  stops: RailStop[];
  position: Position | null;
  simulation: boolean;
  livePosition: Position | null;
  onNarrated?: (place: Place) => void;
};

const BREATH_MS = PODCAST_BREATH_MS;

function gatherSelected(explicit: SelectedStory[]): SelectedStory[] {
  const merged = new Map<string, SelectedStory>();
  for (const item of explicit) {
    const existing = merged.get(item.place.id);
    if (item.replay) merged.set(item.place.id, { ...existing, ...item, replay: true });
    else if (!existing) merged.set(item.place.id, item);
    else merged.set(item.place.id, { place: item.place, selectedAt: Math.min(existing.selectedAt, item.selectedAt) });
  }
  return [...merged.values()].sort((a, b) => Number(Boolean(b.replay)) - Number(Boolean(a.replay)) || a.selectedAt - b.selectedAt);
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function useAudioGuide(
  nearby: Place[], dismissed: string[] | undefined,
  rideId: number | null, journey: JourneyContext,
) {
  const [status, setStatus] = useState<GuideStatus>("off");
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [nextName, setNextName] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ id: string; name: string } | null>(null);
  const [unavailable, setUnavailable] = useState<{ id: string; name: string; place: Place; replay: boolean } | null>(null);
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [script, setScript] = useState<AudioScript | null>(null);
  const [provider, setProvider] = useState<"elevenlabs" | "device" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const enabled = useRef(false);
  const paused = useRef(false);
  const spoken = useRef(new Set<string>());
  const facts = useRef(new Set<string>());
  const sites = useRef(new Set<string>());
  const skipped = useRef(new Set<string>());
  const introductionStarted = useRef(false);
  const lastPlayback = useRef<PodcastPlayback | null>(null);
  const previousTopic = useRef<string | null>(null);
  const explicit = useRef<SelectedStory[]>([]);
  const interrupt = useRef<string | null>(null);
  const generation = useRef(0);
  const active = useRef<Playback | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const around = useRef(nearby);
  const hidden = useRef(dismissed);
  const context = useRef(journey);
  const stations = useRef(new Map<string, AudioMoment>());
  const prepared = useRef(new Map<string, { audioUrl: string; script: AudioScript }>());
  const inflight = useRef(new Map<string, AbortController>());
  const previousPosition = useRef<Position | null>(null);
  const nextDue = useRef(0);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudRetryAt = useRef(0);
  const nativeAvailable = useCallback(() => typeof window !== "undefined" &&
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window, []);

  const selectedStories = useCallback(() => gatherSelected(explicit.current), []);
  const pendingStations = useCallback((): PendingStation[] => [...stations.current.values()].flatMap((moment) =>
    moment.station && moment.request.type === "station" ? [{
      key: moment.key, station: moment.station, routeId: moment.request.routeId, expiresAt: moment.expiresAt ?? 0,
    }] : []), []);

  const clearPlayback = useCallback(() => {
    const playback = active.current;
    active.current = null;
    if (playback?.segmentTimer) clearTimeout(playback.segmentTimer);
    playback?.controller.abort();
    if (nextTimer.current) clearTimeout(nextTimer.current);
    nextTimer.current = null;
    const audio = player.current;
    if (audio) {
      audio.onended = null; audio.onerror = null; audio.onplay = null;
      audio.pause(); audio.removeAttribute("src"); audio.load();
    }
    if (nativeAvailable()) window.speechSynthesis.cancel();
  }, [nativeAvailable]);
  const clearCurrent = useCallback(() => {
    setCurrentName(null); setCurrentPlace(null); setScript(null); setProvider(null); setNotice(null);
  }, []);
  const dropPrefetch = useCallback(() => {
    for (const controller of inflight.current.values()) controller.abort();
    inflight.current.clear();
    prepared.current.clear();
  }, []);

  const collectStations = useCallback(() => {
    const { routeId, position, stops } = context.current;
    if (!enabled.current || !position) { previousPosition.current = null; return; }
    for (const stop of stops ?? []) {
      if (!stop) continue;
      const key = `station:${stop.id}`;
      if (spoken.current.has(key) || skipped.current.has(key) || stations.current.has(key) ||
        active.current?.moment.key === key) continue;
      if (reachedStation(stop, position, previousPosition.current)) stations.current.set(key, {
        key, name: stop.name, station: stop, fallback: stationAnnouncement(stop),
        request: { type: "station", routeId, stationId: stop.id }, expiresAt: Date.now() + 90_000,
      });
    }
    previousPosition.current = position;
  }, []);

  const editorialPlan = useCallback((forcedKey: string | null = null, occupiedKey: string | null = null,
    current: { key: string; kind: "story"; boundary: "sentence"; sentencesRemaining: number } | null = null) => {
    const now = Date.now();
    const selected = selectedStories();
    const forcedId = forcedKey?.startsWith("place:") ? forcedKey.slice("place:".length) : null;
    const selectedAt = selected.find((item) => item.place.id === forcedId)?.selectedAt;
    const candidates = podcastCandidatesFromJourney({
      now, selected, nearby: around.current, stations: pendingStations(),
    }).filter((candidate) => candidate.moment.key !== occupiedKey &&
      (!forcedId || candidate.moment.place?.id === forcedId));
    return planPodcast({
      now, candidates,
      geography: { routeId: context.current.routeId || null, position: context.current.position },
      // The route-specific journey opening replaces the director's generic welcome.
      playedKeys: new Set([...spoken.current, ...skipped.current, PODCAST_INTRO_KEY]),
      playedFacts: facts.current, playedSiteKeys: sites.current,
      dismissedPlaceIds: new Set(hidden.current),
      pointedPlaceId: forcedId, pointedAt: selectedAt,
      replayPlaceId: selected.find((item) => item.replay)?.place.id ?? null,
      lastPlayback: lastPlayback.current, previousTopic: previousTopic.current,
      current,
    });
  }, [pendingStations, selectedStories]);

  const rememberAhead = useCallback((chosen: AudioMoment | null) => {
    const plan = editorialPlan(null, chosen?.key ?? null);
    const next = plan.action === "story" || plan.action === "station" ? plan.item.moment
      : plan.action === "intro" || plan.action === "transition" ? plan.next.moment : null;
    const name = next?.name ?? null;
    setNextName((current) => current === name ? current : name);
  }, [editorialPlan]);

  const prefetch = useCallback((jobs: { place: Place; context: PlaceAudioContext }[]) => {
    if (!enabled.current || typeof navigator === "undefined" || !navigator.onLine) return;
    for (const job of jobs) {
      // The provider must never receive a place without a locally sourced story.
      if (!placeAnnouncement(job.place, job.context)) continue;
      const key = `${job.place.id}:${job.context}`;
      if (prepared.current.has(key) || inflight.current.has(key)) continue;
      const controller = new AbortController();
      inflight.current.set(key, controller);
      void fetch("/api/audio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "place", placeId: job.place.id, context: job.context }),
        signal: controller.signal,
      }).then(async (response) => {
        if (controller.signal.aborted || !response.ok) return;
        const result = await response.json();
        if (controller.signal.aborted || !result?.audioUrl || !result.script?.text) return;
        prepared.current.set(key, { audioUrl: result.audioUrl, script: result.script });
      }).catch(() => { /* A canceled or failed preparation must not start playback. */ })
        .finally(() => { if (inflight.current.get(key) === controller) inflight.current.delete(key); });
    }
  }, []);

  const prepareUpcoming = useCallback((activeId: string | null) => {
    const selected = selectedStories().filter((item) => !item.replay).map((item) => item.place);
    const order = preparationOrder(selected, around.current,
      new Set([...spoken.current, ...skipped.current]), activeId);
    prefetch(order.map((place) => {
      const item = selectedStories().find((entry) => entry.place.id === place.id && !entry.replay);
      const placeContext: PlaceAudioContext = item ? pointingContext(item.selectedAt, Date.now()) : "nearby";
      return { place, context: placeContext };
    }));
  }, [prefetch, selectedStories]);

  const playNext = useCallback(function next() {
    if (!enabled.current || paused.current || active.current) return;
    if (Date.now() < nextDue.current) {
      if (!nextTimer.current) nextTimer.current = setTimeout(() => {
        nextTimer.current = null; next();
      }, nextDue.current - Date.now());
      return;
    }
    if (nextTimer.current) { clearTimeout(nextTimer.current); nextTimer.current = null; }
    collectStations();
    for (const station of pendingStations()) {
      if (station.expiresAt <= Date.now() ||
        (context.current.position && distance(context.current.position, station.station) > 1200))
        stations.current.delete(station.key);
    }
    // A selected place can lack enough evidence for narration. Keep it available
    // to the rider without allowing it to suppress other eligible stories.
    let decision = editorialPlan(interrupt.current);
    if (decision.action === "quiet" && interrupt.current) {
      interrupt.current = null;
      decision = editorialPlan();
    }
    let chosen: AudioMoment;
    let editorial: RankedPodcastItem | undefined;
    let kind: PodcastPlayback["kind"];
    let directSpeech = false;
    // The ride opening is first, even when GPS already places us at a station.
    // That station remains pending and is the first editorial choice afterward.
    if (!introductionStarted.current && (!context.current.routeId || !context.current.routeName)) {
      clearCurrent(); setNextName(null); setStatus("waiting"); return;
    }
    if (!introductionStarted.current) {
      introductionStarted.current = true;
      chosen = journeyMoment(context.current.routeId, context.current.routeName,
        context.current.simulation, context.current.livePosition);
      kind = "intro";
    } else if (decision.action === "quiet") {
      if (decision.until && decision.until > Date.now()) {
        nextDue.current = decision.until;
        if (!nextTimer.current) nextTimer.current = setTimeout(() => {
          nextTimer.current = null; next();
        }, Math.max(0, decision.until! - Date.now()));
      }
      clearCurrent(); setNextName(null); setStatus("waiting"); return;
    } else if (decision.action === "transition" || decision.action === "intro") {
      // Editorial transitions are generic spoken bridges, with no fabricated API request.
      // The actual journeyMoment handles the opening, so the generic intro is never needed.
      if (!nativeAvailable()) {
        skipped.current.add(decision.key);
        next(); return;
      }
      chosen = {
        key: decision.key, name: "Between stories",
        request: { type: "journey", routeId: context.current.routeId, simulation: context.current.simulation },
        fallback: { name: "Between stories", kind: "announcement", sources: [], text: decision.text },
      };
      kind = "transition";
      directSpeech = true;
    } else if (decision.action === "story" || decision.action === "station") {
      editorial = decision.item;
      chosen = editorial.moment;
      kind = decision.action;
    } else {
      clearCurrent(); setStatus("waiting"); return;
    }
    if (kind === "intro") spoken.current.add(PODCAST_INTRO_KEY);
    if (chosen.place && interrupt.current === chosen.key) interrupt.current = null;
    if (chosen.place) {
      setQueued((current) => current?.id === chosen.place?.id ? null : current);
      if (unavailable && unavailable.id === chosen.place.id) setUnavailable(null);
    }
    rememberAhead(chosen);
    prepareUpcoming(chosen.place?.id ?? null);
    const token = ++generation.current;
    const playback: Playback = {
      moment: chosen, controller: new AbortController(), device: false, ready: false,
      token, editorial, kind, directSpeech,
    };
    active.current = playback;
    setCurrentName(chosen.name); setCurrentPlace(chosen.place ?? null);
    setScript(chosen.fallback); setProvider(null); setNotice(null); setStatus("preparing");
    const isCurrent = () => isActivePlayback(token, active.current?.token ?? null) && enabled.current;
    const finish = () => {
      if (!isCurrent()) return;
      const endedAt = Date.now();
      spoken.current.add(chosen.key);
      skipped.current.delete(chosen.key);
      if (editorial?.factKey) facts.current.add(editorial.factKey);
      if (editorial?.siteKey) sites.current.add(editorial.siteKey);
      if (chosen.place) explicit.current = explicit.current.filter((item) =>
        !(item.replay && item.place.id === chosen.place?.id));
      if (chosen.station) stations.current.delete(chosen.key);
      if (kind === "story") previousTopic.current = editorial?.topic ?? null;
      lastPlayback.current = { key: chosen.key, kind, endedAt, topic: editorial?.topic };
      clearPlayback(); clearCurrent(); nextDue.current = Date.now() + BREATH_MS;
      setStatus(paused.current ? "paused" : "waiting"); next();
    };
    const showUnavailable = () => {
      if (!isCurrent()) return;
      if (chosen.place) setUnavailable({ id: chosen.place.id, name: chosen.name, place: chosen.place,
        replay: chosen.request.type === "place" && chosen.request.context === "replay" });
      skipped.current.add(chosen.key);
      if (chosen.place) explicit.current = explicit.current.filter((item) =>
        !(item.replay && item.place.id === chosen.place?.id));
      clearPlayback(); clearCurrent(); nextDue.current = Date.now() + 600;
      setStatus(paused.current ? "paused" : "waiting"); next();
    };
    const deviceVoice = (text: string) => {
      if (!isCurrent() || playback.device) return;
      if (chosen.station && context.current.position && distance(context.current.position, chosen.station) > 1200) {
        showUnavailable(); return;
      }
      if (!nativeAvailable()) { enabled.current = false; clearPlayback(); setStatus("unsupported"); return; }
      if (player.current) { player.current.onended = null; player.current.onerror = null; player.current.onplay = null; player.current.pause(); }
      playback.device = true; playback.ready = true;
      setProvider("device"); setNotice("Using device voice");
      const segments = playbackSegments(text, pendingStations().some((station) =>
        !spoken.current.has(station.key) && !skipped.current.has(station.key)));
      const speakAt = (index: number) => {
        if (!isCurrent()) return;
        playback.heldSentence = undefined;
        if (index > 0 && kind === "story") {
          const inserted = editorialPlan(null, null, {
            key: chosen.key, kind: "story", boundary: "sentence", sentencesRemaining: segments.length - index,
          });
          if (inserted.action === "station" && inserted.item.moment.fallback) {
            const stationMoment = inserted.item.moment;
            const stationText = stationMoment.fallback?.text ?? "";
            const announcement = new SpeechSynthesisUtterance(stationText);
            playback.utterance = announcement;
            announcement.lang = "en-US"; announcement.rate = 0.94;
            announcement.onend = () => {
              if (!isCurrent()) return;
              spoken.current.add(stationMoment.key);
              stations.current.delete(stationMoment.key);
              lastPlayback.current = { key: stationMoment.key, kind: "station", endedAt: Date.now() };
              speakAt(index);
            };
            announcement.onerror = () => {
              if (!isCurrent()) return;
              skipped.current.add(stationMoment.key);
              stations.current.delete(stationMoment.key);
              speakAt(index);
            };
            window.speechSynthesis.speak(announcement);
            if (paused.current) window.speechSynthesis.pause();
            return;
          }
        }
        const segment = segments[index];
        if (!segment) { finish(); return; }
        const utterance = new SpeechSynthesisUtterance(segment);
        playback.utterance = utterance;
        utterance.lang = "en-US"; utterance.rate = 0.94;
        utterance.onend = () => {
          if (!isCurrent()) return;
          if (index + 1 >= segments.length) { finish(); return; }
          playback.segmentTimer = setTimeout(() => {
            playback.segmentTimer = undefined;
            const gap = sentenceGapElapsed({ canceled: !isCurrent(), paused: paused.current, nextIndex: index + 1 });
            if (gap.action === "speak") speakAt(gap.index);
            else if (gap.action === "hold") playback.heldSentence = gap.index;
          }, 350);
        };
        utterance.onerror = () => {
          if (!isCurrent()) return;
          enabled.current = false; clearPlayback(); setStatus("error");
        };
        try {
          window.speechSynthesis.speak(utterance);
          if (paused.current) { window.speechSynthesis.pause(); setStatus("paused"); }
          else setStatus("speaking");
        } catch { if (isCurrent()) { enabled.current = false; clearPlayback(); setStatus("error"); } }
      };
      playback.continueSentence = speakAt;
      speakAt(0);
    };
    const playCloud = async (result: { audioUrl: string; script: AudioScript }) => {
      if (!isCurrent()) return;
      const narration = result.script;
      if (chosen.place && narration.kind === "announcement") { showUnavailable(); return; }
      if (chosen.station && context.current.position && distance(context.current.position, chosen.station) > 1200) {
        showUnavailable(); return;
      }
      setScript(narration);
      if (chosen.place && narration.story) {
        const narratedPlace = { ...chosen.place, story: narration.story, evidence: narration.evidence ?? chosen.place.evidence };
        setCurrentPlace(narratedPlace);
        context.current.onNarrated?.(narratedPlace);
      }
      const audio = player.current;
      if (!audio) throw new Error("device_fallback");
      audio.onended = finish; audio.onerror = () => deviceVoice(narration.text);
      audio.onplay = () => { if (isCurrent()) setStatus("speaking"); };
      audio.src = result.audioUrl; playback.ready = true; setProvider("elevenlabs");
      if (paused.current) { setStatus("paused"); return; }
      try { await audio.play(); }
      catch (error) {
        if (!isCurrent()) return;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          paused.current = true; setStatus("paused"); setNotice("Tap play to continue");
        } else deviceVoice(narration.text);
      }
    };
    void (async () => {
      if (directSpeech) { deviceVoice(chosen.fallback?.text ?? ""); return; }
      const placeContext = chosen.request.type === "place" ? chosen.request.context ?? "nearby" : null;
      const cacheKey = chosen.place && placeContext ? `${chosen.place.id}:${placeContext}` : null;
      const cached = cacheKey ? prepared.current.get(cacheKey) : undefined;
      const narration = chosen.fallback;
      const timeout = setTimeout(() => playback.controller.abort(),
        chosen.request.type === "journey" ? 18000 : 90000);
      try {
        if (cached) { await playCloud(cached); return; }
        if (!navigator.onLine || Date.now() < cloudRetryAt.current) throw new Error("device_fallback");
        let result: { audioUrl: string; script: AudioScript } | null = null;
        for (let attempt = 0; attempt < (chosen.request.type === "journey" ? 4 : 35); attempt++) {
          const response = await fetch("/api/audio", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chosen.request), signal: playback.controller.signal });
          if (response.status === 202) { await delay(2000, playback.controller.signal); continue; }
          if (!response.ok) {
            if (![404, 422].includes(response.status)) cloudRetryAt.current = Date.now() + 60000;
            throw new Error("device_fallback");
          }
          result = await response.json(); break;
        }
        if (!isCurrent()) return;
        if (!result?.audioUrl || !result.script?.text) throw new Error("device_fallback");
        if (cacheKey) prepared.current.set(cacheKey, { audioUrl: result.audioUrl, script: result.script });
        await playCloud(result);
      } catch {
        if (isCurrent()) {
          if (narration && (!chosen.place || narration.kind !== "announcement")) deviceVoice(narration.text);
          else showUnavailable();
        }
      }
      finally { clearTimeout(timeout); }
    })();
  }, [clearCurrent, clearPlayback, collectStations, editorialPlan, nativeAvailable, pendingStations, prepareUpcoming, rememberAhead, unavailable]);

  const unlock = useCallback(() => {
    if (!player.current) player.current = new Audio();
    player.current.setAttribute("playsinline", ""); player.current.src = "/audio/silence.wav";
    void player.current.play().catch(() => {});
    if (nativeAvailable()) window.speechSynthesis.resume();
  }, [nativeAvailable]);
  const start = useCallback(() => {
    if (enabled.current) { if (!paused.current) playNext(); return; }
    unlock(); enabled.current = true; paused.current = false; nextDue.current = 0;
    collectStations(); playNext();
  }, [unlock, collectStations, playNext]);
  const stop = useCallback(() => {
    enabled.current = false; paused.current = false; interrupt.current = null;
    clearPlayback(); clearCurrent(); setNextName(null); setStatus("off");
  }, [clearPlayback, clearCurrent]);
  const togglePause = useCallback(() => {
    if (!enabled.current) return;
    if (paused.current) {
      paused.current = false; setNotice(active.current?.device ? "Using device voice" : null);
      const playback = active.current;
      if (playback?.device) {
        const next = deviceSpeechResume(playback.heldSentence ?? null, Boolean(window.speechSynthesis.speaking));
        if (next.action === "speak") {
          playback.heldSentence = undefined;
          if (playback.utterance) { playback.utterance.onend = null; playback.utterance.onerror = null; }
          window.speechSynthesis.resume();
          setStatus("speaking");
          playback.continueSentence?.(next.index);
        } else {
          if (next.dropHeld) playback.heldSentence = undefined;
          window.speechSynthesis.resume(); setStatus("speaking");
        }
      }
      else if (playback?.ready && player.current) void player.current.play().catch(() => {
        if (active.current !== playback) return;
        paused.current = true; setStatus("paused"); setNotice("Tap play to continue");
      });
      else if (playback) setStatus("preparing");
      else playNext();
    } else {
      paused.current = true; player.current?.pause();
      if (nativeAvailable()) window.speechSynthesis.pause();
      setStatus("paused");
    }
  }, [nativeAvailable, playNext]);
  const skip = useCallback(() => {
    if (!enabled.current) return;
    const skippedMoment = active.current?.moment;
    if (skippedMoment) {
      skipped.current.add(skippedMoment.key);
      if (skippedMoment.station) stations.current.delete(skippedMoment.key);
      if (skippedMoment.place) explicit.current = explicit.current.filter((item) =>
        !(item.replay && item.place.id === skippedMoment.place?.id));
    }
    clearPlayback(); clearCurrent(); nextDue.current = 0;
    setStatus(paused.current ? "paused" : "waiting"); playNext();
  }, [clearPlayback, clearCurrent, playNext]);
  const playNow = useCallback(() => {
    const target = playNowSelection(selectedStories(), active.current?.moment.key ?? null,
      new Set([...spoken.current, ...skipped.current]));
    if (!target) return;
    spoken.current.delete(`place:${target.place.id}`);
    skipped.current.delete(`place:${target.place.id}`);
    const fact = narrationFact(target.place);
    if (fact) facts.current.delete(fact);
    interrupt.current = `place:${target.place.id}`;
    clearPlayback(); unlock(); enabled.current = true; paused.current = false; nextDue.current = 0;
    playNext();
  }, [clearPlayback, playNext, selectedStories, unlock]);
  const replay = useCallback((place: Place) => {
    const placeId = place.id;
    if (hidden.current?.includes(placeId)) return;
    explicit.current = explicit.current.filter((item) => !(item.place.id === placeId && item.replay));
    explicit.current.push({ place, selectedAt: Date.now(), replay: true });
    spoken.current.delete(`place:${placeId}`);
    skipped.current.delete(`place:${placeId}`);
    const fact = narrationFact(place);
    if (fact) facts.current.delete(fact);
    setQueued({ id: placeId, name: place.name });
    clearPlayback(); unlock(); enabled.current = true; paused.current = false;
    interrupt.current = `place:${placeId}`;
    nextDue.current = 0; playNext();
  }, [clearPlayback, playNext, unlock]);
  const schedule = useCallback((place: Place, selectedAt = Date.now()) => {
    explicit.current = explicit.current.filter((item) => item.place.id !== place.id);
    explicit.current.push({ place, selectedAt });
    skipped.current.delete(`place:${place.id}`);
    interrupt.current = `place:${place.id}`;
    setQueued({ id: place.id, name: place.name });
    rememberAhead(active.current?.moment ?? null);
    if (enabled.current && !paused.current && !active.current) {
      nextDue.current = 0; playNext();
    } else prepareUpcoming(active.current?.moment.place?.id ?? null);
  }, [playNext, prepareUpcoming, rememberAhead]);
  const retryStory = useCallback(() => {
    if (!unavailable) return;
    spoken.current.delete(`place:${unavailable.id}`);
    skipped.current.delete(`place:${unavailable.id}`);
    const known = explicit.current.some((item) => item.place.id === unavailable.id) ||
      around.current.some((item) => item.id === unavailable.id);
    // A failed replay leaves the explicit list, and a saved place may not be nearby.
    if (!known || unavailable.replay) {
      explicit.current = explicit.current.filter((item) => !(item.place.id === unavailable.id && item.replay));
      explicit.current.push({ place: unavailable.place, selectedAt: Date.now(), replay: true });
    }
    const place = unavailable.place;
    setUnavailable(null);
    if (!enabled.current) { enabled.current = true; paused.current = false; unlock(); }
    if (active.current) { setQueued({ id: place.id, name: place.name }); return; }
    interrupt.current = `place:${place.id}`;
    nextDue.current = 0; playNext();
  }, [playNext, unavailable, unlock]);

  useEffect(() => {
    enabled.current = false; paused.current = false; interrupt.current = null;
    spoken.current.clear(); facts.current.clear(); sites.current.clear(); skipped.current.clear();
    introductionStarted.current = false; lastPlayback.current = null; previousTopic.current = null;
    explicit.current = []; stations.current.clear();
    previousPosition.current = null; nextDue.current = 0; dropPrefetch(); clearPlayback();
    queueMicrotask(() => { clearCurrent(); setNextName(null); setQueued(null); setUnavailable(null); setStatus("off"); });
  }, [rideId, clearPlayback, clearCurrent, dropPrefetch]);
  useEffect(() => {
    around.current = nearby; hidden.current = dismissed; context.current = journey;
    collectStations();
    for (const station of pendingStations()) {
      if (station.expiresAt <= Date.now() || (journey.position && distance(journey.position, station.station) > 1200))
        stations.current.delete(station.key);
    }
    if (active.current?.moment.place && dismissed?.includes(active.current.moment.place.id)) {
      clearPlayback(); nextDue.current = 0; queueMicrotask(clearCurrent);
    }
    if (queued && dismissed?.includes(queued.id)) queueMicrotask(() => setQueued(null));
    if (unavailable && dismissed?.includes(unavailable.id)) queueMicrotask(() => setUnavailable(null));
    if (enabled.current) prepareUpcoming(active.current?.moment.place?.id ?? null);
    if (enabled.current && !paused.current && !active.current) queueMicrotask(playNext);
  }, [nearby, dismissed, journey, collectStations, clearPlayback, clearCurrent, pendingStations, playNext, prepareUpcoming, queued, unavailable]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = currentName ? new MediaMetadata({ title: currentName, artist: "Train Discovery", album: "Your LIRR ride" }) : null;
    session.playbackState = status === "speaking" ? "playing" : status === "paused" ? "paused" : "none";
    const actions: [MediaSessionAction, () => void][] = [
      ["play", () => paused.current ? togglePause() : start()], ["pause", () => { if (!paused.current) togglePause(); }],
      ["nexttrack", skip], ["stop", stop],
    ];
    for (const [action, handler] of actions) { try { session.setActionHandler(action, handler); } catch { /* Unsupported action. */ } }
    return () => { for (const [action] of actions) { try { session.setActionHandler(action, null); } catch { /* Unsupported action. */ } } };
  }, [currentName, status, togglePause, start, skip, stop]);
  useEffect(() => () => {
    enabled.current = false; clearPlayback(); dropPrefetch(); player.current = null;
    if ("mediaSession" in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; }
  }, [clearPlayback, dropPrefetch]);

  return {
    status, currentName, nextName, queuedName: queued?.name ?? null, unavailableName: unavailable?.name ?? null,
    currentPlace, currentKind: script?.kind ?? null, script, provider, notice,
    start, stop, togglePause, skip, replay, playNow, schedule, retryStory,
  };
}
