"use client";

import { Headphones, Pause, Play, SkipForward, VolumeX } from "lucide-react";
import type { useAudioGuide } from "@/hooks/use-audio-guide";
import { useI18n } from "@/lib/i18n";
import { localeInfo } from "@/lib/i18n-core";
import { BookmarkButton } from "./bookmark-button";
import "./audio-guide.css";

export function AudioGuideBar({ guide, onToggleBookmark, bookmarked, soundOff = false, onSoundOn }: {
  guide: ReturnType<typeof useAudioGuide>;
  onToggleBookmark: () => void;
  bookmarked: boolean;
  /** Narration is switched off in Settings. */
  soundOff?: boolean;
  onSoundOn?: () => void;
}) {
  const { t, locale } = useI18n();
  const active = ["waiting", "preparing", "speaking", "paused"].includes(guide.status);
  const notice = guide.notice === "device-voice" ? t("audio.deviceVoice")
    : guide.notice === "tap-to-continue" ? t("audio.tapToContinue")
    : guide.notice === "offline-clip" ? t("audio.offlineCached")
    : guide.notice === "other-language" ? t("audio.englishFallback", { language: locale.nativeLabel })
    : null;
  const title = guide.status === "paused" ? t("audio.paused")
    : guide.status === "preparing" ? t("audio.preparing", { name: guide.currentName ?? "" })
    : guide.currentName ?? t("audio.waiting");
  const pausedName = guide.status === "paused" ? guide.currentName : null;
  const queued = guide.queuedName && guide.queuedName !== guide.currentName ? guide.queuedName : null;
  const next = guide.nextName && guide.currentName && guide.nextName !== guide.currentName ? guide.nextName : null;

  return (
    <div className="audio-companion train-audio-guide">
    <div className={`audio-guide ${active ? "audio-guide-active" : ""}`} role="group" aria-label={t("audio.label")} data-status={guide.status}>
      {!active ? (
        <>
          {soundOff ? (
            <button className="audio-activate" onClick={onSoundOn}>
              <VolumeX size={19} strokeWidth={1.8} />
              {t("settings.sound")} · {t("settings.off")}
            </button>
          ) : (
            <button className="audio-activate" onClick={guide.start}>
              <Headphones size={19} strokeWidth={1.8} />
              {t("audio.start")}
            </button>
          )}
          {guide.status === "unsupported" && <span role="status">{t("audio.unsupported")}</span>}
          {guide.status === "error" && <span role="status">{t("audio.error")}</span>}
        </>
      ) : (
        <>
          <div className="audio-now">
            <Headphones className="audio-now-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
            <span className="audio-now-text">
              <span className="audio-title" role="status">{title}</span>
              {pausedName && <span className="audio-now-place" title={pausedName}>{pausedName}</span>}
            </span>
            {guide.currentPlace && (
              <BookmarkButton compact className="audio-control" name={guide.currentPlace.name} bookmarked={bookmarked} onToggle={onToggleBookmark} />
            )}
          </div>
          {queued && (
            <div className="audio-follow">
              <p className="audio-queued" role="status">
                <span className="audio-queued-name" title={queued}>{queued}</span>{" "}
                <span className="audio-queued-state">{t("audio.queued")}</span>
              </p>
              {guide.currentName && (
                <button className="audio-control audio-play-now" onClick={guide.playNow} aria-label={t("audio.playNow")}>
                  {t("audio.playNow")}
                </button>
              )}
            </div>
          )}
          <div className="audio-transport">
            {next ? (
              <p className="audio-next">
                <span className="audio-next-label">{t("audio.next")}</span>
                <span className="audio-next-name" title={next}>{next}</span>
              </p>
            ) : <span className="audio-next" aria-hidden="true" />}
            <div className="audio-controls">
              <button className="audio-control" onClick={guide.togglePause} aria-label={guide.status === "paused" ? t("audio.resume") : t("audio.pause")}>
                {guide.status === "paused" ? <Play size={18} /> : <Pause size={18} />}
              </button>
              <button className="audio-control" onClick={guide.skip} aria-label={t("audio.skip")} disabled={!guide.currentName}>
                <SkipForward size={18} />
              </button>
              <button className="audio-control" onClick={guide.stop} aria-label={t("audio.stop")}>
                <VolumeX size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    {guide.unavailableName && (
      <p className="audio-notice" role="status">
        {t("audio.unavailable", { name: guide.unavailableName })}{" "}
        <button type="button" className="text-button" onClick={guide.retryStory}>{t("app.retry")}</button>
      </p>
    )}
    {active && notice && <p className="audio-notice" role="status">{notice}</p>}
    {active && guide.script && guide.status !== "preparing" && (
      <details className="audio-transcript" key={guide.currentName}>
        <summary>{t("audio.transcript")}</summary>
        <p lang={localeInfo(guide.script.language ?? "en").code}>{guide.script.text}</p>
        {guide.script.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.license}</a>
        ))}
      </details>
    )}
    </div>
  );
}
