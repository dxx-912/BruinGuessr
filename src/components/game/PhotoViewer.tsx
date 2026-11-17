"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** An in-memory copy of the round's photo, or null while it is still downloading. */
  src: string | null;
  alt: string;
  /** True when the download failed and gave up. `onRetry` tries it again. */
  failed?: boolean;
  onRetry?: () => void;
};

type View = { scale: number; x: number; y: number };

const REST: View = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 5;

/**
 * The round's photo, shown whole (never cropped) over a blurred copy of itself.
 * Scroll or pinch to zoom, drag to move around, double-click to zoom in and out.
 */
export default function PhotoViewer({ src, alt, failed = false, onRetry }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(REST);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  /** Keeps the photo from being dragged out of the frame. */
  const clamp = useCallback((next: View): View => {
    const box = frame.current?.getBoundingClientRect();
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    if (!box || scale === 1) return REST;
    const maxX = ((scale - 1) * box.width) / 2;
    const maxY = ((scale - 1) * box.height) / 2;
    return { scale, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }, []);

  /** Zooms by `factor`, keeping the point under (clientX, clientY) where it is. */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      setView((current) => {
        const box = frame.current?.getBoundingClientRect();
        if (!box) return current;
        const scale = Math.min(MAX_SCALE, Math.max(1, current.scale * factor));
        const cx = (clientX ?? box.left + box.width / 2) - (box.left + box.width / 2);
        const cy = (clientY ?? box.top + box.height / 2) - (box.top + box.height / 2);
        const ratio = scale / current.scale;
        return clamp({ scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio });
      });
    },
    [clamp],
  );

  // React registers wheel listeners as passive, which cannot stop the page from scrolling.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      zoomAt(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0018)), ev.clientX, ev.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
    setDragging(true);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const previous = pointers.current.get(ev.pointerId);
    if (!previous) return;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const target = pinch.current.scale * (distance / pinch.current.distance);
      zoomAt(target / view.scale, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const dx = ev.clientX - previous.x;
    const dy = ev.clientY - previous.y;
    setView((current) => (current.scale === 1 ? current : clamp({ ...current, x: current.x + dx, y: current.y + dy })));
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  const zoomed = view.scale > 1;

  return (
    <div
      ref={frame}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-night"
      style={{ cursor: zoomed ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(ev) => (zoomed ? setView(REST) : zoomAt(2.5, ev.clientX, ev.clientY))}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob, nothing for next/image to optimise */}
          <img src={src} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="absolute inset-0 h-full w-full animate-fade object-contain"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: dragging ? "none" : "transform 120ms ease-out",
            }}
          />
        </>
      ) : failed ? (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-6 pt-16 text-center" onPointerDown={(ev) => ev.stopPropagation()}>
          <p className="text-lg font-semibold text-paper">The photo could not load.</p>
          <p className="text-sm text-sky">Check your connection. The clock is still running.</p>
          {onRetry && (
            <button type="button" className="btn btn-blue" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      ) : (
        <p className="absolute inset-0 grid place-items-center pt-16 text-lg font-semibold text-sky">Loading the photo…</p>
      )}

      {src && (
        <div className="absolute bottom-4 left-4 hidden flex-col overflow-hidden rounded-xl border-2 border-navy-line bg-navy md:flex" onPointerDown={(ev) => ev.stopPropagation()} onDoubleClick={(ev) => ev.stopPropagation()}>
          <button type="button" aria-label="Zoom in on the photo" className="grid h-10 w-10 cursor-pointer place-items-center text-2xl font-semibold leading-none hover:bg-navy-line" onClick={() => zoomAt(1.6)}>
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out of the photo"
            disabled={!zoomed}
            className="grid h-10 w-10 cursor-pointer place-items-center border-t-2 border-navy-line text-2xl font-semibold leading-none hover:bg-navy-line disabled:cursor-default disabled:text-sky/40 disabled:hover:bg-transparent"
            onClick={() => zoomAt(1 / 1.6)}
          >
            −
          </button>
        </div>
      )}
    </div>
  );
}
