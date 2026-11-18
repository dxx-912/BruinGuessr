"use client";

import { useEffect, useState } from "react";
import { PinIcon } from "@/components/art/icons";

/**
 * "Where is this?": real photos from the game pool as a teaser (see
 * lib/server/showcase.ts for why their addresses name only a slot and a batch).
 * Wide screens get a tilted stack in the sky over Royce, shuffling one photo to
 * the back every few seconds; phones get a slow strip under the tiles. With
 * "reduce motion" on, the stack stays still and the strip is a row to swipe.
 */

const src = (batch: number, slot: number) => `/api/showcase/${slot}?b=${batch}`;

/** Where each layer of the stack sits: the front card first. */
const LAYERS = [
  "z-30 rotate-[-5deg] translate-x-0 translate-y-0",
  "z-20 rotate-[6deg] translate-x-[14%] -translate-y-[9%]",
  "z-10 rotate-[-13deg] -translate-x-[13%] -translate-y-[5%] opacity-90",
];
const HIDDEN = "z-0 rotate-[2deg] translate-x-[4%] -translate-y-[12%] opacity-0";

/** How long each photo stays in front. */
const STEP_MS = 4200;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Drops a slot whose photo did not load, so the stack never shows a broken image. */
function useSlots(count: number) {
  const [broken, setBroken] = useState<number[]>([]);
  const slots = Array.from({ length: count }, (_, i) => i).filter((i) => !broken.includes(i));
  const drop = (slot: number) => setBroken((list) => (list.includes(slot) ? list : [...list, slot]));
  return { slots, drop };
}

function Photo({ batch, slot, onBroken, className = "" }: { batch: number; slot: number; onBroken: (slot: number) => void; className?: string }) {
  return (
    <span className={`block overflow-hidden rounded-[10px] border-[5px] border-b-[18px] border-[#f6efe0] bg-[#f6efe0] shadow-[0_18px_34px_-12px_rgb(0_0_0/0.75)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- already a small, cropped copy made for this spot */}
      <img
        src={src(batch, slot)}
        alt=""
        draggable={false}
        onError={() => onBroken(slot)}
        className="block aspect-[7/5] w-full select-none object-cover"
      />
    </span>
  );
}

/** The label: a gold tag with a pin. */
function Tag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-ucla-gold py-1 pl-2 pr-3.5 text-night shadow-[0_4px_0_#b38f00,0_12px_24px_-8px_rgb(0_0_0/0.7)] ${className}`}>
      <PinIcon className="h-5 w-5" />
      <span className="heading whitespace-nowrap text-xl leading-none">Where is this?</span>
    </span>
  );
}

/** Wide screens: the tilted stack. Pauses while pointed at. */
export function ShowcaseStack({ batch, count, className = "" }: { batch: number; count: number; className?: string }) {
  const { slots, drop } = useSlots(count);
  const reduced = useReducedMotion();
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused || slots.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setFront((n) => n + 1);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [reduced, paused, slots.length]);

  if (slots.length === 0) return null;
  return (
    <figure
      className={`relative ${className}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      aria-label="Photos from around campus. Where is this?"
    >
      <div className="relative">
        {slots.map((slot, i) => {
          const depth = (i - (front % slots.length) + slots.length) % slots.length;
          return (
            <div
              key={slot}
              aria-hidden={depth !== 0}
              className={`absolute inset-0 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.3,0.9,0.3,1)] first:relative ${LAYERS[depth] ?? HIDDEN}`}
            >
              <Photo batch={batch} slot={slot} onBroken={drop} />
            </div>
          );
        })}
      </div>
      <figcaption className="absolute -left-4 -top-5 z-40 rotate-[-4deg]">
        <Tag />
      </figcaption>
    </figure>
  );
}

/** Phones: a strip that drifts slowly sideways (the photos twice over, so it loops without a jump). */
export function ShowcaseStrip({ batch, count }: { batch: number; count: number }) {
  const { slots, drop } = useSlots(count);
  const reduced = useReducedMotion();
  if (slots.length === 0) return null;
  const tilt = ["rotate-[-3deg]", "rotate-[2.5deg]", "rotate-[-1.5deg]", "rotate-[3deg]", "rotate-[-2.5deg]"];
  const row = (copy: number) =>
    slots.map((slot, i) => (
      <li key={`${copy}-${slot}`} aria-hidden={copy > 0} className={`mr-4 w-40 shrink-0 ${tilt[i % tilt.length]}`}>
        <Photo batch={batch} slot={slot} onBroken={drop} />
      </li>
    ));
  return (
    <figure className="mt-10" aria-label="Photos from around campus. Where is this?">
      <figcaption className="px-4 sm:px-6">
        <Tag className="rotate-[-3deg]" />
      </figcaption>
      <div className={`mt-3 [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)] ${reduced ? "overflow-x-auto" : "overflow-hidden"}`}>
        <ul className={`flex w-max py-4 pl-4 ${reduced ? "" : "animate-drift"}`}>
          {row(0)}
          {!reduced && row(1)}
        </ul>
      </div>
    </figure>
  );
}
