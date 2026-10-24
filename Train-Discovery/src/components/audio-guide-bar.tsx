"use client";

import { BookmarkPlus, Headphones, Pause, Play, SkipForward, VolumeX } from "lucide-react";
import type { useAudioGuide } from "@/hooks/use-audio-guide";

export function AudioGuideBar({ guide, onSave, saved }: {
  guide: ReturnType<typeof useAudioGuide>;
  onSave: () => void;
  saved: boolean;
}) {
  const active = ["waiting", "speaking", "paused"].includes(guide.status);

  return (
    <div className={`audio-guide ${active ? "audio-guide-active" : ""}`} role="group" aria-label="Audio guide">
      {!active ? (
        <>
          <button className="audio-activate" onClick={guide.start}>
            <Headphones size={19} strokeWidth={1.8} />
            Start audio tour
          </button>
          {guide.status === "unsupported" && <span role="status">Audio isn’t supported in this browser.</span>}
          {guide.status === "error" && <span role="status">Audio stopped. Try again.</span>}
        </>
      ) : (
        <>
          <span className="audio-indicator" aria-hidden="true"><span /><span /><span /></span>
          <span className="audio-title" role="status">
            {guide.status === "paused" ? "Paused" : guide.currentName ?? "Waiting for a nearby story"}
          </span>
          {guide.currentPlace && !saved && (
            <button className="audio-control" onClick={onSave} aria-label={`Save ${guide.currentPlace.name} to discoveries`}>
              <BookmarkPlus size={18} />
            </button>
          )}
          <button className="audio-control" onClick={guide.togglePause} aria-label={guide.status === "paused" ? "Resume audio guide" : "Pause audio guide"}>
            {guide.status === "paused" ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button className="audio-control" onClick={guide.skip} aria-label="Skip story" disabled={!guide.currentName}>
            <SkipForward size={18} />
          </button>
          <button className="audio-control" onClick={guide.stop} aria-label="Turn off audio guide">
            <VolumeX size={18} />
          </button>
        </>
      )}
    </div>
  );
}
