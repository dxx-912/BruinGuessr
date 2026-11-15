"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haversineMeters } from "@/lib/geo/distance";
import { loadMapLibre, MAP_STYLE_URL } from "@/lib/map/maplibre";
import type { CatalogEntry, Source, Status } from "@/lib/pipeline/types";

type Plan = { add: number; move: number; hide: number; restore: number };
type Payload = { entries: CatalogEntry[]; campus: Feature; ring: Feature; bufferM: number; plan: Plan };
type Filters = { source: Source | "all"; status: Status | "all"; zone: "all" | "inside" | "buffer" | "problem" };

const COLOR: Record<Status, string> = { approved: "#087f5b", pending: "#f59f00", rejected: "#D7263D" };
const SOURCE_LABEL: Record<Source, string> = { original: "My photos", mapillary: "Mapillary", wikimedia: "Wikimedia" };
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const imageUrl = (key: string, size: "thumb" | "full") => `/api/dev/photos/image?key=${encodeURIComponent(key)}&size=${size}`;
const hasPin = (e: CatalogEntry): e is CatalogEntry & { lat: number; lng: number } => e.lat !== null && e.lng !== null;
const isProblem = (e: CatalogEntry) => !hasPin(e) || e.zone === "outside";

/** A point `meters` from a start along a compass heading. Good enough for drawing a short arrow. */
function ahead(lng: number, lat: number, heading: number, meters: number): [number, number] {
  const r = (heading * Math.PI) / 180;
  return [lng + (meters * Math.sin(r)) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (meters * Math.cos(r)) / 111_320];
}

async function fetchPhotos(): Promise<Payload> {
  const res = await fetch("/api/dev/photos");
  if (!res.ok) throw new Error(`The review API answered ${res.status}`);
  return (await res.json()) as Payload;
}

