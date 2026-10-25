"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { pointingConeLngLats, pointingConeZoom } from "@/lib/geo";
import type { Coordinate } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";
import "./ride-map.css";

if (typeof window !== "undefined") setWorkerUrl("/maplibre-worker");

export const RIDE_BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

const CANVAS = "#eaedf3";
const PAPER = "#fefeff";
const INK = "#0c101d";
const MUTED = "#5d6069";
const LINE = "#cdd1db";
const CONE = "#0071f2";

const FILL_COLOR: Record<string, string> = {
  park: "#d7e0ec",
  landcover_ice_shelf: PAPER,
  landcover_glacier: PAPER,
  landuse_residential: "#e1e7f0",
  landcover_wood: "#cfd8e6",
  water: "#c3d0e4",
  building: PAPER,
  "aeroway-area": PAPER,
  road_area_pier: CANVAS,
};

const LINE_COLOR: Record<string, string> = {
  waterway: "#aebdd4",
  highway_path: LINE,
  highway_minor: PAPER,
  highway_major_casing: LINE,
  highway_major_inner: PAPER,
  highway_major_subtle: LINE,
  highway_motorway_casing: LINE,
  highway_motorway_inner: PAPER,
  highway_motorway_subtle: LINE,
  highway_motorway_bridge_casing: LINE,
  highway_motorway_bridge_inner: PAPER,
  tunnel_motorway_casing: LINE,
  tunnel_motorway_inner: "#e7ebf3",
  "aeroway-taxiway": LINE,
  "aeroway-runway-casing": LINE,
  "aeroway-runway": PAPER,
  road_pier: CANVAS,
  railway_transit: LINE,
  railway_transit_dashline: PAPER,
  railway_service: LINE,
  railway_service_dashline: PAPER,
  railway: LINE,
  railway_dashline: PAPER,
  boundary_3: LINE,
  boundary_2: LINE,
  boundary_disputed: LINE,
};

const INK_LABELS = new Set([
  "label_village",
  "label_town",
  "label_city",
  "label_city_capital",
  "label_country_1",
  "label_country_2",
  "label_country_3",
]);

const MUTED_LABELS = new Set([
  "waterway_line_label",
  "water_name_point_label",
  "water_name_line_label",
  "highway-name-path",
  "highway-name-minor",
  "highway-name-major",
  "airport",
  "label_other",
  "label_state",
]);

const HIDDEN_LAYERS = new Set([
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
]);

type QuietLayer = {
  id: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

function parseColor(input: string): [number, number, number, number] | null {
  const value = input.trim();
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let body = hex[1] ?? "";
    if (body.length === 3 || body.length === 4) {
      body = body
        .split("")
        .map((channel) => channel + channel)
        .join("");
    }
    if (body.length !== 6 && body.length !== 8) return null;
    const rgb = Number.parseInt(body.slice(0, 6), 16);
    const alpha = body.length === 8 ? Number.parseInt(body.slice(6), 16) / 255 : 1;
    return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, alpha];
  }
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i,
  );
  if (rgb) {
    const alpha = rgb[4]?.endsWith("%")
      ? Number.parseFloat(rgb[4]) / 100
      : rgb[4] !== undefined
        ? Number.parseFloat(rgb[4])
        : 1;
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
  }
  const hsl = value.match(
    /^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+%?))?\s*\)$/i,
  );
  if (!hsl) return null;
  const hue = Number(hsl[1]) / 360;
  const sat = Number(hsl[2]) / 100;
  const light = Number(hsl[3]) / 100;
  const alpha = hsl[4]?.endsWith("%")
    ? Number.parseFloat(hsl[4]) / 100
    : hsl[4] !== undefined
      ? Number.parseFloat(hsl[4])
      : 1;
  const channel = (t: number) => {
    if (sat === 0) return light;
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const wrapped = ((t % 1) + 1) % 1;
    if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
    if (wrapped < 1 / 2) return q;
    if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
    return p;
  };
  return [
    Math.round(channel(hue + 1 / 3) * 255),
    Math.round(channel(hue) * 255),
    Math.round(channel(hue - 1 / 3) * 255),
    alpha,
  ];
}

