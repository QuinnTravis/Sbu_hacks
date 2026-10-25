"use client";

import {
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { useState } from "react";
import {
  angleDelta,
  bearing,
  distance,
  formatDistance,
  normalize,
} from "@/lib/geo";
import type { Place, Position } from "@/lib/types";
import "./dev-panel.css";

export type HeadingMode = "auto" | "manual" | "phone";

export function DevPanel({
  open,
  onClose,
  replay,
  playing,
  onPlay,
  speed,
  maxSpeed = 240,
  onSpeed,
  direction,
  onReverse,
  progress,
  total,
  onSeek,
  onReset,
  resetLabel = "Jamaica",
  mode,
  onMode,
  manualHeading,
  onHeading,
  pitch,
  onPitch,
  position,
  heading,
  active,
  places,
  radius = 1200,
  onLocation,
  started,
  onStart,
  startLabel = "Jamaica",
  stations,
  onStation,
  queueCount,
  pausedReason,
}: {
  open: boolean;
  onClose: () => void;
  replay: boolean;
  playing: boolean;
  onPlay: () => void;
  speed: number;
  maxSpeed?: number;
  onSpeed: (n: number) => void;
  direction: number;
  onReverse: () => void;
  progress: number;
  total: number;
  onSeek: (n: number) => void;
  onReset: () => void;
  resetLabel?: string;
  mode: HeadingMode;
  onMode: (m: HeadingMode) => void;
  manualHeading: number;
  onHeading: (n: number) => void;
  pitch: number;
  onPitch: (n: number) => void;
  position: Position | null;
  heading: number | null;
  active: boolean;
  places: Place[];
  /** Pointing radius in meters; nearby targets list places within it. */
  radius?: number;
  onLocation: (replay: boolean) => void;
  started: boolean;
  onStart: () => void;
  startLabel?: string;
  stations: { id: string; name: string; offset: number }[];
  onStation: (offset: number) => void;
  queueCount: number;
  pausedReason?: string;
}) {
  const [compact, setCompact] = useState(false);
  if (!open) return null;
  const near = position
    ? places
        .map((p) => ({
          place: p,
          meters: distance(position, p),
          bearing: bearing(position, p),
        }))
        .filter((p) => p.meters <= radius)
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 8)
    : [];
  return (
    <aside
      className={`dev-panel train-dev-panel ${compact && started ? "dev-compact" : ""}`}
      aria-label="Developer controls"
    >
      <div className="dev-heading">
        <SlidersHorizontal size={17} />
        <h2>Dev panel</h2>
        {started && (
          <button
            className="icon-button"
            onClick={() => setCompact((v) => !v)}
            aria-label={
              compact ? "Expand dev controls" : "Compact dev controls"
            }
          >
            {compact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
          </button>
        )}
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dev panel"
        >
          <X size={18} />
        </button>
      </div>
      {!started ? (
        <button className="primary-button" onClick={onStart}>
          Start {startLabel} demo
        </button>
      ) : compact ? (
        <div className="dev-mini">
          <div className="dev-row">
            <label htmlFor="dev-mini-mode">Heading</label>
            <select
              id="dev-mini-mode"
              value={mode}
              onChange={(e) => onMode(e.target.value as HeadingMode)}
            >
              <option value="auto" disabled={!replay}>
                Auto aim
              </option>
              <option value="manual">Joystick</option>
              <option value="phone">Phone compass</option>
            </select>
          </div>
          {mode === "manual" ? (
            <HeadingJoystick value={manualHeading} onChange={onHeading} />
          ) : (
            <p className="dev-aim-readout">
              {pausedReason ??
                (heading === null ? "No heading" : `${Math.round(heading)}°`)}
              {" · "}
              {mode === "phone" ? "Phone" : "Auto aim"}
            </p>
          )}
          {replay && (
            <button className="secondary-button" onClick={onPlay}>
              {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
              {playing ? "Pause train" : "Play train"}
            </button>
          )}
          <small>
            {replay ? `Simulated train · ${speed} km/h` : "Real GPS"} · {queueCount} queued
          </small>
        </div>
      ) : (
        <>
          <div className="dev-row">
            <label htmlFor="dev-location">Location</label>
            <select
              id="dev-location"
              value={replay ? "replay" : "gps"}
              onChange={(e) => onLocation(e.target.value === "replay")}
            >
              <option value="replay">Simulated train</option>
              <option value="gps">Real GPS</option>
            </select>
          </div>
          {replay && (
            <>
              <div className="dev-transport">
                <button className="secondary-button" onClick={onPlay}>
                  {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
                  {playing ? "Pause train" : "Play train"}
                </button>
                <button className="secondary-button" onClick={onReverse}>
                  Direction {direction === 1 ? "→" : "←"}
                </button>
                <button
                  className="icon-button"
                  onClick={onReset}
                  aria-label={`Reset train to ${resetLabel}`}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <label className="dev-slider">
                Speed <output>{speed} km/h</output>
                <input
                  aria-label="Train speed"
                  type="range"
                  min="0"
                  max={maxSpeed}
                  step="5"
                  value={speed}
                  onChange={(e) => onSpeed(+e.target.value)}
                />
              </label>
              <label className="dev-slider">
                Route position{" "}
                <output>
                  {formatDistance(progress)} / {formatDistance(total)}
                </output>
                <input
                  aria-label="Route position"
                  type="range"
                  min="0"
                  max={total || 1}
                  step="1"
                  value={progress}
                  onChange={(e) => onSeek(+e.target.value)}
                />
              </label>
              <div className="dev-step">
                <button onClick={() => onSeek(progress - 250)}>−250 m</button>
                <button onClick={() => onSeek(progress + 250)}>+250 m</button>
              </div>
              <div className="dev-row">
                <label htmlFor="dev-station">Jump to</label>
                <select
                  id="dev-station"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onStation(+e.target.value);
                  }}
                >
                  <option value="">Choose a place or station</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.offset}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="dev-row">
            <label htmlFor="dev-heading-mode">Heading</label>
            <select
              id="dev-heading-mode"
              value={mode}
              onChange={(e) => onMode(e.target.value as HeadingMode)}
            >
              <option value="auto" disabled={!replay}>
                Auto aim at POI
              </option>
              <option value="manual">Joystick</option>
              <option value="phone">Phone compass</option>
            </select>
          </div>
          {mode === "manual" && (
            <div className="dev-joystick-area">
              <HeadingJoystick value={manualHeading} onChange={onHeading} />
              <div>
                <strong>{Math.round(manualHeading)}°</strong>
                <p>
                  Drag to point.
                  <br />
                  Arrow keys turn 5°.
                </p>
                <label className="dev-slider">
                  Phone tilt <output>{pitch}°</output>
                  <input
                    aria-label="Phone tilt"
                    type="range"
                    min="0"
                    max="90"
                    step="1"
                    value={pitch}
                    onChange={(e) => onPitch(+e.target.value)}
                  />
                </label>
                <small>0° flat · 90° upright</small>
              </div>
            </div>
          )}
          {mode === "phone" && (
            <>
              <p className="dev-note">
                Uses real absolute orientation. On a phone, allow motion access
                and hold it upright.
              </p>
              <button
                className="secondary-button"
                onClick={() => onMode("phone")}
              >
                Retry phone compass
              </button>
            </>
          )}
          <dl className="dev-readings">
            <div>
              <dt>Detection</dt>
              <dd
                data-testid="dev-detection"
                className={!active && pausedReason ? "dev-detection-reason" : undefined}
              >
                {active
                  ? "Active"
                  : pausedReason ?? "Paused — check sensors / tilt"}
              </dd>
            </div>
            <div>
              <dt>Position source</dt>
              <dd>{replay ? "Simulated" : "GPS"}</dd>
            </div>
            <div>
              <dt>Heading source</dt>
              <dd>
                {mode === "auto"
                  ? "Simulated auto aim"
                  : mode === "manual"
                    ? "Simulated joystick"
                    : "Phone compass"}
              </dd>
            </div>
            <div>
              <dt>Coordinates</dt>
              <dd data-testid="dev-coordinates">
                {position
                  ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}`
                  : "Waiting"}
              </dd>
            </div>
            <div>
              <dt>Heading</dt>
              <dd>
                {heading === null ? "Unavailable" : `${Math.round(heading)}°`}
              </dd>
            </div>
            <div>
              <dt>Discoveries queued</dt>
              <dd>{queueCount}</dd>
            </div>
          </dl>
          <div className="dev-pois">
            <h3>Nearby targets</h3>
            {near.length ? (
              near.map(({ place, meters, bearing: angle }) => (
                <button
                  key={place.id}
                  onClick={() => {
                    onMode("manual");
                    onHeading(angle);
                    onPitch(90);
                  }}
                >
                  <span>
                    {place.name}
                    <small>
                      {formatDistance(meters)} · {Math.round(angle)}°
                      {heading !== null
                        ? ` · Δ ${Math.round(Math.abs(angleDelta(angle, heading)))}°`
                        : ""}
                    </small>
                  </span>
                  <span>Aim</span>
                </button>
              ))
            ) : (
              <p>No targets within {formatDistance(radius)}.</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function HeadingJoystick({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2,
      y = e.clientY - rect.top - rect.height / 2;
    if (Math.hypot(x, y) > 6)
      onChange(normalize((Math.atan2(x, -y) * 180) / Math.PI));
  };
  const a = (value * Math.PI) / 180;
  return (
    <div
      className="heading-joystick"
      role="slider"
      tabIndex={0}
      aria-label="Simulated phone heading"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(value) % 360}
      aria-valuetext={`${Math.round(value) % 360} degrees`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        point(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) point(e);
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        if (
          [
            "ArrowLeft",
            "ArrowDown",
            "ArrowRight",
            "ArrowUp",
            "Home",
            "End",
          ].includes(e.key)
        ) {
          e.preventDefault();
          onChange(
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? 355
                : normalize(
                    value +
                      (["ArrowLeft", "ArrowDown"].includes(e.key) ? -5 : 5),
                  ),
          );
        }
      }}
    >
      <span className="joystick-n">N</span>
      <span className="joystick-s">S</span>
      <span className="joystick-e">E</span>
      <span className="joystick-w">W</span>
      <span
        className="joystick-arm"
        style={{ transform: `translate(-50%, -100%) rotate(${value}deg)` }}
      />
      <span
        className="joystick-knob"
        style={{
          left: `calc(50% + ${Math.sin(a) * 35}px)`,
          top: `calc(50% - ${Math.cos(a) * 35}px)`,
        }}
      />
    </div>
  );
}