export default function PhotoReview() {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ source: "all", status: "all", zone: "all" });
  const [pickedKey, setSelectedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<"idle" | "confirm" | "running">("idle");

  useEffect(() => {
    let cancelled = false;
    fetchPhotos()
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        // Start on whatever is waiting for a decision; your own photos first.
        const pending = payload.entries.filter((e) => e.status === "pending");
        const mine = pending.some((e) => e.source === "original");
        setFilters({ source: mine ? "original" : "all", status: pending.length ? "pending" : "all", zone: "all" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load photos");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.entries.filter(
      (e) =>
        (filters.source === "all" || e.source === filters.source) &&
        (filters.status === "all" || e.status === filters.status) &&
        (filters.zone === "all" || (filters.zone === "problem" ? isProblem(e) : e.zone === filters.zone)),
    );
  }, [data, filters]);

  // The selection always points at something on screen: if the picked photo is
  // filtered out (or nothing was picked yet), fall back to the first visible one.
  const selectedKey = useMemo(
    () => (visible.some((e) => e.key === pickedKey) ? pickedKey : (visible[0]?.key ?? null)),
    [visible, pickedKey],
  );
  const selected = useMemo(() => data?.entries.find((e) => e.key === selectedKey) ?? null, [data, selectedKey]);

  /** Saves a change for one photo and swaps the fresh copy into the list. */
  const patch = useCallback(async (key: string, body: Record<string, unknown>) => {
    setNotice(null);
    const res = await fetch("/api/dev/photos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as { entry?: CatalogEntry; plan?: Plan; error?: string };
    if (!res.ok || !json.entry) {
      setNotice(`Not saved: ${json.error ?? `the API answered ${res.status}`}`);
      return;
    }
    const entry = json.entry;
    setData((d) => (d ? { ...d, plan: json.plan ?? d.plan, entries: d.entries.map((e) => (e.key === key ? entry : e)) } : d));
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (!visible.length) return;
      const i = Math.max(0, visible.findIndex((e) => e.key === selectedKey));
      setSelectedKey(visible[Math.min(visible.length - 1, Math.max(0, i + delta))].key);
    },
    [visible, selectedKey],
  );

  /** Sets a status, then moves on to the next photo so a whole batch can be keyed through. */
  const decide = useCallback(
    (status: Status) => {
      if (!selected) return;
      if (status === "approved" && isProblem(selected)) {
        setNotice("Place the pin inside campus (or its buffer) before approving.");
        return;
      }
      const i = visible.findIndex((e) => e.key === selected.key);
      const next = visible[i + 1] ?? visible[i - 1];
      void patch(selected.key, { status });
      if (filters.status !== "all" && next) setSelectedKey(next.key);
      else step(1);
    },
    [selected, visible, filters.status, patch, step],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "ArrowRight" || ev.key === "j") step(1);
      else if (ev.key === "ArrowLeft" || ev.key === "k") step(-1);
      else if (ev.key === "a") decide("approved");
      else if (ev.key === "r") decide("rejected");
      else if (ev.key === "p") decide("pending");
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, decide]);

  // ---- Map ---------------------------------------------------------------------------------
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const markerClass = useRef<typeof Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Map event handlers are registered once, so they read the latest state through refs.
  const live = useRef({ selected, patch });
  useEffect(() => {
    live.current = { selected, patch };
  }, [selected, patch]);

  const hasData = data !== null;
  useEffect(() => {
    if (!hasData || !container.current) return;
    let cancelled = false;
    let map: MapLibreMap | undefined;
    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        markerClass.current = maplibre.Marker;
        map = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          bounds: [-118.4556, 34.0635, -118.4372, 34.0783],
          fitBoundsOptions: { padding: 30 },
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
        map.on("error", (ev) => setMapError(ev.error?.message ?? "The map failed to load."));
        map.on("load", () => {
          if (!map) return;
          for (const id of ["campus", "ring", "dots", "view", "ghost"]) map.addSource(id, { type: "geojson", data: EMPTY });
          map.addLayer({ id: "campus-fill", type: "fill", source: "campus", paint: { "fill-color": "#2774AE", "fill-opacity": 0.08 } });
          map.addLayer({ id: "campus-line", type: "line", source: "campus", paint: { "line-color": "#2774AE", "line-width": 2.5 } });
          map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": "#E8590C", "line-width": 1.5, "line-dasharray": [2, 2] } });
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
            paint: {
              "circle-radius": 5,
              "circle-color": ["match", ["get", "status"], "approved", COLOR.approved, "rejected", COLOR.rejected, COLOR.pending],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });
          map.on("click", "dots", (ev) => {
            const key = ev.features?.[0]?.properties?.key;
            if (typeof key === "string") setSelectedKey(key);
          });
          map.on("mouseenter", "dots", () => (map!.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "dots", () => (map!.getCanvas().style.cursor = ""));
          // A photo with no location yet is placed by clicking the map.
          map.on("click", (ev) => {
            const { selected: sel, patch: save } = live.current;
            if (!sel || hasPin(sel)) return;
            if (map!.queryRenderedFeatures(ev.point, { layers: ["dots"] }).length) return;
            void save(sel.key, { lat: ev.lngLat.lat, lng: ev.lngLat.lng });
          });
          setMapReady(true);
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
  }, [hasData]);

  // Boundary and the dots for the current filter.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !data) return;
    (map.getSource("campus") as GeoJSONSource).setData(data.campus);
    (map.getSource("ring") as GeoJSONSource).setData(data.ring);
    (map.getSource("dots") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: visible.filter(hasPin).filter((e) => e.key !== selectedKey).map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: { key: e.key, status: e.status },
      })),
    });
  }, [mapReady, data, visible, selectedKey]);

  // The draggable pin, the view-direction line and the "GPS said here" ghost for the selected photo.
  const pinLat = selected?.lat ?? null;
  const pinLng = selected?.lng ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    if (!mapReady || !map || !MarkerClass) return;
    markerRef.current?.remove();
    markerRef.current = null;
    const view = map.getSource("view") as GeoJSONSource;
    const ghost = map.getSource("ghost") as GeoJSONSource;
    view.setData(EMPTY);
    ghost.setData(EMPTY);
    const sel = live.current.selected;
    if (!sel || pinLat === null || pinLng === null) return;

    const drawView = (lng: number, lat: number) =>
      view.setData(
        sel.heading === null
          ? EMPTY
          : { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lng, lat], ahead(lng, lat, sel.heading, 35)] } },
      );
    drawView(pinLng, pinLat);
    if (sel.moved && sel.origin) {
      ghost.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [sel.origin.lng, sel.origin.lat] } });
    }

    const marker = new MarkerClass({ draggable: true, color: "#FFD100" }).setLngLat([pinLng, pinLat]).addTo(map);
    marker.on("drag", () => {
      const p = marker.getLngLat();
      drawView(p.lng, p.lat);
    });
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      void live.current.patch(sel.key, { lat: p.lat, lng: p.lng });
    });
    markerRef.current = marker;
    if (!map.getBounds().contains([pinLng, pinLat]) || map.getZoom() < 16.5) {
      map.easeTo({ center: [pinLng, pinLat], zoom: Math.max(map.getZoom(), 17.5), duration: 500 });
    }
  }, [mapReady, selectedKey, pinLat, pinLng, selected?.moved]);

  // ---- Publish -----------------------------------------------------------------------------
  const runPublish = async () => {
    setPublishing("running");
    setNotice(null);
    try {
      const res = await fetch("/api/dev/photos/publish", { method: "POST" });
      const json = (await res.json()) as { added?: number; moved?: number; hidden?: number; restored?: number; errors?: string[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `the API answered ${res.status}`);
      setNotice(
        `Published: ${json.added} added, ${json.moved} pins moved, ${json.hidden} withdrawn, ${json.restored} restored.` +
          (json.errors?.length ? ` ${json.errors.length} problem(s): ${json.errors[0]}` : ""),
      );
      setData(await fetchPhotos());
    } catch (err) {
      setNotice(`Publish failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setPublishing("idle");
    }
  };

  if (loadError) return <p className="p-6 text-sm text-red-700">Could not load the photo catalog: {loadError}</p>;
  if (!data) return <p className="p-6 text-sm">Loading photos…</p>;

  const count = (fn: (e: CatalogEntry) => boolean) => data.entries.filter(fn).length;
  const planTotal = data.plan.add + data.plan.move + data.plan.hide + data.plan.restore;
  const movedM = selected && selected.moved && selected.origin && hasPin(selected) ? haversineMeters(selected.origin, selected) : null;

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900 lg:flex-row">
      {/* ---- Left: filters and thumbnails ---- */}
      <aside className="flex max-h-[45dvh] w-full shrink-0 flex-col border-b border-slate-200 lg:max-h-none lg:w-[380px] lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2774AE]">BruinGuessr · dev only</p>
          <h1 className="mt-1 text-xl font-black">Photo review</h1>
          <p className="mt-1 text-xs text-slate-600">
            {count((e) => e.status === "approved")} approved · {count((e) => e.status === "pending")} waiting ·{" "}
            {count((e) => e.status === "rejected")} rejected · {count((e) => !!e.published && !e.published.hidden)} live in the game
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Select label="Source" value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v as Filters["source"] }))}
              options={[["all", "All"], ["original", "My photos"], ["mapillary", "Mapillary"], ["wikimedia", "Wikimedia"]]} />
            <Select label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v as Filters["status"] }))}
              options={[["all", "All"], ["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]]} />
            <Select label="Where" value={filters.zone} onChange={(v) => setFilters((f) => ({ ...f, zone: v as Filters["zone"] }))}
              options={[["all", "Anywhere"], ["inside", "On campus"], ["buffer", "Buffer ring"], ["problem", "Needs a pin"]]} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {visible.length === 0 ? (
            <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600">
              {data.entries.length === 0
                ? "No photos yet. Run the import scripts (see PROGRESS.md), then reload."
                : "No photos match these filters."}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {visible.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(e.key)}
                    className={`relative block aspect-[4/3] w-full overflow-hidden rounded-md border-[3px] bg-slate-200 ${e.key === selectedKey ? "ring-2 ring-[#0b1f33] ring-offset-1" : ""}`}
                    style={{ borderColor: COLOR[e.status] }}
                    aria-label={`${SOURCE_LABEL[e.source]} photo, ${e.status}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local dev files, not worth optimizing */}
                    <img src={imageUrl(e.key, "thumb")} alt="" loading="lazy" className="size-full object-cover" />
                    {isProblem(e) && <Badge className="left-1 top-1 bg-[#D7263D] text-white">{hasPin(e) ? "off campus" : "no pin"}</Badge>}
                    {e.moved && <Badge className="bottom-1 left-1 bg-[#0b1f33] text-white">moved</Badge>}
                    {e.published && !e.published.hidden && <Badge className="right-1 top-1 bg-white text-[#087f5b]">live</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-200 p-3 text-xs">
          <p className="text-slate-600">
            {planTotal === 0
              ? "The game matches what is approved here."
              : `Not yet in the game: ${data.plan.add} to add, ${data.plan.move} moved pins, ${data.plan.hide} to withdraw${data.plan.restore ? `, ${data.plan.restore} to restore` : ""}.`}
          </p>
          <div className="mt-2 flex gap-2">
            {publishing === "confirm" ? (
              <>
                <button type="button" onClick={runPublish} className="rounded-md bg-[#087f5b] px-3 py-1.5 font-semibold text-white">
                  Yes, publish {planTotal} change{planTotal === 1 ? "" : "s"}
                </button>
                <button type="button" onClick={() => setPublishing("idle")} className="rounded-md border border-slate-300 px-3 py-1.5">
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={planTotal === 0 || publishing === "running"}
                onClick={() => setPublishing("confirm")}
                className="rounded-md bg-[#2774AE] px-3 py-1.5 font-semibold text-white disabled:opacity-40"
              >
                {publishing === "running" ? "Publishing…" : "Publish to the game"}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ---- Right: map on top, selected photo below ---- */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-[220px] flex-1">
          <div className="absolute inset-0">
            <div ref={container} className="h-full w-full" />
          </div>
          {mapError && <p className="absolute left-3 top-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800 shadow">Map problem: {mapError}</p>}
          {selected && (
            <p className="absolute left-3 top-3 max-w-[70%] rounded bg-white/95 px-3 py-1.5 text-xs shadow">
              {hasPin(selected)
                ? "Drag the gold pin to where the camera stood. The line shows which way it faced."
                : "This photo has no location. Click the map where the camera stood."}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 lg:h-[46%]">
          {notice && <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{notice}</p>}
          {selected ? (
            <div className="flex h-full flex-col gap-3 p-3 sm:flex-row">
              <a href={imageUrl(selected.key, "full")} target="_blank" rel="noreferrer" className="block min-h-0 flex-1 overflow-hidden rounded-md bg-slate-900" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element -- local dev files */}
                <img src={imageUrl(selected.key, "full")} alt="Selected photo" className="size-full max-h-[40dvh] object-contain lg:max-h-none" />
              </a>
              <div className="w-full shrink-0 overflow-y-auto text-sm sm:w-[300px]">
                <p className="font-semibold">
                  {SOURCE_LABEL[selected.source]}{" "}
                  <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: COLOR[selected.status] }}>
                    {selected.status === "pending" ? "waiting" : selected.status}
                  </span>
                </p>
                <dl className="mt-2 space-y-1 text-xs text-slate-600">
                  <Row k="Credit" v={`${selected.photographer} · ${selected.license}`} />
                  {selected.capturedAt && <Row k="Taken" v={new Date(selected.capturedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} />}
                  <Row
                    k="Location"
                    v={
                      hasPin(selected)
                        ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)} · ${selected.zone === "inside" ? "on campus" : selected.zone === "buffer" ? "buffer ring" : "OUTSIDE campus"}`
                        : "not set"
                    }
                  />
                  {movedM !== null && <Row k="Moved" v={`${Math.round(movedM)} m from where GPS put it (white dot)`} />}
                  {selected.reason && <Row k="Reason" v={selected.reason} />}
                  {selected.notes.map((n) => <Row key={n} k="Note" v={n} />)}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Action onClick={() => decide("approved")} color={COLOR.approved} hint="A">Approve</Action>
                  <Action onClick={() => decide("rejected")} color={COLOR.rejected} hint="R">Reject</Action>
                  <Action onClick={() => decide("pending")} color="#64748b" hint="P">Later</Action>
                </div>
                {selected.moved && (
                  <button type="button" onClick={() => void patch(selected.key, { resetLocation: true })} className="mt-2 text-xs font-semibold text-[#2774AE] underline">
                    Put the pin back where GPS had it
                  </button>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Keys: ← → to move through photos, A approve, R reject, P later.
                  {selected.published && selected.needsSync ? " This photo is live; publish to send the change." : ""}
                </p>
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-600">Pick a photo on the left or a dot on the map.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1">
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`absolute rounded px-1 text-[10px] font-bold leading-4 ${className}`}>{children}</span>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-slate-400">{k}</dt>
      <dd className="min-w-0 break-words text-slate-700">{v}</dd>
    </div>
  );
}

function Action({ onClick, color, hint, children }: { onClick: () => void; color: string; hint: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ background: color }}>
      {children} <kbd className="ml-1 rounded bg-white/25 px-1 text-xs">{hint}</kbd>
    </button>
  );
}
