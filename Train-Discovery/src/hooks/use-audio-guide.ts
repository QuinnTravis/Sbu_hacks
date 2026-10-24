"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chooseAudioMoment, placeAnnouncement, reachedStation, stationAnnouncement } from "@/lib/audio-journey";
import { distance } from "@/lib/geo";
import type { AudioMoment, AudioScript, PlaceAudioContext, RailStop } from "@/lib/audio-journey";
import type { Place, Position, QueueEntry } from "@/lib/types";

type GuideStatus = "off" | "waiting" | "preparing" | "speaking" | "paused" | "unsupported" | "error";
type Playback = { moment: AudioMoment; controller: AbortController; device: boolean; ready: boolean; utterance?: SpeechSynthesisUtterance };
type JourneyContext = { routeId: string; stops: RailStop[]; position: Position | null; onNarrated?: (place: Place) => void };

function placeMoment(place: Place, context: PlaceAudioContext = "nearby"): AudioMoment {
  return {
    key: `place:${place.id}`, name: place.name, place, request: { type: "place", placeId: place.id, context },
    fallback: placeAnnouncement(place, context),
  };
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
  entries: QueueEntry[] | undefined, nearby: Place[], dismissed: string[] | undefined,
  rideId: number | null, journey: JourneyContext,
) {
  const [status, setStatus] = useState<GuideStatus>("off");
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [script, setScript] = useState<AudioScript | null>(null);
  const [provider, setProvider] = useState<"elevenlabs" | "device" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const enabled = useRef(false);
  const paused = useRef(false);
  const spoken = useRef(new Set<string>());
  const active = useRef<Playback | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const preferred = useRef<string | null>(null);
  const queue = useRef(entries);
  const around = useRef(nearby);
  const hidden = useRef(dismissed);
  const context = useRef(journey);
  const stations = useRef(new Map<string, AudioMoment>());
  const previousPosition = useRef<Position | null>(null);
  const nextDue = useRef(0);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudRetryAt = useRef(0);
  const nativeAvailable = useCallback(() => typeof window !== "undefined" &&
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window, []);

  const clearPlayback = useCallback(() => {
    const playback = active.current;
    active.current = null; // Invalidate late fetch/play/speech callbacks before cancelling.
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

  const collectStations = useCallback(() => {
    const { routeId, position, stops } = context.current;
    if (!enabled.current || !position) { previousPosition.current = null; return; }
    for (const stop of stops) {
      const key = `station:${stop.id}`;
      if (spoken.current.has(key) || stations.current.has(key)) continue;
      if (reachedStation(stop, position, previousPosition.current)) stations.current.set(key, {
        key, name: stop.name, station: stop, fallback: stationAnnouncement(stop),
        request: { type: "station", routeId, stationId: stop.id }, expiresAt: Date.now() + 90000,
      });
    }
    previousPosition.current = position;
  }, []);

  const playNext = useCallback(function next() {
    if (!enabled.current || paused.current || active.current) return;
    if (Date.now() < nextDue.current) {
      if (!nextTimer.current) nextTimer.current = setTimeout(() => {
        nextTimer.current = null; next();
      }, nextDue.current - Date.now());
      return;
    }
    collectStations();
    const now = Date.now(), position = context.current.position;
    const stationMoments = [...stations.current.values()].filter((moment) =>
      moment.expiresAt! > now && (!position || distance(position, moment.station!) < 1200),
    );
    // The latest deliberate point gets the next turn; stations follow, then
    // nearby stories fill the journey. Old saved cards require explicit replay.
    const pointed = [...(queue.current ?? [])].reverse()
      .filter((entry) => now - entry.foundAt < 120000 || preferred.current === `place:${entry.place.id}`)
      .map((entry) => placeMoment(entry.place, preferred.current === `place:${entry.place.id}` ? "replay" : "pointed"));
    const chosen = chooseAudioMoment([...pointed, ...stationMoments, ...around.current.map((place) => placeMoment(place))],
      spoken.current, new Set(hidden.current), now, preferred.current);
    preferred.current = null;
    if (!chosen) { clearCurrent(); setStatus("waiting"); return; }
    spoken.current.add(chosen.key);
    const playback: Playback = { moment: chosen, controller: new AbortController(), device: false, ready: false };
    active.current = playback;
    setCurrentName(chosen.name); setCurrentPlace(chosen.place ?? null);
    setScript(chosen.fallback); setProvider(null); setNotice(null); setStatus("preparing");
    const isCurrent = () => active.current === playback && enabled.current;
    const finish = () => {
      if (!isCurrent()) return;
      clearPlayback(); clearCurrent(); nextDue.current = Date.now() + 4500;
      setStatus(paused.current ? "paused" : "waiting"); next();
    };
    const unavailable = () => {
      if (!isCurrent()) return;
      clearPlayback(); clearCurrent(); nextDue.current = Date.now() + 4500;
      setStatus(paused.current ? "paused" : "waiting");
      setNotice(`No sourced story is available for ${chosen.name} yet.`);
      next();
    };
    const deviceVoice = (text: string) => {
      if (!isCurrent() || playback.device) return;
      if (chosen.station && context.current.position && distance(context.current.position, chosen.station) > 1200) {
        finish(); return;
      }
      if (!nativeAvailable()) { enabled.current = false; clearPlayback(); setStatus("unsupported"); return; }
      if (player.current) { player.current.onended = null; player.current.onerror = null; player.current.onplay = null; player.current.pause(); }
      playback.device = true; playback.ready = true;
      setProvider("device"); setNotice("Using device voice");
      const utterance = new SpeechSynthesisUtterance(text);
      playback.utterance = utterance;
      utterance.lang = "en-US"; utterance.rate = 0.94; utterance.onend = finish;
      utterance.onerror = () => {
        if (!isCurrent()) return;
        spoken.current.delete(chosen.key);
        enabled.current = false; clearPlayback(); setStatus("error");
      };
      try {
        window.speechSynthesis.speak(utterance);
        if (paused.current) { window.speechSynthesis.pause(); setStatus("paused"); }
        else setStatus("speaking");
      } catch { if (isCurrent()) { spoken.current.delete(chosen.key); enabled.current = false; clearPlayback(); setStatus("error"); } }
    };
    void (async () => {
      let narration = chosen.fallback;
      const timeout = setTimeout(() => playback.controller.abort(), 90000);
      try {
        if (!navigator.onLine || Date.now() < cloudRetryAt.current) throw new Error("device_fallback");
        let result: { audioUrl: string; script: AudioScript } | null = null;
        for (let attempt = 0; attempt < 35; attempt++) {
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
        narration = result.script;
        if (chosen.place && narration.kind === "announcement") { unavailable(); return; }
        const transcript = narration.text;
        if (chosen.station && context.current.position && distance(context.current.position, chosen.station) > 1200) {
          finish(); return;
        }
        setScript(narration);
        if (chosen.place && narration.story) {
          const narratedPlace = { ...chosen.place, story: narration.story, evidence: narration.evidence ?? chosen.place.evidence };
          setCurrentPlace(narratedPlace);
          context.current.onNarrated?.(narratedPlace);
        }
        const audio = player.current;
        if (!audio) throw new Error("device_fallback");
        audio.onended = finish; audio.onerror = () => deviceVoice(transcript);
        audio.onplay = () => { if (isCurrent()) setStatus("speaking"); };
        audio.src = result.audioUrl; playback.ready = true; setProvider("elevenlabs");
        if (paused.current) { setStatus("paused"); return; }
        try { await audio.play(); }
        catch (error) {
          if (!isCurrent()) return;
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            paused.current = true; setStatus("paused"); setNotice("Tap play to continue");
          } else deviceVoice(transcript);
        }
      } catch {
        if (isCurrent()) {
          if (narration && (!chosen.place || narration.kind !== "announcement")) deviceVoice(narration.text);
          else unavailable();
        }
      }
      finally { clearTimeout(timeout); }
    })();
  }, [clearCurrent, clearPlayback, collectStations, nativeAvailable]);

  const unlock = useCallback(() => {
    if (!player.current) player.current = new Audio();
    // Unlock this same media element in the user's gesture on mobile Safari.
    player.current.setAttribute("playsinline", ""); player.current.src = "/audio/silence.wav";
    void player.current.play().catch(() => {});
    if (nativeAvailable()) window.speechSynthesis.resume();
  }, [nativeAvailable]);
  const start = useCallback(() => {
    if (enabled.current && active.current) return;
    unlock(); enabled.current = true; paused.current = false; nextDue.current = 0;
    collectStations(); playNext();
  }, [unlock, collectStations, playNext]);
  const stop = useCallback(() => {
    enabled.current = false; paused.current = false; preferred.current = null;
    clearPlayback(); clearCurrent(); setStatus("off");
  }, [clearPlayback, clearCurrent]);
  const togglePause = useCallback(() => {
    if (!enabled.current) return;
    if (paused.current) {
      paused.current = false; setNotice(active.current?.device ? "Using device voice" : null);
      const playback = active.current;
      if (playback?.device) { window.speechSynthesis.resume(); setStatus("speaking"); }
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
    clearPlayback(); clearCurrent(); nextDue.current = 0;
    setStatus(paused.current ? "paused" : "waiting"); playNext();
  }, [clearPlayback, clearCurrent, playNext]);
  const replay = useCallback((placeId: string) => {
    const place = [...(queue.current ?? []).map((entry) => entry.place), ...around.current]
      .find((place) => place.id === placeId && !hidden.current?.includes(placeId));
    if (!place) return;
    clearPlayback(); unlock(); enabled.current = true; paused.current = false;
    preferred.current = `place:${placeId}`; spoken.current.delete(preferred.current);
    nextDue.current = 0; playNext();
  }, [clearPlayback, unlock, playNext]);

  useEffect(() => {
    enabled.current = false; paused.current = false; preferred.current = null;
    spoken.current.clear(); stations.current.clear(); previousPosition.current = null;
    nextDue.current = 0; clearPlayback();
    queueMicrotask(() => { clearCurrent(); setStatus("off"); });
  }, [rideId, clearPlayback, clearCurrent]);
  useEffect(() => {
    queue.current = entries; around.current = nearby; hidden.current = dismissed; context.current = journey;
    collectStations();
    if (active.current?.moment.place && dismissed?.includes(active.current.moment.place.id)) {
      clearPlayback(); nextDue.current = 0; queueMicrotask(clearCurrent);
    }
    if (enabled.current && !paused.current && !active.current) queueMicrotask(playNext);
  }, [entries, nearby, dismissed, journey, collectStations, clearPlayback, clearCurrent, playNext]);
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
    enabled.current = false; clearPlayback(); player.current = null;
    if ("mediaSession" in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; }
  }, [clearPlayback]);

  return { status, currentName, currentPlace, currentKind: script?.kind ?? null, script, provider, notice,
    start, stop, togglePause, skip, replay };
}
