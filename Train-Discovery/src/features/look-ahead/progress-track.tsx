"use client";

import { Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { AirQualityZone, ConnectivityZone } from "@/lib/package-types";
import type { BalanceBin } from "./advisor";

export type StripLayer = "pois" | "air" | "signal";

/** AQI category → status token. The first four are the documented status scale. */
export const AQI_FILL: Record<AirQualityZone["category"], string> = {
  good: "var(--status-good)",
  moderate: "var(--status-warning)",
  usg: "var(--status-serious)",
  unhealthy: "var(--status-critical)",
  veryUnhealthy: "var(--status-critical-2)",
  hazardous: "var(--status-critical-3)",
};

const W = 1000;

/** Which side has more highlights, stretch by stretch. Polarity is the arrow, never color alone. */
export function SideBalanceStrip({ bins, totalKm, label }: { bins: BalanceBin[]; totalKm: number; label: string }) {
  const { t } = useI18n();
  if (!bins.length || totalKm <= 0) return null;
  const summary = bins
    .filter((bin) => bin.better !== "even")
    .map((bin) => `${Math.round(bin.fromKm)}–${Math.round(bin.toKm)} km: ${t(`side.short.${bin.better}`)}`)
    .join(", ");
  return (
    <div className="balance-strip" role="img" aria-label={`${label}. ${summary || t("advisor.evenHint")}`}>
      {bins.map((bin, i) => (
        <span
          key={i}
          className={`balance-bin is-${bin.better}`}
          style={{ flexGrow: Math.max(0.01, bin.toKm - bin.fromKm) }}
          title={`${Math.round(bin.fromKm)}–${Math.round(bin.toKm)} km · ${bin.better === "even" ? t("advisor.better.even") : t(`advisor.better.${bin.better}`)}`}
        >
          {bin.better === "left" ? "←" : bin.better === "right" ? "→" : ""}
        </span>
      ))}
    </div>
  );
}

/** Ride progress with one switchable strip: places by side, air quality, or estimated signal. */
export function ProgressTrack({
  totalKm,
  km,
  direction,
  startLabel,
  endLabel,
  layer,
  layers,
  onLayer,
  balance,
  nextWindow,
  air,
  signal,
  estimated,
}: {
  totalKm: number;
  km: number | null;
  direction: 1 | -1 | null;
  startLabel: string;
  endLabel: string;
  layer: StripLayer;
  layers: StripLayer[];
  onLayer: (layer: StripLayer) => void;
  balance: BalanceBin[];
  nextWindow: "left" | "right" | "even" | null;
  air: AirQualityZone[];
  signal: ConnectivityZone[];
  estimated: boolean;
}) {
  const { t, distance } = useI18n();
  const at = km === null || totalKm <= 0 ? null : Math.max(0, Math.min(1, km / totalKm));
  const x = (value: number) => (Math.max(0, Math.min(totalKm, value)) / totalKm) * W;
  return (
    <section className="progress-track" aria-label={t("progress.label")}>
      <div className="progress-ends">
        <span>{direction === -1 ? endLabel : startLabel}</span>
        <span className="progress-at">
          {at !== null && km !== null
            ? t("progress.position", { done: distance(Math.abs((direction === -1 ? totalKm - km : km)) * 1000), total: distance(totalKm * 1000) })
            : ""}
          {estimated && <em className="estimate-tag">{t("connectivity.estimatedPosition")}</em>}
        </span>
        <span>{direction === -1 ? startLabel : endLabel}</span>
      </div>
      <div className={`progress-rail${direction === -1 ? " is-reverse" : ""}`}>
        <span className="progress-fill" style={{ width: `${(at ?? 0) * 100}%` }} />
        {at !== null && (
          <span className="progress-dot" style={{ left: `${at * 100}%` }} role="img" aria-label={t("progress.you")} />
        )}
      </div>
      {layer === "pois" && (
        <>
          <SideBalanceStrip bins={balance} totalKm={totalKm} label={t("advisor.balance")} />
          {nextWindow && (
            <p className="progress-note">
              {nextWindow === "even" ? t("advisor.nextWindowEven") : t("advisor.nextWindow", { side: t(`side.short.${nextWindow}`) })}
            </p>
          )}
        </>
      )}
      {layer === "air" && (
        <>
          <svg className="zone-strip" viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" role="img"
            aria-label={air.map((zone) => `${Math.round(zone.startKm)}–${Math.round(zone.endKm)} km: ${t(`air.category.${zone.category}`)}, AQI ${zone.aqi}`).join("; ") || t("air.unavailable")}>
            {air.map((zone) => (
              <rect key={zone.id} x={x(zone.startKm) + 1} width={Math.max(1, x(zone.endKm) - x(zone.startKm) - 2)} y="0" height="14" rx="3"
                fill={AQI_FILL[zone.category]}>
                <title>{`${t(`air.category.${zone.category}`)} · AQI ${zone.aqi}${zone.simulated ? ` · ${t("air.simulated")}` : ""}`}</title>
              </rect>
            ))}
          </svg>
          {air.length > 0 && (
            <details className="strip-table">
              <summary>{t("air.title")}</summary>
              <table>
                <tbody>
                  {air.map((zone) => (
                    <tr key={zone.id}>
                      <td>{Math.round(zone.startKm)}–{Math.round(zone.endKm)} km</td>
                      <td>{t(`air.category.${zone.category}`)}</td>
                      <td>AQI {zone.aqi}{zone.simulated ? ` · ${t("air.simulated")}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
      {layer === "signal" && (
        <>
          <svg className="zone-strip signal-strip" viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" role="img"
            aria-label={signal.map((zone) => `${Math.round(zone.startKm)}–${Math.round(zone.endKm)} km: ${t(`connectivity.reason.${zone.reason}`)} (${t(`connectivity.confidence.${zone.confidence}`)})`).join("; ") || t("connectivity.estimated")}>
            <rect x="0" width={W} y="6" height="2" fill="var(--line)" />
            {signal.map((zone) => (
              <rect key={zone.id} x={x(zone.startKm)} width={Math.max(4, x(zone.endKm) - x(zone.startKm))} y="0" height="14" rx="3"
                className={`signal-zone is-${zone.confidence}`}>
                <title>{`${t(`connectivity.reason.${zone.reason}`)} · ${t(`connectivity.confidence.${zone.confidence}`)} · ${t("connectivity.estimated")}`}</title>
              </rect>
            ))}
          </svg>
          {signal.length > 0 && (
            <details className="strip-table">
              <summary>{t("connectivity.strip")} · {t("connectivity.estimated")}</summary>
              <table>
                <tbody>
                  {signal.map((zone) => (
                    <tr key={zone.id}>
                      <td>{Math.round(zone.startKm)}–{Math.round(zone.endKm)} km</td>
                      <td>{zone.name ?? t(`connectivity.reason.${zone.reason}`)}</td>
                      <td>{t(`connectivity.confidence.${zone.confidence}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
      {layers.length > 1 && (
        <div className="layer-chips" role="group" aria-label={t("layers.label")}>
          <Layers size={14} aria-hidden="true" />
          {layers.map((item) => (
            <button key={item} type="button" aria-pressed={layer === item} onClick={() => onLayer(item)}>
              {t(`layers.${item}`)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
