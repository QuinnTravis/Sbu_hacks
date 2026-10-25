"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useI18n } from "@/lib/i18n";
import "./landing-page.css";

type Stamp = { id: number; x: number; y: number; rotation: number; shape: number };

function TravelMark({ shape }: { shape: number }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shape === 0 && <><circle cx="50" cy="50" r="37" /><path d="m64 24-7 33-24 19 9-34z" /><path d="m42 42 15 15" /></>}
      {shape === 1 && <><path d="M37 9 25 91M63 9l12 82M34 25h32M32 41h36M30 59h40M27 80h46" /></>}
      {shape === 2 && <><path d="M8 50Q50 4 92 50 50 96 8 50Z" /><circle cx="50" cy="50" r="17" /><circle cx="50" cy="50" r="6" fill="currentColor" stroke="none" /></>}
      {shape === 3 && <><path d="M14 44v12m12-25v38m12-49v60m12-68v76m12-62v52m12-42v28m12-20v12" /></>}
      {shape === 4 && <><circle cx="50" cy="50" r="20" /><path d="M50 7v12m0 62v12M7 50h12m62 0h12M20 20l9 9m42 42 9 9M20 80l9-9m42-42 9-9" /></>}
      {shape === 5 && <><path d="M15 88V45a35 35 0 0 1 70 0v43H69V45a19 19 0 0 0-38 0v43ZM15 88h70" /><path d="M50 11v15M25 21l10 11m40-11L65 32" /></>}
    </svg>
  );
}

export function LandingPage() {
  const { t, code } = useI18n();
  const [phrase, setPhrase] = useState(0);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [nextShape, setNextShape] = useState(0);
  const serial = useRef(0);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("network") || params.has("dev")) {
      window.location.replace(`/journey${window.location.search}`);
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (timer) clearInterval(timer);
      if (!motion.matches) timer = setInterval(() => setPhrase((p) => (p + 1) % 3), 7000);
    };
    sync();
    motion.addEventListener("change", sync);
    return () => { if (timer) clearInterval(timer); motion.removeEventListener("change", sync); };
  }, []);

  function stamp(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const keyboard = event.detail === 0;
    const id = serial.current++;
    setStamps((old) => [...old.slice(-17), {
      id, x: keyboard ? 50 : (event.clientX - bounds.left) / bounds.width * 100,
      y: keyboard ? 72 : (event.clientY - bounds.top) / bounds.height * 100,
      rotation: (id * 29 % 54) - 27, shape: id % 6,
    }]);
    setNextShape((id + 1) % 6);
  }

  return (
    <main className="gaze-landing" id="main-content" tabIndex={-1} lang={code}>
      <button className="landing-canvas" aria-label={t("landing.stamp")} onClick={stamp}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse" || !preview.current) return;
          preview.current.style.left = `${event.clientX}px`;
          preview.current.style.top = `${event.clientY}px`;
          preview.current.dataset.visible = "true";
        }}
        onPointerLeave={() => { if (preview.current) preview.current.dataset.visible = "false"; }} />
      <h1 className="landing-headline">
        <span className="landing-brand">Gaze</span>
        <span className="landing-phrase" key={`${code}-${phrase}`}>
          <span>{t(`landing.phrases.${phrase}.first`)}</span>
          <span>{t(`landing.phrases.${phrase}.before`)}<em>{t(`landing.phrases.${phrase}.emphasis`)}</em>{t(`landing.phrases.${phrase}.after`)}</span>
        </span>
      </h1>
      <div className="landing-stamps" aria-hidden="true">{stamps.map((mark) => (
        <div className={`landing-stamp landing-mark-${mark.shape}`} key={mark.id}
          style={{ left: `${mark.x}%`, top: `${mark.y}%`, rotate: `${mark.rotation}deg` }}><TravelMark shape={mark.shape} /></div>
      ))}</div>
      <div className="landing-cursor" ref={preview} aria-hidden="true"><TravelMark shape={nextShape} /></div>
      <nav className="landing-nav" aria-label={t("landing.navigation")}>
        <a href="/journey">{t("landing.start")}</a><span aria-hidden="true">·</span>
        <a href="/about">{t("landing.about")}</a><span aria-hidden="true">·</span>
        <button type="button" onClick={() => setStamps([])}>{t("landing.clear")}</button>
      </nav>
    </main>
  );
}

export default LandingPage;