function coolExpression(value: unknown): unknown {
  if (typeof value === "string") {
    const parsed = parseColor(value);
    if (!parsed) return value;
    const [red, green, blue, alpha] = parsed;
    if (!(green > red + 2 && green > blue + 2)) return value;
    const tone = (red + green + blue) / 3;
    const mix = 0.72;
    const nextRed = Math.round(tone * (1 - mix) + 234 * mix);
    const nextGreen = Math.round(tone * (1 - mix) + 237 * mix);
    const nextBlue = Math.max(nextGreen, Math.round(tone * (1 - mix) + 243 * mix));
    if (alpha >= 0.999) {
      const hex = [nextRed, nextGreen, nextBlue]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("");
      return `#${hex}`;
    }
    return `rgba(${nextRed}, ${nextGreen}, ${nextBlue}, ${Number(alpha.toFixed(3))})`;
  }
  if (Array.isArray(value)) return value.map(coolExpression);
  return value;
}

function quietPaintEdits(id: string): Record<string, unknown> {
  const paint: Record<string, unknown> = {};
  if (id === "background") paint["background-color"] = CANVAS;
  const fill = FILL_COLOR[id];
  if (fill) paint["fill-color"] = fill;
  if (id === "building") paint["fill-outline-color"] = LINE;
  if (id === "landuse_residential") paint["fill-opacity"] = 1;
  const line = LINE_COLOR[id];
  if (line) paint["line-color"] = line;
  if (INK_LABELS.has(id) || MUTED_LABELS.has(id)) {
    paint["text-color"] = INK_LABELS.has(id) ? INK : MUTED;
    paint["text-halo-color"] = PAPER;
    paint["text-halo-width"] = 1.1;
    paint["text-halo-blur"] = 0.15;
  }
  if (id === "airport") paint["icon-opacity"] = 0;
  return paint;
}

function quietRideStyle(style: StyleSpecification): StyleSpecification {
  const next = structuredClone(style) as StyleSpecification;
  for (const layer of next.layers as QuietLayer[]) {
    const paint = { ...(layer.paint ?? {}) };
    for (const key of Object.keys(paint)) {
      if (key.includes("color")) paint[key] = coolExpression(paint[key]);
    }
    Object.assign(paint, quietPaintEdits(layer.id));
    if (Object.keys(paint).length > 0) layer.paint = paint;
    if (HIDDEN_LAYERS.has(layer.id)) {
      layer.layout = { ...(layer.layout ?? {}), visibility: "none" };
    }
  }
  return next;
}

