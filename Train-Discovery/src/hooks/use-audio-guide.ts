"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioNarration } from "@/lib/narration";
import type { Narration } from "@/lib/narration";
import type { Place, QueueEntry } from "@/lib/types";

type GuideStatus =
  | "off"
  | "waiting"
  | "speaking"
  | "paused"
  | "unsupported"
  | "error";

export function useAudioGuide(
  entries: QueueEntry[] | undefined,
  nearby: Place[],
  dismissed: string[] | undefined,
  rideId: number | null,
) {
  const [status, setStatus] = useState<GuideStatus>("off");
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [currentKind, setCurrentKind] = useState<Narration["kind"] | null>(null);
  const enabled = useRef(false);
  const paused = useRef(false);
  const spoken = useRef(new Set<string>());
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const preferred = useRef<string | null>(null);
  const queue = useRef(entries);
  const around = useRef(nearby);
  const hidden = useRef(dismissed);

  const available = useCallback(() =>
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window,
  []);

  const cancel = useCallback(() => {
    // Invalidate the event handlers before cancel() triggers an "interrupted" event.
    active.current = null;
    if (available()) window.speechSynthesis.cancel();
    setCurrentName(null);
    setCurrentPlace(null);
    setCurrentKind(null);
  }, [available]);

  const playNext = useCallback(function speakNext() {
    if (!enabled.current || paused.current || active.current) return;
    if (!available()) {
      enabled.current = false;
      setStatus("unsupported");
      return;
    }

    const dismissedIds = new Set(hidden.current ?? []);
    const candidates = [
      ...(queue.current ?? []),
      ...around.current.map((place) => ({ place })),
    ].filter((entry) =>
      !dismissedIds.has(entry.place.id) && Boolean(audioNarration(entry.place)),
    );
    const chosen =
      candidates.find((entry) => entry.place.id === preferred.current) ??
      candidates.find((entry) => !spoken.current.has(entry.place.id));
    preferred.current = null;
    if (!chosen) {
      setCurrentName(null);
      setCurrentPlace(null);
      setCurrentKind(null);
      setStatus("waiting");
      return;
    }

    const narration = audioNarration(chosen.place);
    if (!narration) return;
    const utterance = new SpeechSynthesisUtterance(narration.text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    active.current = utterance;
    spoken.current.add(chosen.place.id);
    setCurrentName(chosen.place.name);
    setCurrentPlace(chosen.place);
    setCurrentKind(narration.kind);
    setStatus("speaking");
    utterance.onend = () => {
      if (active.current !== utterance) return;
      active.current = null;
      setCurrentName(null);
      setCurrentPlace(null);
      setCurrentKind(null);
      speakNext();
    };
    utterance.onerror = () => {
      if (active.current !== utterance) return;
      active.current = null;
      enabled.current = false;
      setCurrentName(null);
      setCurrentPlace(null);
      setCurrentKind(null);
      setStatus("error");
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      active.current = null;
      enabled.current = false;
      setCurrentName(null);
      setCurrentPlace(null);
      setCurrentKind(null);
      setStatus("error");
    }
  }, [available]);

  const start = useCallback(() => {
    if (!available()) {
      setStatus("unsupported");
      return;
    }
    enabled.current = true;
    paused.current = false;
    spoken.current.clear();
    window.speechSynthesis.resume();
    playNext();
  }, [available, playNext]);

  const stop = useCallback(() => {
    enabled.current = false;
    paused.current = false;
    preferred.current = null;
    spoken.current.clear();
    cancel();
    setStatus("off");
  }, [cancel]);

  const togglePause = useCallback(() => {
    if (!enabled.current || !available()) return;
    if (paused.current) {
      paused.current = false;
      window.speechSynthesis.resume();
      if (active.current) setStatus("speaking");
      else playNext();
    } else {
      paused.current = true;
      window.speechSynthesis.pause();
      setStatus("paused");
    }
  }, [available, playNext]);

  const skip = useCallback(() => {
    if (!enabled.current) return;
    cancel();
    playNext();
  }, [cancel, playNext]);

  const replay = useCallback((placeId: string) => {
    const exists = [...(queue.current ?? []).map((entry) => entry.place), ...around.current].some(
      (place) => place.id === placeId && audioNarration(place) && !hidden.current?.includes(placeId),
    );
    if (!exists) return;
    if (!available()) {
      setStatus("unsupported");
      return;
    }
    enabled.current = true;
    paused.current = false;
    preferred.current = placeId;
    spoken.current.delete(placeId);
    cancel();
    window.speechSynthesis.resume();
    playNext();
  }, [available, cancel, playNext]);

  useEffect(() => {
    queue.current = entries;
    around.current = nearby;
    hidden.current = dismissed;
    if (currentPlace && dismissed?.includes(currentPlace.id)) {
      // Discarding a place should also silence it immediately.
      active.current = null;
      if (available()) window.speechSynthesis.cancel();
      queueMicrotask(() => {
        setCurrentName(null);
        setCurrentPlace(null);
        setCurrentKind(null);
        playNext();
      });
      return;
    }
    if (enabled.current && !paused.current && !active.current) {
      queueMicrotask(playNext);
    }
  }, [entries, nearby, dismissed, currentPlace, available, playNext]);

  useEffect(() => {
    // A new ride starts a new listening session; old speech never crosses rides.
    enabled.current = false;
    paused.current = false;
    preferred.current = null;
    spoken.current.clear();
    active.current = null;
    if (available()) window.speechSynthesis.cancel();
    queueMicrotask(() => {
      setCurrentName(null);
      setCurrentPlace(null);
      setCurrentKind(null);
      setStatus("off");
    });
  }, [rideId, available]);

  useEffect(() => () => {
    active.current = null;
    if (available()) window.speechSynthesis.cancel();
  }, [available]);

  return { status, currentName, currentPlace, currentKind, start, stop, togglePause, skip, replay };
}
