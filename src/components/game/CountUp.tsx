"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/game/format";

type Props = { value: number; durationMs?: number; delayMs?: number; className?: string };

/** A number that counts up from zero. Jumps straight to the value when motion is reduced. */
export default function CountUp({ value, durationMs = 900, delayMs = 0, className }: Props) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    const startedAt = performance.now() + delayMs;
    const step = (now: number) => {
      const share = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      setShown(Math.round(value * (1 - (1 - share) ** 3)));
      if (share < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, delayMs]);

  return (
    <span className={`numeric ${className ?? ""}`} aria-label={formatPoints(value)}>
      {formatPoints(shown)}
    </span>
  );
}