function applyQuietBasemap(map: MapLibreMap) {
  const layers = map.getStyle()?.layers as QuietLayer[] | undefined;
  if (!layers) return;
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) continue;
    for (const [name, value] of Object.entries(quietPaintEdits(layer.id))) {
      map.setPaintProperty(layer.id, name as "fill-color", value as string);
    }
    if (HIDDEN_LAYERS.has(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

function useQuietBasemap() {
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  useEffect(() => {
    let cancel = false;
    fetch(RIDE_BASEMAP_STYLE)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<StyleSpecification>;
      })
      .then((json) => {
        if (!cancel) setStyle(quietRideStyle(json));
      })
      .catch(() => {
        if (!cancel) setStyle(RIDE_BASEMAP_STYLE);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return style;
}

function parkAttribution(canvas: HTMLElement, credit: HTMLElement) {
  const attrib = canvas.querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
  if (!attrib || attrib.parentElement === credit) return;
  credit.replaceChildren(attrib);
}

function trackData(paths: [number, number][][]) {
  return {
    type: "FeatureCollection" as const,
    features: paths
      .filter((path) => path.length > 1)
      .map((path) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: path.map(([lat, lon]) => [lon, lat]),
        },
      })),
  };
}

function RideMapCanvas({
  position,
  heading,
  paths,
  color,
  label,
  radius,
}: {
  position: Coordinate;
  heading: number | null;
  paths: [number, number][][];
  color?: string;
  label: string;
  radius?: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const credit = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const basemap = useQuietBasemap();
  const [zoom, setZoom] = useState(() => pointingConeZoom(position.lat, 320, radius));
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const apply = () => {
      mapRef.current?.resize();
      const rect = node.getBoundingClientRect();
      const span = Math.min(rect.width, rect.height);
      if (span < 8) return;
      const next = pointingConeZoom(position.lat, span, radius);
      setZoom((current) => (Math.abs(current - next) < 0.02 ? current : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [position.lat, basemap, radius]);
  useEffect(() => {
    const canvas = frame.current;
    const slot = credit.current;
    if (!canvas || !slot) return;
    const park = () => parkAttribution(canvas, slot);
    park();
    const observer = new MutationObserver(park);
    observer.observe(canvas, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [basemap]);

  if (unavailable) {
    return <div className="ride-map ride-map-waiting" role="group" aria-label={label} />;
  }

  const cone =
    heading !== null && Number.isFinite(heading)
      ? pointingConeLngLats(position, heading, radius)
      : null;
  const track = trackData(paths);
  const trackColor = color || MUTED;

  return (
    <div className="ride-map" role="group" aria-label={label}>
      <div ref={frame} className="ride-map-canvas">
        {basemap ? (
          <Map
            mapLib={maplibregl}
            mapStyle={basemap}
            longitude={position.lon}
            latitude={position.lat}
            zoom={zoom}
            bearing={0}
            pitch={0}
            minPitch={0}
            maxPitch={0}
            interactive={false}
            dragPan={false}
            dragRotate={false}
            scrollZoom={false}
            boxZoom={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            touchPitch={false}
            keyboard={false}
            maplibreLogo={false}
            attributionControl={{ compact: false }}
            cursor="default"
            canvasContextAttributes={{ failIfMajorPerformanceCaveat: false }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
            onLoad={(event) => {
              mapRef.current = event.target;
              event.target.resize();
              if (typeof basemap === "string") applyQuietBasemap(event.target);
              const slot = credit.current;
              if (slot) parkAttribution(event.target.getContainer(), slot);
            }}
            onError={(event) => {
              if (/webgl/i.test(event.error?.message ?? "")) setUnavailable(true);
            }}
          >
            {track.features.length > 0 ? (
              <Source id="branch-track" type="geojson" data={track}>
                <Layer
                  id="branch-track-casing"
                  type="line"
                  paint={{
                    "line-color": PAPER,
                    "line-width": 4,
                    "line-opacity": 0.95,
                  }}
                />
                <Layer
                  id="branch-track-line"
                  type="line"
                  paint={{
                    "line-color": trackColor,
                    "line-width": 2,
                    "line-opacity": 0.9,
                  }}
                />
              </Source>
            ) : null}
            {cone ? (
              <Source
                id="pointing-cone"
                type="geojson"
                data={{
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Polygon", coordinates: [cone] },
                }}
              >
                <Layer
                  id="pointing-cone-fill"
                  type="fill"
                  paint={{ "fill-color": CONE, "fill-opacity": 0.2 }}
                />
                <Layer
                  id="pointing-cone-edge"
                  type="line"
                  paint={{
                    "line-color": CONE,
                    "line-width": 1,
                    "line-opacity": 0.35,
                  }}
                />
              </Source>
            ) : null}
            <Marker longitude={position.lon} latitude={position.lat} anchor="center">
              <span className="rider-dot" />
            </Marker>
          </Map>
        ) : null}
      </div>
      <div ref={credit} className="ride-map-credit" />
    </div>
  );
}

class RideMapBoundary extends Component<
  { label: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="ride-map ride-map-waiting" role="group" aria-label={this.props.label} />
      );
    }
    return this.props.children;
  }
}

export function RideMap({
  position,
  heading,
  paths = [],
  color,
  label,
  radius,
}: {
  position: Coordinate;
  heading: number | null;
  paths?: [number, number][][];
  color?: string;
  label: string;
  radius?: number;
}) {
  return (
    <RideMapBoundary label={label}>
      <RideMapCanvas
        position={position}
        heading={heading}
        paths={paths}
        color={color}
        label={label}
        radius={radius}
      />
    </RideMapBoundary>
  );
}
