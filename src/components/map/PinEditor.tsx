"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { loadMapLibre, MAP_STYLE_URL } from "@/lib/map/maplibre";

/**
 * The pin-correction map: a draggable gold pin for where the camera stood, a
 * line for which way it faced, the campus outline, and optional extras.
 * Used by the photo pipeline's review tool (/dev/photos) and the contribution
 * review page (/admin/contributions).
 */

export type MapDot = { id: string; lat: number; lng: number; color: string; heading?: number | null };
type Point = { lat: number; lng: number };

export type PinEditorProps = {
  /** The campus boundary (and, optionally, the buffer ring around it). */
  campus: Feature | FeatureCollection;
  ring?: Feature | null;
  /** The pin. With none, a click on the map calls onPlace. */
  pin: Point | null;
  /** Which way the camera faced (degrees from true north), drawn from the pin. */
  heading: number | null;
  /** The GPS fix and its accuracy radius, drawn as a circle. */
  accuracy?: (Point & { radiusM: number }) | null;
  /** Where GPS first put the photo, shown as a faint dot once the pin has moved. */
  ghost?: Point | null;
  /** Other photos (with their view lines, when they have a heading). */
  dots?: MapDot[];
  onDotClick?: (id: string) => void;
  onPinMove: (lat: number, lng: number) => void;
  onPlace?: (lat: number, lng: number) => void;
  /** Changing this re-centres the map on the pin (a new photo was picked). */
  focusKey?: string | null;
  className?: string;
};

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const CAMPUS_BOUNDS: [number, number, number, number] = [-118.4556, 34.0635, -118.4372, 34.0783];

/** A point `meters` from a start along a compass heading. Good enough for drawing a short arrow. */
export function ahead(lng: number, lat: number, heading: number, meters: number): [number, number] {
  const r = (heading * Math.PI) / 180;
  return [lng + (meters * Math.sin(r)) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (meters * Math.cos(r)) / 111_320];
}

/** A circle of `radiusM` around a point, as a polygon. */
function circle(lng: number, lat: number, radiusM: number): Feature {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) ring.push(ahead(lng, lat, (i * 360) / 64, radiusM));
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/** The view line, with a short arrow head so the direction reads at a glance. */
function viewLine(lng: number, lat: number, heading: number, meters = 35): Feature {
  const tip = ahead(lng, lat, heading, meters);
  const left = ahead(tip[0], tip[1], heading + 150, meters * 0.25);
  const right = ahead(tip[0], tip[1], heading - 150, meters * 0.25);
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [[[lng, lat], tip], [left, tip, right]] } };
}

