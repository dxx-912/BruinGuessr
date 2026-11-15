"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  area as turfArea,
  bbox as turfBbox,
  bboxPolygon,
  booleanPointInPolygon,
  buffer,
  featureCollection,
  point,
} from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boundaryMetrics, composeBoundary, type AreaCollection, type AreaFeature } from "@/lib/geo/boundary";
import { bboxSizeMeters } from "@/lib/geo/distance";
import { PERFECT_RADIUS_M, scoreForDistance } from "@/lib/geo/scoring";
import { loadMapLibre, MAP_STYLE_URL } from "@/lib/map/maplibre";

export type PhotoDot = {
  lng: number;
  lat: number;
  src: "m" | "w";
  pano?: boolean;
  foot?: boolean;
  quality?: number;
  year?: number;
};

type Props = {
  areas: AreaCollection;
  selection: { approved: boolean; include: string[] };
  dots: PhotoDot[] | null;
};

type Zone = "in" | "buffer" | "out";
type Shape = Feature<Polygon | MultiPolygon>;

const BLUE = "#2774AE";
const GOLD = "#FFD100";
const RED = "#D7263D";
const SAMPLE_MISSES_M = [10, 25, 50, 100, 200, 400, 800];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const inside = (d: PhotoDot, shape: Shape) => booleanPointInPolygon([d.lng, d.lat], shape);

