"use client";

import { useEffect, useRef, useState } from "react";
import { serverClock } from "@/lib/game/api";
import { formatClock } from "@/lib/game/format";
import { sound } from "@/lib/game/sound";

type Props = {
  /** Server times (ms) when the clock starts and when it hits zero. */
  startsAt: number;
  deadlineAt: number;
  /** False once the guess is locked in: the clock keeps its place but stops counting. */
  running: boolean;
};

/**
 * The countdown pill. It only displays time; the server decides when a round is
 * over. Gold for the last ten seconds, red and ticking for the last five.
 */
export default function Timer({ startsAt, deadlineAt, running }: Props) {
  const total = deadlineAt - startsAt;
  const [msLeft, setMsLeft] = useState(total);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const update = () => {
      const left = Math.min(total, Math.max(0, deadlineAt - serverClock.now()));
      setMsLeft(left);
      const seconds = Math.ceil(left / 1000);
      if (left < total && seconds <= 5 && seconds >= 1 && lastTick.current !== seconds) {
        lastTick.current = seconds;
        sound.tick(seconds === 1);
      }
      if (left > 0) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [deadlineAt, total, running]);

  const seconds = Math.ceil(msLeft / 1000);
  const urgent = seconds <= 5;
  const warm = seconds <= 10;
  const color = urgent ? "var(--color-alarm)" : warm ? "var(--color-ucla-gold)" : "var(--color-paper)";

  return (
    <div
      role="timer"
      aria-label={`${seconds} seconds left`}
      className={`panel relative w-[6.5rem] overflow-hidden !rounded-full px-3 pb-2.5 pt-1.5 text-center min-[360px]:w-28 min-[390px]:w-32 sm:w-36 sm:px-5 ${urgent && running && msLeft > 0 ? "animate-beat" : ""}`}
      style={{ borderColor: urgent ? "var(--color-alarm)" : warm ? "var(--color-ucla-gold)" : undefined }}
    >
      <span className="display numeric block text-4xl sm:text-[2.6rem]" style={{ color }}>
        {formatClock(msLeft)}
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 bg-night">
        <span className="block h-full origin-left" style={{ background: color, transform: `scaleX(${total > 0 ? msLeft / total : 0})` }} />
      </span>
    </div>
  );
}
