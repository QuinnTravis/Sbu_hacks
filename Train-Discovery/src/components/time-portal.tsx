"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Compass,
  History,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import * as THREE from "three";
import type { Place } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

const CURRENT_YEAR = new Date().getFullYear();
const ERA_CHOICES = [1880, 1920, 1960, CURRENT_YEAR];
const DEPTH_VERTEX_SHADER = [
  "uniform sampler2D uDepthMap;",
  "uniform float uDepthAmount;",
  "uniform float uHasDepth;",
  "varying vec2 vUv;",
  "void main() {",
  "  vUv = uv;",
  "  vec3 displaced = position;",
  "  float relativeDepth = texture2D(uDepthMap, uv).r - 0.5;",
  "  float seamWeight = smoothstep(0.0, 0.04, uv.x) * smoothstep(0.0, 0.04, 1.0 - uv.x);",
  "  vec2 radial = normalize(displaced.xz);",
  "  displaced.xz -= radial * relativeDepth * uDepthAmount * uHasDepth * seamWeight;",
  "  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);",
  "}",
].join("\n");
const DEPTH_FRAGMENT_SHADER = [
  "uniform sampler2D uColorMap;",
  "varying vec2 vUv;",
  "void main() {",
  "  gl_FragColor = texture2D(uColorMap, vUv);",
  "  #include <tonemapping_fragment>",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

type GeneratedScene = {
  sceneId: string;
  imageUrl: string;
  mimeType: string;
  searchSuggestions: string | null;
  cacheHit: boolean;
  year: number;
  model: string;
  disclosure: string;
};
type GenerationState = "loading" | "ready" | "error";
function errorMessage(code: string | undefined) {
  if (code === "time_portal_generation_limit_reached")
    return "portal.errorBudget";
  if (code === "time_portal_provider_quota")
    return "portal.errorQuota";
  if (code === "time_portal_provider_auth_failed" || code === "time_portal_not_configured")
    return "portal.errorConfig";
  if (code === "place_not_found")
    return "portal.errorPlace";
  return "portal.errorScene";
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

export function TimePortal({
  place,
  onClose,
}: {
  place: Place;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const depthWorkerRef = useRef<Worker | null>(null);
  const depthJobRef = useRef(0);
  const closeCallbackRef = useRef(onClose);
  const [year, setYear] = useState(1920);
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState<GenerationState>("loading");
  const [scene, setScene] = useState<GeneratedScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depthState, setDepthState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [renderReady, setRenderReady] = useState(false);

  useEffect(() => {
    closeCallbackRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, []);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../lib/time-portal-depth.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return;
    }
    depthWorkerRef.current = worker;
    return () => {
      depthWorkerRef.current?.terminate();
      depthWorkerRef.current = null;
    };
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const beginGeneration = useCallback(() => {
    setGeneration("loading");
    setScene(null);
    setError(null);
    setDepthState("idle");
    setRenderReady(false);
  }, []);

  const onDialogClose = useCallback(() => {
    closeCallbackRef.current();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function requestScene() {
      try {
        for (let poll = 0; poll < 36; poll += 1) {
          const response = await fetch("/api/time-portal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId: place.id, year }),
            signal: controller.signal,
            cache: "no-store",
          });
          const payload = await response.json().catch(() => ({}));
          if (!active || controller.signal.aborted) return;

          if (response.status === 202) {
            const retryAfter = Number(response.headers.get("Retry-After"));
            await new Promise((resolve) => window.setTimeout(resolve, clamp(
              Number.isFinite(retryAfter) ? retryAfter : 3,
              1,
              6,
            ) * 1000));
            continue;
          }
          if (!response.ok)
            throw new Error(typeof payload.error === "string" ? payload.error : "time_portal_unavailable");
          if (
            typeof payload.imageUrl !== "string" ||
            typeof payload.disclosure !== "string"
          )
            throw new Error("time_portal_unavailable");

          setScene(payload as GeneratedScene);
          setGeneration("ready");
          return;
        }
        throw new Error("time_portal_preparing");
      } catch (requestError) {
        if (!active || controller.signal.aborted) return;
        const code = requestError instanceof Error ? requestError.message : undefined;
        setError(errorMessage(code));
        setGeneration("error");
      }
    }

    void requestScene();
    return () => {
      active = false;
      controller.abort();
    };
  }, [place.id, year, attempt]);

  useEffect(() => {
    if (!scene?.imageUrl || !canvasRef.current) return;
    let active = true;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let colorTexture: THREE.Texture | null = null;
    let material: THREE.ShaderMaterial | null = null;
    const canvas = canvasRef.current;
    setRenderReady(false);

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(76, 1, 0.1, 60);
    camera.position.set(0, 1.65, 0);
    camera.rotation.order = "YXZ";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const aspect = 21 / 9;
    const radius = 2.4;
    const cylinderHeight = (Math.PI * 2 * radius) / aspect;
    const geometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 256, 64, true);
    material = new THREE.ShaderMaterial({
      uniforms: {
        uColorMap: { value: null },
        uDepthMap: {
          value: new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.RedFormat),
        },
        uDepthAmount: { value: 0.46 },
        uHasDepth: { value: 0 },
      },
      vertexShader: DEPTH_VERTEX_SHADER,
      fragmentShader: DEPTH_FRAGMENT_SHADER,
      side: THREE.BackSide,
      toneMapped: false,
    });
    const placeholder = material.uniforms.uDepthMap.value as THREE.DataTexture;
    placeholder.needsUpdate = true;
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.position.y = 1.65;
    world.add(cylinder);
    materialRef.current = material;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer?.setSize(width, height, false);
      invalidateRef.current?.();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let yaw = 0;
    let pitch = 0;
    let targetYaw = 0;
    let targetPitch = 0;
    let leanX = 0;
    let leanY = 0;
    let targetLeanX = 0;
    let targetLeanY = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      targetYaw -= dx * 0.0032;
      targetPitch = clamp(targetPitch + dy * 0.0028, -0.18, 0.18);
      targetLeanX = reducedMotion ? 0 : clamp(-dx * 0.008, -0.09, 0.09);
      targetLeanY = reducedMotion ? 0 : clamp(dy * 0.005, -0.05, 0.05);
      lastX = event.clientX;
      lastY = event.clientY;
      invalidateRef.current?.();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pointerId === event.pointerId) {
        pointerId = null;
        targetLeanX = 0;
        targetLeanY = 0;
        invalidateRef.current?.();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") targetYaw += 0.12;
      if (event.key === "ArrowRight") targetYaw -= 0.12;
      if (event.key === "ArrowUp") targetPitch = clamp(targetPitch + 0.08, -0.18, 0.18);
      if (event.key === "ArrowDown") targetPitch = clamp(targetPitch - 0.08, -0.18, 0.18);
      invalidateRef.current?.();
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("keydown", onKeyDown);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    colorTexture = loader.load(
      scene.imageUrl,
      () => {
        if (!active || !material) return;
        colorTexture!.colorSpace = THREE.SRGBColorSpace;
        colorTexture!.wrapS = THREE.RepeatWrapping;
        colorTexture!.wrapT = THREE.ClampToEdgeWrapping;
        colorTexture!.minFilter = THREE.LinearFilter;
        colorTexture!.magFilter = THREE.LinearFilter;
        material.uniforms.uColorMap.value = colorTexture;
        material.uniforms.uColorMap.value.needsUpdate = true;
        invalidateRef.current?.();
        setRenderReady(true);
      },
      undefined,
      () => { if (active) setRenderReady(false); },
    );

    resetViewRef.current = () => {
      targetYaw = 0;
      targetPitch = 0;
      targetLeanX = 0;
      targetLeanY = 0;
      invalidateRef.current?.();
    };

    let lastFrameTime = performance.now();
    const draw = (now: number) => {
      raf = 0;
      if (!active || !renderer) return;
      const delta = clamp((now - lastFrameTime) / 1000, 1 / 120, 0.05);
      lastFrameTime = now;
      const smoothing = reducedMotion ? 1 : 1 - Math.exp(-12 * delta);
      yaw += (targetYaw - yaw) * smoothing;
      pitch += (targetPitch - pitch) * smoothing;
      leanX += (targetLeanX - leanX) * smoothing;
      leanY += (targetLeanY - leanY) * smoothing;
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.position.set(Math.cos(yaw) * leanX, 1.65 + leanY, -Math.sin(yaw) * leanX);
      renderer.render(world, camera);
      if (Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) +
          Math.abs(targetLeanX - leanX) + Math.abs(targetLeanY - leanY) > 0.0001)
        raf = window.requestAnimationFrame(draw);
    };
    invalidateRef.current = () => {
      if (!raf && active) raf = window.requestAnimationFrame(draw);
    };
    invalidateRef.current();

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      colorTexture?.dispose();
      const depthMap = material?.uniforms.uDepthMap.value as THREE.Texture | undefined;
      depthMap?.dispose();
      material?.dispose();
      geometry.dispose();
      renderer?.dispose();
      if (materialRef.current === material) materialRef.current = null;
      resetViewRef.current = null;
      invalidateRef.current = null;
    };
  }, [scene?.imageUrl]);

  const sceneImageUrl = scene?.imageUrl;
  const sceneId = scene?.sceneId;
  useEffect(() => {
    if (!sceneImageUrl || !materialRef.current) return;
    const worker = depthWorkerRef.current;
    if (!worker) {
      queueMicrotask(() => setDepthState("unavailable"));
      return;
    }
    let activeWorker: Worker = worker;
    let retriedWasm = false;
    const jobId = ++depthJobRef.current;
    setDepthState("loading");
    const onMessage = (event: MessageEvent<{
      id: number;
      error?: string;
      pixels?: ArrayBuffer;
      width?: number;
      height?: number;
    }>) => {
      const result = event.data;
      if (result.id !== jobId) return;
      if (result.error === "retry_wasm" && !retriedWasm) {
        retriedWasm = true;
        activeWorker.removeEventListener("message", onMessage);
        activeWorker.removeEventListener("error", onError);
        activeWorker.terminate();
        try {
          activeWorker = new Worker(new URL("../lib/time-portal-depth.worker.ts", import.meta.url), { type: "module" });
          depthWorkerRef.current = activeWorker;
          activeWorker.addEventListener("message", onMessage);
          activeWorker.addEventListener("error", onError);
          activeWorker.postMessage({ id: jobId, imageUrl: sceneImageUrl, sceneId, forceWasm: true });
        } catch {
          setDepthState("unavailable");
        }
        return;
      }
      if (result.error || !result.pixels || !result.width || !result.height) {
        setDepthState("unavailable");
        return;
      }
      const material = materialRef.current;
      if (!material) return;
      const texture = new THREE.DataTexture(
        new Uint8Array(result.pixels), result.width, result.height, THREE.RedFormat,
      );
      texture.flipY = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      const previous = material.uniforms.uDepthMap.value as THREE.Texture;
      material.uniforms.uDepthMap.value = texture;
      material.uniforms.uHasDepth.value = 1;
      previous.dispose();
      invalidateRef.current?.();
      setDepthState("ready");
    };
    const onError = () => setDepthState("unavailable");
    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onError);
    activeWorker.postMessage({ id: jobId, imageUrl: sceneImageUrl, sceneId });
    return () => {
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onError);
    };
  }, [sceneImageUrl, sceneId]);

  const yearLabel = year === CURRENT_YEAR ? t("portal.today") : String(year);

  return (
    <dialog
      ref={dialogRef}
      className="time-portal-dialog"
      aria-labelledby="time-portal-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onDialogClose}
    >
      <div className="time-portal-screen">
        <div className="time-portal-stage">
          {scene?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={"time-portal-still" + (renderReady ? " is-covered" : "")}
              src={scene.imageUrl}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
            />
          )}
          <canvas
            ref={canvasRef}
            tabIndex={0}
            className={"time-portal-canvas" + (renderReady ? " is-visible" : "")}
            aria-label={t("portal.panoramaLabel")}
          />
          <div className="time-portal-shade" aria-hidden="true" />
          <header className="time-portal-header">
            <button
              type="button"
              className="time-portal-back"
              onClick={close}
              aria-label={t("portal.close")}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <div className="time-portal-heading">
              <span><History size={14} aria-hidden="true" /> {t("portal.title")}</span>
              <h1 id="time-portal-title">{place.name}</h1>
            </div>
            <button
              type="button"
              className="time-portal-compass"
              onClick={() => resetViewRef.current?.()}
              aria-label={t("portal.reset")}
              disabled={!renderReady}
            >
              <Compass size={19} aria-hidden="true" />
            </button>
          </header>
          {generation === "loading" && (
            <div className="time-portal-generating" role="status">
              <LoaderCircle className="time-portal-spinner" size={20} aria-hidden="true" />
              <span>{t("portal.building", { year: yearLabel })}</span>
            </div>
          )}
          {generation === "error" && (
            <div className="time-portal-error" role="alert">
              <p>{t(error ?? "portal.errorScene")}</p>
              <button
                type="button"
                onClick={() => {
                  beginGeneration();
                  setAttempt((value) => value + 1);
                }}
              >
                {t("app.retry")}
              </button>
            </div>
          )}
          {scene && (
            <div className="time-portal-depth-state" role="status">
              <span className={"time-portal-depth-dot" + (depthState === "ready" ? " is-ready" : "")} />
              <span>
                {depthState === "loading"
                  ? t("portal.addingDepth")
                  : depthState === "ready"
                    ? t("portal.depthView")
                    : depthState === "unavailable"
                      ? t("portal.panoramaView")
                      : t("portal.panoramaView")}
              </span>
            </div>
          )}
        </div>

        <section className="time-portal-panel" aria-label={t("portal.chooseYear")}>
          <div className="time-portal-panel-top">
            <div>
              <h2>{yearLabel}</h2>
            </div>
          </div>
          <div className="time-portal-years" role="group" aria-label={t("portal.years")}>
            {ERA_CHOICES.map((option) => (
              <button
                key={option}
                type="button"
                className={year === option ? "is-selected" : ""}
                aria-pressed={year === option}
                disabled={generation === "loading"}
                onClick={() => {
                  if (option !== year) {
                    beginGeneration();
                    setYear(option);
                  }
                }}
              >
                {option === CURRENT_YEAR ? t("portal.today") : option}
              </button>
            ))}
          </div>
          {scene && (
            <details className="time-portal-sources" open={Boolean(scene.searchSuggestions)}>
              <summary>{t("portal.references")}</summary>
              {scene.searchSuggestions ? (
                <iframe
                  title={t("portal.referencesTitle")}
                  srcDoc={scene.searchSuggestions}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <p>{t("portal.noReferences")}</p>
              )}
            </details>
          )}
          <p className="time-portal-note">
            <Sparkles size={14} aria-hidden="true" />
            <span>{t("portal.disclosure")}</span>
          </p>
        </section>
      </div>
    </dialog>
  );
}
