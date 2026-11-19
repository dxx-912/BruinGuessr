"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PinEditor, { type MapDot } from "@/components/map/PinEditor";
import { compassPoint } from "@/lib/contribute/compass";
import { REJECT_REASONS, insideCampus } from "@/lib/contribute/rules";
import type { NearbyImage, QueueItem } from "@/lib/contribute/types";
import type { Box } from "@/lib/contribute/faces";
import { haversineMeters } from "@/lib/geo/distance";
import { CAMPUS_GEOJSON } from "@/lib/map/campus";

type Pin = { lat: number; lng: number };
/** Per submission, what the reviewer has done so far. Nothing is saved until Approve or Reject. */
type Draft = { pin: Pin; pinConfirmed: boolean; facesChecked: boolean; boxes: Box[]; reason: string };

const PROBLEM_TEXT: Record<string, string> = {
  not_found: "That submission is gone (another reviewer may have decided it).",
  already_decided: "Someone already decided this one.",
  bad_pin: "The pin is not a valid position.",
  outside_campus: "The pin is outside the campus boundary.",
  faces_unchecked: "Tick “Faces checked” first: this photo is flagged for people.",
  pin_unchecked: "Confirm or move the pin first: the GPS fix was rough.",
  bad_reason: "Give a reason (up to 300 characters).",
  server_error: "Something went wrong on the server. Try again.",
};