export default function PinEditor(props: PinEditorProps) {
  const { campus, ring, pin, heading, accuracy, ghost, dots, focusKey, className } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const markerClass = useRef<typeof Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Map handlers are registered once, so they read the latest props through a ref.
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    let map: MapLibreMap | undefined;
    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        markerClass.current = maplibre.Marker;
        map = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          bounds: CAMPUS_BOUNDS,
          fitBoundsOptions: { padding: 30 },
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
        map.on("error", (ev) => setMapError(ev.error?.message ?? "The map failed to load."));
        map.on("load", () => {
          if (!map) return;
          for (const id of ["campus", "ring", "accuracy", "dots", "dot-views", "view", "ghost"]) map.addSource(id, { type: "geojson", data: EMPTY });
          map.addLayer({ id: "campus-fill", type: "fill", source: "campus", paint: { "fill-color": "#2774AE", "fill-opacity": 0.08 } });
          map.addLayer({ id: "campus-line", type: "line", source: "campus", paint: { "line-color": "#2774AE", "line-width": 2.5 } });
          map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": "#E8590C", "line-width": 1.5, "line-dasharray": [2, 2] } });
          map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#8BB8E8", "fill-opacity": 0.18 } });
          map.addLayer({ id: "accuracy-line", type: "line", source: "accuracy", paint: { "line-color": "#2774AE", "line-width": 1.5, "line-dasharray": [3, 2] } });
          map.addLayer({ id: "dot-views", type: "line", source: "dot-views", paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.8 } });
          map.addLayer({ id: "view-line", type: "line", source: "view", paint: { "line-color": "#0b1f33", "line-width": 3 } });
          map.addLayer({
            id: "ghost",
            type: "circle",
            source: "ghost",
            paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#0b1f33", "circle-stroke-width": 2, "circle-opacity": 0.7 },
          });
          map.addLayer({
            id: "dots",
            type: "circle",
            source: "dots",
            paint: { "circle-radius": 5, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 },
          });
          map.on("click", "dots", (ev) => {
            const id = ev.features?.[0]?.properties?.id;
            if (typeof id === "string") live.current.onDotClick?.(id);
          });
          map.on("mouseenter", "dots", () => (map!.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "dots", () => (map!.getCanvas().style.cursor = ""));
          // With no pin yet, a click on the map places it.
          map.on("click", (ev) => {
            const p = live.current;
            if (p.pin || !p.onPlace) return;
            if (map!.queryRenderedFeatures(ev.point, { layers: ["dots"] }).length) return;
            p.onPlace(ev.lngLat.lat, ev.lngLat.lng);
          });
          setReady(true);
        });
      })
      .catch((err: unknown) => setMapError(err instanceof Error ? err.message : "The map failed to load."));
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  // Outline, ring, dots and the accuracy circle.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("campus") as GeoJSONSource).setData(campus);
    (map.getSource("ring") as GeoJSONSource).setData(ring ?? EMPTY);
    (map.getSource("accuracy") as GeoJSONSource).setData(accuracy ? circle(accuracy.lng, accuracy.lat, accuracy.radiusM) : EMPTY);
    (map.getSource("ghost") as GeoJSONSource).setData(
      ghost ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [ghost.lng, ghost.lat] } } : EMPTY,
    );
    const list = dots ?? [];
    (map.getSource("dots") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: list.map((d) => ({ type: "Feature", geometry: { type: "Point", coordinates: [d.lng, d.lat] }, properties: { id: d.id, color: d.color } })),
    });
    (map.getSource("dot-views") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: list
        .filter((d) => typeof d.heading === "number")
        .map((d) => ({ ...viewLine(d.lng, d.lat, d.heading as number, 18), properties: { color: d.color } })),
    });
  }, [ready, campus, ring, accuracy, ghost, dots]);

  // The draggable pin and its view line. Rebuilt when the pin or the photo changes.
  const pinLat = pin?.lat ?? null;
  const pinLng = pin?.lng ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    if (!ready || !map || !MarkerClass) return;
    markerRef.current?.remove();
    markerRef.current = null;
    const view = map.getSource("view") as GeoJSONSource;
    view.setData(EMPTY);
    if (pinLat === null || pinLng === null) return;

    const drawView = (lng: number, lat: number) => view.setData(heading === null ? EMPTY : viewLine(lng, lat, heading));
    drawView(pinLng, pinLat);
    const marker = new MarkerClass({ draggable: true, color: "#FFD100" }).setLngLat([pinLng, pinLat]).addTo(map);
    marker.on("drag", () => {
      const p = marker.getLngLat();
      drawView(p.lng, p.lat);
    });
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      live.current.onPinMove(p.lat, p.lng);
    });
    markerRef.current = marker;
  }, [ready, pinLat, pinLng, heading]);

  // A newly picked photo: bring its pin into view.
  useEffect(() => {
    const map = mapRef.current;
    const p = live.current.pin;
    if (!ready || !map || !p) return;
    if (!map.getBounds().contains([p.lng, p.lat]) || map.getZoom() < 16.5) {
      map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 17.5), duration: 500 });
    }
  }, [ready, focusKey]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      {mapError && <p className="absolute left-3 top-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800 shadow">Map problem: {mapError}</p>}
    </div>
  );
}