export default function BoundaryReview({ areas, selection, dots }: Props) {
  const optional = useMemo(() => areas.features.filter((f) => f.properties.kind !== "main"), [areas]);
  const mainArea = useMemo(() => areas.features.find((f) => f.properties.kind === "main")!, [areas]);

  const [include, setInclude] = useState<string[]>(selection.include);
  const [bufferM, setBufferM] = useState(40);
  const [showMapillary, setShowMapillary] = useState(true);
  const [showCommons, setShowCommons] = useState(true);
  const [showOutside, setShowOutside] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggle = useCallback(
    (id: string) => setInclude((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    [],
  );

  // ---- Everything below is derived from the current selection ----------------------------
  const boundary = useMemo(() => composeBoundary(areas, include), [areas, include]);
  const { bbox, diagonalM } = useMemo(() => boundaryMetrics(boundary), [boundary]);
  const size = bboxSizeMeters(bbox);
  const ring = useMemo<Shape | null>(
    () => (bufferM > 0 ? ((buffer(boundary, bufferM, { units: "meters" }) as Shape | undefined) ?? null) : null),
    [boundary, bufferM],
  );

  /** Which candidate area each photo sits in. Does not depend on the selection. */
  const dotArea = useMemo(() => {
    if (!dots) return [];
    return dots.map((d) => {
      const hit = optional.find((a) => inside(d, a));
      if (hit) return hit.properties.id;
      return inside(d, mainArea) ? "main" : null;
    });
  }, [dots, optional, mainArea]);

  const dotZone = useMemo<Zone[]>(() => {
    if (!dots) return [];
    return dots.map((d) => (inside(d, boundary) ? "in" : ring && inside(d, ring) ? "buffer" : "out"));
  }, [dots, boundary, ring]);

  const counts = useMemo(() => {
    const perArea: Record<string, { m: number; foot: number; w: number }> = {};
    const zone = { in: { m: 0, foot: 0, w: 0 }, buffer: { m: 0, foot: 0, w: 0 }, out: { m: 0, foot: 0, w: 0 } };
    (dots ?? []).forEach((d, i) => {
      const z = zone[dotZone[i]];
      if (d.src === "m") {
        z.m++;
        if (d.foot) z.foot++;
      } else z.w++;
      const id = dotArea[i];
      if (!id) return;
      const a = (perArea[id] ??= { m: 0, foot: 0, w: 0 });
      if (d.src === "m") {
        a.m++;
        if (d.foot) a.foot++;
      } else a.w++;
    });
    return { perArea, zone };
  }, [dots, dotArea, dotZone]);

  // ---- GeoJSON handed to the map -----------------------------------------------------------
  const layers = useMemo(() => {
    const areaFc = featureCollection(
      optional.map((a) => ({ ...a, properties: { ...a.properties, included: include.includes(a.properties.id) } })),
    );
    const dotFc = featureCollection(
      (dots ?? []).flatMap((d, i) => {
        const zone = dotZone[i];
        if (d.src === "m" && !showMapillary) return [];
        if (d.src === "w" && !showCommons) return [];
        if (zone === "out" && !showOutside) return [];
        return [point([d.lng, d.lat], { src: d.src, zone, foot: d.foot ? 1 : 0 })];
      }),
    );
    return {
      boundary: boundary as Feature,
      areas: areaFc as FeatureCollection,
      bbox: bboxPolygon(bbox) as Feature,
      ring: (ring ?? EMPTY) as Feature | FeatureCollection,
      dots: dotFc as FeatureCollection,
    };
  }, [boundary, optional, include, bbox, ring, dots, dotZone, showMapillary, showCommons, showOutside]);

  // ---- Map -------------------------------------------------------------------------------
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layersRef = useRef(layers);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;

    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        const [w, s, e, n] = turfBbox(areas);
        map = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          bounds: [w, s, e, n],
          fitBoundsOptions: { padding: 48 },
          attributionControl: { compact: false },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
        map.on("error", (ev) => setMapError(ev.error?.message ?? "The map failed to load."));

        map.on("load", () => {
          if (!map) return;
          const data = layersRef.current;
          map.addSource("boundary", { type: "geojson", data: data.boundary });
          map.addSource("areas", { type: "geojson", data: data.areas });
          map.addSource("bbox", { type: "geojson", data: data.bbox });
          map.addSource("ring", { type: "geojson", data: data.ring });
          map.addSource("dots", { type: "geojson", data: data.dots });

          map.addLayer({ id: "boundary-fill", type: "fill", source: "boundary", paint: { "fill-color": BLUE, "fill-opacity": 0.16 } });
          map.addLayer({
            id: "areas-fill",
            type: "fill",
            source: "areas",
            paint: {
              "fill-color": ["case", ["get", "included"], GOLD, RED],
              "fill-opacity": ["case", ["get", "included"], 0.22, 0.3],
            },
          });
          map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": "#E8590C", "line-width": 1.5, "line-dasharray": [2, 2] } });
          map.addLayer({ id: "bbox-line", type: "line", source: "bbox", paint: { "line-color": "#111827", "line-width": 1.5, "line-dasharray": [4, 3] } });
          map.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": BLUE, "line-width": 3 } });
          map.addLayer({
            id: "areas-line",
            type: "line",
            source: "areas",
            paint: { "line-color": ["case", ["get", "included"], "#8a6d00", RED], "line-width": 2, "line-dasharray": [3, 2] },
          });
          map.addLayer({
            id: "dots",
            type: "circle",
            source: "dots",
            paint: {
              "circle-radius": ["case", ["==", ["get", "src"], "w"], 4.5, 3.5],
              "circle-color": [
                "case",
                ["==", ["get", "zone"], "out"], "#6b7280",
                ["==", ["get", "src"], "w"], "#9c36b5",
                ["==", ["get", "zone"], "buffer"], "#E8590C",
                "#087f5b",
              ],
              "circle-opacity": ["case", ["==", ["get", "zone"], "out"], 0.35, ["==", ["get", "foot"], 1], 0.95, ["==", ["get", "src"], "w"], 0.95, 0.55],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": ["case", ["==", ["get", "zone"], "out"], 0, 1],
            },
          });
          map.addLayer({
            id: "areas-label",
            type: "symbol",
            source: "areas",
            layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-max-width": 9 },
            paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 2 },
          });

          map.on("click", "areas-fill", (ev) => {
            const id = ev.features?.[0]?.properties?.id;
            if (typeof id === "string") toggle(id);
          });
          map.on("mouseenter", "areas-fill", () => (map!.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "areas-fill", () => (map!.getCanvas().style.cursor = ""));
          setMapReady(true);
        });
      })
      .catch((err: unknown) => setMapError(err instanceof Error ? err.message : "The map failed to load."));

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [areas, toggle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    for (const key of ["boundary", "areas", "bbox", "ring", "dots"] as const) {
      (map.getSource(key) as GeoJSONSource | undefined)?.setData(layers[key]);
    }
  }, [layers, mapReady]);

  // ---- Text the reviewer can paste back ------------------------------------------------------
  const decision = [
    `Include: ${optional.filter((a) => include.includes(a.properties.id)).map((a) => a.properties.name).join(", ") || "none of the flagged areas"}.`,
    `Exclude: ${optional.filter((a) => !include.includes(a.properties.id)).map((a) => a.properties.name).join(", ") || "none"}.`,
    `D = ${fmt(diagonalM)} m. Buffer ${bufferM} m.`,
  ].join(" ");
  const matchesSaved =
    include.length === selection.include.length && include.every((id) => selection.include.includes(id));

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900 md:flex-row">
      <aside className="order-2 max-h-[55dvh] w-full shrink-0 overflow-y-auto border-t border-slate-200 p-4 md:order-1 md:max-h-none md:w-[400px] md:border-r md:border-t-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#2774AE]">BruinGuessr · Phase 0</p>
        <h1 className="mt-1 text-2xl font-black">Campus boundary review</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tick the flagged areas you want inside the game. The blue shape is the boundary; the dashed black box is
          its bounding box, whose diagonal is the scoring constant D.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="D (diagonal)" value={`${fmt(diagonalM)} m`} strong />
          <Stat label="Box" value={`${fmt(size.width)} × ${fmt(size.height)} m`} />
          <Stat label="Area" value={`${(turfArea(boundary) / 10_000).toFixed(0)} ha`} />
        </dl>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Flagged areas</h2>
        <ul className="mt-2 space-y-2">
          {optional.map((a) => (
            <AreaRow
              key={a.properties.id}
              area={a}
              checked={include.includes(a.properties.id)}
              onToggle={() => toggle(a.properties.id)}
              photos={dots ? (counts.perArea[a.properties.id] ?? { m: 0, foot: 0, w: 0 }) : null}
            />
          ))}
        </ul>
        {dots && (
          <p className="mt-2 text-xs text-slate-500">
            Rest of main campus and the Hill: {counts.perArea.main?.m ?? 0} Mapillary ({counts.perArea.main?.foot ?? 0}{" "}
            on foot), {counts.perArea.main?.w ?? 0} Wikimedia.
          </p>
        )}

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">What a miss scores</h2>
        <table className="mt-2 w-full text-sm tabular-nums">
          <tbody>
            {SAMPLE_MISSES_M.map((d) => (
              <tr key={d} className="border-b border-slate-100">
                <td className="py-1 text-slate-600">
                  {d} m off{d <= PERFECT_RADIUS_M ? " (bullseye)" : ""}
                </td>
                <td className="py-1 text-right font-semibold">{fmt(scoreForDistance(d, diagonalM))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Open photos</h2>
        {dots ? (
          <>
            <label className="mt-2 block text-sm">
              <span className="flex justify-between">
                <span>Eligibility buffer outside the boundary</span>
                <span className="font-semibold tabular-nums">{bufferM} m</span>
              </span>
              <input
                type="range"
                min={0}
                max={80}
                step={10}
                value={bufferM}
                onChange={(e) => setBufferM(Number(e.target.value))}
                className="mt-1 w-full accent-[#2774AE]"
              />
            </label>
            <table className="mt-2 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-medium">Before any filtering</th>
                  <th className="py-1 text-right font-medium">Mapillary</th>
                  <th className="py-1 text-right font-medium">on foot</th>
                  <th className="py-1 text-right font-medium">Wikimedia</th>
                </tr>
              </thead>
              <tbody>
                <ZoneRow swatch="#087f5b" label="Inside boundary" c={counts.zone.in} />
                <ZoneRow swatch="#E8590C" label={`Buffer ring (0 to ${bufferM} m)`} c={counts.zone.buffer} />
                <ZoneRow swatch="#6b7280" label="Farther out" c={counts.zone.out} />
              </tbody>
            </table>
            <div className="mt-3 space-y-1 text-sm">
              <Check checked={showMapillary} onChange={setShowMapillary} label="Show Mapillary photos (faint = from a vehicle)" />
              <Check checked={showCommons} onChange={setShowCommons} label="Show Wikimedia Commons photos (purple)" />
              <Check checked={showOutside} onChange={setShowOutside} label="Show photos beyond the buffer (grey)" />
            </div>
          </>
        ) : (
          <p className="mt-2 rounded-md bg-slate-100 p-3 text-sm text-slate-600">
            No photo data yet. Run <code className="font-mono">npm run campus:probe</code> and reload to see where
            open photos exist.
          </p>
        )}

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Your decision</h2>
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">{decision}</p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(decision).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
            className="rounded-md bg-[#2774AE] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1f5f90]"
          >
            {copied ? "Copied" : "Copy decision"}
          </button>
          <span className="text-xs text-slate-500">
            {matchesSaved
              ? selection.approved
                ? "Matches the approved boundary."
                : "Matches my recommendation (not yet approved)."
              : "Differs from the saved boundary. Paste this to Claude to apply it."}
          </span>
        </div>
      </aside>

      <div className="relative order-1 min-h-[45dvh] flex-1 md:order-2">
        <div ref={container} className="absolute inset-0" />
        {!mapReady && !mapError && (
          <p className="absolute left-3 top-3 rounded bg-white/90 px-2 py-1 text-sm shadow">Loading map…</p>
        )}
        {mapError && (
          <p className="absolute left-3 top-3 max-w-sm rounded bg-red-50 px-3 py-2 text-sm text-red-800 shadow">
            Map problem: {mapError}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md px-2 py-2 ${strong ? "bg-[#FFD100]" : "bg-slate-100"}`}>
      <dt className="text-[11px] text-slate-600">{label}</dt>
      <dd className="text-sm font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function AreaRow({
  area,
  checked,
  onToggle,
  photos,
}: {
  area: AreaFeature;
  checked: boolean;
  onToggle: () => void;
  photos: { m: number; foot: number; w: number } | null;
}) {
  const p = area.properties;
  return (
    <li className={`rounded-md border p-3 ${checked ? "border-[#c9a400] bg-[#fff9db]" : "border-red-200 bg-red-50"}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 size-4 accent-[#2774AE]" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{p.name}</span>
            <span className="text-xs text-slate-500">{p.area_ha} ha</span>
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-slate-700">
            I recommend: {p.recommend === "include" ? "keep in" : "leave out"}
          </span>
          <span className="mt-1 block text-xs text-slate-600">{p.note}</span>
          {photos && (
            <span className="mt-1 block text-xs tabular-nums text-slate-500">
              Open photos here: {photos.m} Mapillary ({photos.foot} on foot), {photos.w} Wikimedia
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

function ZoneRow({ swatch, label, c }: { swatch: string; label: string; c: { m: number; foot: number; w: number } }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1">
        <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: swatch }} />
        {label}
      </td>
      <td className="py-1 text-right font-semibold">{fmt(c.m)}</td>
      <td className="py-1 text-right">{fmt(c.foot)}</td>
      <td className="py-1 text-right font-semibold">{fmt(c.w)}</td>
    </tr>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[#2774AE]" />
      <span>{label}</span>
    </label>
  );
}
