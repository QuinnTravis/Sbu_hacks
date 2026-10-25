"use client";

import { BookmarkPlus, Headphones, Pause, Play, SkipForward, VolumeX } from "lucide-react";
import type { useAudioGuide } from "@/hooks/use-audio-guide";
import "./audio-guide.css";

export function AudioGuideBar({ guide, onSave, saved }: {
  guide: ReturnType<typeof useAudioGuide>;
  onSave: () => void;
  saved: boolean;
}) {
  const active = ["waiting", "preparing", "speaking", "paused"].includes(guide.status);

  return (
    <div className="audio-companion train-audio-guide">
    <div className={`audio-guide ${active ? "audio-guide-active" : ""}`} role="group" aria-label="Audio guide" data-status={guide.status}>
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
          <div className="audio-now">
            <span className="audio-indicator" aria-hidden="true"><span /><span /><span /></span>
            <span className="audio-title" role="status">
              {guide.status === "paused" ? "Paused" : guide.status === "preparing" ? `Preparing ${guide.currentName}` : guide.currentName ? `${guide.currentName}${guide.currentKind === "source" ? " · source excerpt" : ""}` : "Waiting for a nearby story"}
            </span>
            <div className="audio-controls">
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
            </div>
          </div>
          {(guide.queuedName && guide.queuedName !== guide.currentName) ||
          (guide.nextName && guide.currentName && guide.nextName !== guide.currentName) ? (
            <div className="audio-follow">
              <div className="audio-follow-copy">
                {guide.queuedName && guide.queuedName !== guide.currentName && (
                  <p className="audio-queued" role="status">
                    <span className="audio-queued-name" title={guide.queuedName}>{guide.queuedName}</span>{" "}
                    <span className="audio-queued-state">queued</span>
                  </p>
                )}
                {guide.nextName && guide.currentName && guide.nextName !== guide.currentName && (
                  <p className="audio-next">
                    <span className="audio-next-label">Next ·</span>
                    <span className="audio-next-name" title={guide.nextName}>{guide.nextName}</span>
                  </p>
                )}
              </div>
              {guide.queuedName && guide.currentName && guide.queuedName !== guide.currentName && (
                <button className="audio-control audio-play-now" onClick={guide.playNow} aria-label="Play now">
                  Play now
                </button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
    {guide.unavailableName && (
      <p className="audio-notice" role="status">
        No sourced story is available for {guide.unavailableName} yet.{" "}
        <button type="button" className="text-button" onClick={guide.retryStory}>Retry</button>
      </p>
    )}
    {active && guide.notice && <p className="audio-notice" role="status">{guide.notice}</p>}
    {active && guide.script && guide.status !== "preparing" && (
      <details className="audio-transcript" key={guide.currentName}>
        <summary>Transcript & sources</summary>
        <p>{guide.script.text}</p>
        {guide.script.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.license}</a>
        ))}
      </details>
    )}
    </div>
  );
}