const fmtTime = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ReviewClient({ adminName }: { adminName: string }) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [near, setNear] = useState<NearbyImage[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/contributions", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { queue: QueueItem[] };
      setQueue(body.queue);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const selected = useMemo(() => queue?.find((q) => q.id === selectedId) ?? queue?.[0] ?? null, [queue, selectedId]);
  const draft: Draft | null = selected
    ? (drafts[selected.id] ?? { pin: { lat: selected.gpsLat, lng: selected.gpsLng }, pinConfirmed: false, facesChecked: false, boxes: [], reason: "" })
    : null;
  const update = (patch: Partial<Draft>) => {
    if (!selected || !draft) return;
    setDrafts((d) => ({ ...d, [selected.id]: { ...draft, ...patch } }));
  };

  // Photos already in the pool near the current pin and facing the same way.
  const pinKey = draft ? `${selected?.id}:${draft.pin.lat.toFixed(6)},${draft.pin.lng.toFixed(6)}` : null;
  useEffect(() => {
    if (!selected || !draft) return;
    let cancelled = false;
    const q = new URLSearchParams({ lat: String(draft.pin.lat), lng: String(draft.pin.lng), heading: selected.heading === null ? "" : String(selected.heading) });
    fetch(`/api/admin/contributions/${selected.id}/nearby?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { near: [] }))
      .then((b: { near: NearbyImage[] }) => !cancelled && setNear(b.near))
      .catch(() => !cancelled && setNear([]));
    return () => {
      cancelled = true;
    };
    // pinKey stands for the selected photo and its pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  const movedM = selected && draft ? haversineMeters({ lat: selected.gpsLat, lng: selected.gpsLng }, draft.pin) : 0;
  const pinOk = !selected?.flagPinCheck || draft?.pinConfirmed || movedM >= 0.5;
  const facesOk = !selected?.flagPeople || draft?.facesChecked;
  const pinInside = draft ? insideCampus(draft.pin.lat, draft.pin.lng) : false;

  const decided = (id: string, text: string) => {
    setNotice({ tone: "ok", text });
    const list = queue ?? [];
    const i = list.findIndex((x) => x.id === id);
    const next = list.filter((x) => x.id !== id);
    setQueue(next);
    setSelectedId(next[Math.min(i, next.length - 1)]?.id ?? null);
    setNear(null);
  };

  const approve = async () => {
    if (!selected || !draft || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/contributions/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: draft.pin.lat, lng: draft.pin.lng, pinConfirmed: draft.pinConfirmed, facesChecked: draft.facesChecked, blur: draft.boxes }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; problem?: string };
      if (body.ok) decided(selected.id, `Approved: ${selected.contributor ?? "the player"}'s photo is live.`);
      else setNotice({ tone: "bad", text: PROBLEM_TEXT[body.problem ?? ""] ?? `The server answered ${res.status}.` });
    } catch {
      setNotice({ tone: "bad", text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || !draft || busy) return;
    const reason = draft.reason.trim();
    if (!reason) {
      setNotice({ tone: "bad", text: PROBLEM_TEXT.bad_reason });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/contributions/${selected.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; problem?: string };
      if (body.ok) decided(selected.id, "Rejected. The file is deleted and the player sees your reason.");
      else setNotice({ tone: "bad", text: PROBLEM_TEXT[body.problem ?? ""] ?? `The server answered ${res.status}.` });
    } catch {
      setNotice({ tone: "bad", text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  };

  const dots: MapDot[] = useMemo(
    () => (near ?? []).map((n) => ({ id: n.id, lat: n.lat, lng: n.lng, color: "#B9472A", heading: n.heading })),
    [near],
  );
  const accuracy = useMemo(() => (selected ? { lat: selected.gpsLat, lng: selected.gpsLng, radiusM: selected.accuracyM } : null), [selected]);
  const ghost = useMemo(() => (selected && movedM >= 0.5 ? { lat: selected.gpsLat, lng: selected.gpsLng } : null), [selected, movedM]);
  const pin = draft?.pin ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-night text-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-navy-line bg-navy px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky">BruinGuessr · admin</p>
          <h1 className="heading text-2xl">
            Contributions <span className="numeric text-sky">{queue ? `· ${queue.length} waiting` : ""}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-sky">
          <span>Signed in as {adminName}</span>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            Refresh
          </button>
          <Link href="/" className="btn-quiet">
            Site
          </Link>
        </div>
      </header>

      {notice && (
        <p role="status" className={`px-4 py-2 text-sm font-semibold ${notice.tone === "ok" ? "bg-green text-paper" : "bg-alarm text-night"}`}>
          {notice.text}
        </p>
      )}

      {loadError && <p className="p-6 text-alarm">The queue could not load. Refresh to try again.</p>}
      {!loadError && !queue && <p className="p-6 text-sky">Loading the queue…</p>}
      {queue && queue.length === 0 && (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="heading text-3xl">Nothing waiting</p>
            <p className="mt-2 text-sky">New contributions show up here. People first, then pin checks, then oldest.</p>
          </div>
        </div>
      )}

      {queue && selected && draft && (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ---- The queue ---- */}
          <aside className="max-h-56 shrink-0 overflow-y-auto border-b-2 border-navy-line lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r-2">
            <ul className="space-y-1.5 p-2">
              {queue.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setNear(null);
                      setNotice(null);
                    }}
                    aria-current={item.id === selected.id ? "true" : undefined}
                    className={`flex w-full items-center gap-2 rounded-[12px] border p-2 text-left ${
                      item.id === selected.id ? "border-ucla-gold bg-ucla-blue/20" : "border-navy-line hover:border-sky"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, never cached */}
                    <img src={`/api/admin/contributions/${item.id}/photo`} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-[8px] bg-black object-cover" />
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-semibold">{item.contributor ?? "(no name)"}</span>
                      <span className="flex flex-wrap gap-1">
                        {item.flagPeople && <Flag tone="alarm">People</Flag>}
                        {item.flagPinCheck && <Flag tone="hurt">Pin check</Flag>}
                        {!item.flagPeople && !item.flagPinCheck && <span className="text-xs text-sky">{fmtTime(item.receivedAt)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* ---- The photo and the blur tool ---- */}
          <main className="min-w-0 flex-1 overflow-y-auto p-3">
            <BlurTool key={selected.id} id={selected.id} width={selected.width} height={selected.height} boxes={draft.boxes} onChange={(boxes) => update({ boxes })} />
            <p className="mt-2 text-sm text-sky">
              Drag on the photo to blur a face, a licence plate or anything private. The server applies the boxes when you approve.{" "}
              {draft.boxes.length > 0 && (
                <button type="button" className="font-semibold text-ucla-gold underline" onClick={() => update({ boxes: [] })}>
                  Clear {draft.boxes.length} box{draft.boxes.length === 1 ? "" : "es"}
                </button>
              )}
            </p>

            <h2 className="heading mt-5 text-xl">Photos already near here, facing the same way</h2>
            {near === null ? (
              <p className="mt-1 text-sm text-sky">Looking…</p>
            ) : near.length === 0 ? (
              <p className="mt-1 text-sm text-sky">None within 22 m facing within 40°.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {near.map((n) => (
                  <li key={n.id} className="row overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, never cached */}
                    <img src={`/api/admin/images/${n.id}/photo`} alt="" loading="lazy" className="aspect-[4/3] w-full bg-black object-cover" />
                    <p className="numeric px-2 py-1 text-xs text-sky">
                      {n.distanceM} m · {n.source}
                      {n.heading !== null ? ` · ${compassPoint(n.heading)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </main>

          {/* ---- Map, details and the decision ---- */}
          <section className="flex w-full shrink-0 flex-col border-t-2 border-navy-line lg:w-[420px] lg:border-l-2 lg:border-t-0">
            <PinEditor
              className="h-72 w-full lg:h-[46dvh]"
              campus={CAMPUS_GEOJSON}
              pin={pin}
              heading={selected.heading}
              accuracy={accuracy}
              ghost={ghost}
              dots={dots}
              focusKey={selected.id}
              onPinMove={(lat, lng) => update({ pin: { lat, lng } })}
            />
            <div className="space-y-3 overflow-y-auto p-4 text-sm">
              <p className="text-sky">
                Gold pin: where the photo goes. Blue circle: the phone&rsquo;s GPS accuracy. Brick dots: photos already in the game nearby. Drag the pin to
                where the camera stood.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <Detail k="By">{selected.contributor ?? "(no username)"}</Detail>
                <Detail k="Camera">
                  {selected.captureWidth} × {selected.captureHeight} (actual frame)
                </Detail>
                <Detail k="Stored">
                  {selected.width} × {selected.height} · sharpness {Math.round(selected.sharpness)}
                </Detail>
                <Detail k="GPS">
                  ±{Math.round(selected.accuracyM)} m{selected.flagPinCheck ? " (worse than 25 m)" : ""} · fix {Math.max(0, Math.round((selected.capturedAt - selected.positionAt) / 1000))} s before the
                  shot
                </Detail>
                <Detail k="Heading">{selected.heading === null ? "none" : `${compassPoint(selected.heading)} ${Math.round(selected.heading)}° (approximate, true north)`}</Detail>
                <Detail k="Taken">{fmtTime(selected.capturedAt)}</Detail>
                <Detail k="People">
                  {selected.peopleAnswer ? "the contributor said yes" : "the contributor said no"} · the browser blurred {selected.facesDetected} face
                  {selected.facesDetected === 1 ? "" : "s"}
                </Detail>
                {movedM >= 0.5 && <Detail k="Moved">{Math.round(movedM)} m from the GPS fix</Detail>}
              </dl>

              <div className="row space-y-2 p-3">
                {selected.flagPinCheck && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={pinOk ? "font-semibold text-leaf" : "font-semibold text-hurt"}>
                      {movedM >= 0.5 ? "Pin moved" : draft.pinConfirmed ? "Pin confirmed" : "Pin check needed"}
                    </span>
                    {movedM < 0.5 && (
                      <button type="button" className="btn-outline" onClick={() => update({ pinConfirmed: !draft.pinConfirmed })}>
                        {draft.pinConfirmed ? "Undo" : "Confirm pin"}
                      </button>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-5 w-5 accent-ucla-gold" checked={draft.facesChecked} onChange={(e) => update({ facesChecked: e.target.checked })} />
                  <span className={selected.flagPeople && !draft.facesChecked ? "font-semibold text-hurt" : "font-semibold"}>
                    Faces checked{selected.flagPeople ? " (required)" : ""}
                  </span>
                </label>
                {!pinInside && <p className="font-semibold text-alarm">The pin is outside the campus boundary.</p>}
                <button type="button" className="btn btn-gold w-full" disabled={busy || !pinOk || !facesOk || !pinInside} onClick={approve}>
                  {busy ? "Working…" : "Approve and publish"}
                </button>
              </div>

              <div className="row space-y-2 p-3">
                <label className="block font-semibold" htmlFor="reason">
                  Reject with a reason (the player sees it)
                </label>
                <select
                  id="reason-preset"
                  className="w-full rounded-[10px] border-2 border-navy-line bg-night px-2 py-2"
                  value=""
                  onChange={(e) => e.target.value && update({ reason: e.target.value })}
                >
                  <option value="">Pick a reason…</option>
                  {REJECT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  id="reason"
                  className="w-full rounded-[10px] border-2 border-navy-line bg-night px-3 py-2"
                  maxLength={300}
                  value={draft.reason}
                  onChange={(e) => update({ reason: e.target.value })}
                  placeholder="Or write one"
                />
                <button type="button" className="btn btn-red w-full" disabled={busy || !draft.reason.trim()} onClick={reject}>
                  Reject
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Flag({ tone, children }: { tone: "alarm" | "hurt"; children: React.ReactNode }) {
  return <span className={`rounded-full px-1.5 text-xs font-bold text-night ${tone === "alarm" ? "bg-alarm" : "bg-hurt"}`}>{children}</span>;
}

function Detail({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-sky">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/**
 * The photo with boxes drawn over it. Drag to add a box; click a box's × to
 * remove it. Boxes are stored as fractions of the photo, so they do not depend
 * on how large it is shown. The preview blurs them with CSS; the server
 * applies the real blur with sharp on approval.
 */
function BlurTool({ id, width, height, boxes, onChange }: { id: string; width: number; height: number; boxes: Box[]; onChange: (b: Box[]) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const at = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const live = drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : null;

  return (
    <div
      ref={frame}
      className="relative mx-auto w-full max-w-full touch-none select-none overflow-hidden rounded-[14px] bg-black"
      style={{ aspectRatio: `${width} / ${height}`, maxHeight: "70dvh", maxWidth: `calc(70dvh * ${width / height})`, cursor: "crosshair" }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.remove) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = at(e);
        setDrag({ ...drag, x1: p.x, y1: p.y });
      }}
      onPointerUp={() => {
        if (live && live.w > 0.005 && live.h > 0.005) onChange([...boxes, live]);
        setDrag(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private, never cached */}
      <img src={`/api/admin/contributions/${id}/photo`} alt="The submitted photo" draggable={false} className="pointer-events-none h-full w-full object-contain" />
      {boxes.map((b, i) => (
        <div
          key={i}
          className="absolute border-2 border-ucla-gold"
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        >
          <button
            type="button"
            data-remove="1"
            aria-label="Remove this blur box"
            onClick={() => onChange(boxes.filter((_, j) => j !== i))}
            className="absolute -right-2.5 -top-2.5 grid h-5 w-5 place-items-center rounded-full bg-ucla-gold text-xs font-bold text-night"
          >
            ×
          </button>
        </div>
      ))}
      {live && (
        <div className="absolute border-2 border-dashed border-paper" style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, width: `${live.w * 100}%`, height: `${live.h * 100}%` }} />
      )}
    </div>
  );
}
