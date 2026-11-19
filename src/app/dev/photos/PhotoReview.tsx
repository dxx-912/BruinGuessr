"use client";

import type { Feature } from "geojson";
import { useCallback, useEffect, useMemo, useState } from "react";
import PinEditor, { type MapDot } from "@/components/map/PinEditor";
import { haversineMeters } from "@/lib/geo/distance";
import type { CatalogEntry, Source, Status } from "@/lib/pipeline/types";

type Plan = { add: number; move: number; hide: number; restore: number };
type Payload = { entries: CatalogEntry[]; campus: Feature; ring: Feature; bufferM: number; plan: Plan };
type Filters = { source: Source | "all"; status: Status | "all"; zone: "all" | "inside" | "buffer" | "problem" };

const COLOR: Record<Status, string> = { approved: "#087f5b", pending: "#f59f00", rejected: "#D7263D" };
const SOURCE_LABEL: Record<Source, string> = { original: "My photos", mapillary: "Mapillary", wikimedia: "Wikimedia" };

const imageUrl = (key: string, size: "thumb" | "full") => `/api/dev/photos/image?key=${encodeURIComponent(key)}&size=${size}`;
const hasPin = (e: CatalogEntry): e is CatalogEntry & { lat: number; lng: number } => e.lat !== null && e.lng !== null;
const isProblem = (e: CatalogEntry) => !hasPin(e) || e.zone === "outside";

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
  const dots = useMemo<MapDot[]>(
    () =>
      visible
        .filter(hasPin)
        .filter((e) => e.key !== selectedKey)
        .map((e) => ({ id: e.key, lat: e.lat, lng: e.lng, color: COLOR[e.status] })),
    [visible, selectedKey],
  );
  const pin = useMemo(
    () => (selected && hasPin(selected) ? { lat: selected.lat, lng: selected.lng } : null),
    [selected],
  );
  const ghost = useMemo(() => (selected?.moved && selected.origin ? selected.origin : null), [selected]);

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
          {data && (
            <PinEditor
              className="!absolute inset-0"
              campus={data.campus}
              ring={data.ring}
              pin={pin}
              heading={selected?.heading ?? null}
              ghost={ghost}
              dots={dots}
              focusKey={selectedKey}
              onDotClick={setSelectedKey}
              onPinMove={(lat, lng) => selected && void patch(selected.key, { lat, lng })}
              onPlace={(lat, lng) => selected && void patch(selected.key, { lat, lng })}
            />
          )}
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
