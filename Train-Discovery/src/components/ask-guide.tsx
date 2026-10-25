"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import type { useAudioGuide } from "@/hooks/use-audio-guide";
import { useI18n } from "@/lib/i18n";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function AskGuide({ guide }: { guide: ReturnType<typeof useAudioGuide> }) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestGuide = useRef(guide);
  useEffect(() => { latestGuide.current = guide; });

  function releaseMic() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onend = null;
      current.onresult = null;
      current.onerror = null;
      current.abort();
    }
  }

  useEffect(() => {
    if (guide.questionStatus !== "listening") releaseMic();
  }, [guide.questionStatus]);
  useEffect(() => releaseMic, [locale.code]);

  function submit(text = draft) {
    const question = text.trim().slice(0, 500);
    if (!question) return;
    releaseMic();
    setRecording(false);
    setMicError(null);
    setDraft(question);
    void latestGuide.current.askQuestion(question);
  }

  function listen() {
    releaseMic();
    if (!guide.beginQuestion()) return;
    setDraft("");
    setMicError(null);
    setRecording(false);
    const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setMicError("unsupported"); return; }
    const current = new Speech();
    recognition.current = current;
    current.lang = locale.speechSynthesisLang;
    current.continuous = false;
    current.interimResults = true;
    let finalText = "";
    let failed = false;
    current.onresult = (event) => {
      if (recognition.current !== current) return;
      const results = Array.from(event.results);
      setDraft(results.map((result) => result[0].transcript).join(" ").slice(0, 500));
      finalText = results.filter((result) => result.isFinal).map((result) => result[0].transcript).join(" ");
    };
    current.onerror = (event) => {
      if (recognition.current !== current) return;
      failed = true;
      releaseMic();
      setRecording(false);
      setMicError(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : "failed");
    };
    current.onend = () => {
      if (recognition.current !== current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      recognition.current = null;
      setRecording(false);
      if (!failed && finalText.trim()) submit(finalText);
      else if (!failed) setMicError("empty");
    };
    try {
      current.start();
      setRecording(true);
      timer.current = setTimeout(() => {
        if (recognition.current !== current) return;
        releaseMic();
        setRecording(false);
        setMicError("empty");
      }, 20_000);
    } catch {
      releaseMic();
      setMicError("failed");
    }
  }

  const open = ["listening", "thinking", "error"].includes(guide.questionStatus);
  const busy = guide.questionStatus === "thinking";
  const error = micError ? t(`ask.mic.${micError}`) : guide.questionStatus === "error" ? t("ask.failed") : null;
  if (!guide.questionPlace) return null;

  return (
    <section className={`ask-guide${open ? " ask-guide-open" : ""}`} aria-label={t("ask.label")}>
      {!open ? (
        <button type="button" className="ask-trigger" onClick={listen}>
          <Mic size={18} strokeWidth={1.8} aria-hidden="true" />
          {t("ask.label")}
        </button>
      ) : (
        <>
          <div className="ask-heading">
            <span className="ask-place">{guide.questionPlace.name}</span>
            <button type="button" className="audio-control" aria-label={t("ask.cancel")} onClick={() => {
              releaseMic(); setRecording(false); guide.cancelQuestion();
            }}><X size={18} /></button>
          </div>
          <form className="ask-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <button type="button" className="audio-control ask-mic" aria-label={recording ? t("ask.stopMic") : t("ask.micLabel")}
              aria-pressed={recording} disabled={busy} onClick={() => {
                if (recording) recognition.current?.stop(); else listen();
              }}>
              {recording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
            </button>
            <input aria-label={t("ask.input")} placeholder={t("ask.input")}
              value={draft} maxLength={500} disabled={busy} onChange={(event) => setDraft(event.target.value)} />
            <button type="submit" className="audio-control ask-send" aria-label={t("ask.send")} disabled={busy || !draft.trim()}>
              <ArrowUp size={20} />
            </button>
          </form>
          {busy && <p className="ask-status" role="status">{t("ask.thinking")}</p>}
          {recording && <p className="ask-status" role="status">{t("ask.listening")}</p>}
          {error && <p className="ask-status" role="status">{error}</p>}
        </>
      )}
    </section>
  );
}
