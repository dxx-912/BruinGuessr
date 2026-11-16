"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#FFD100", "#2774AE", "#8BB8E8", "#F4F8FC", "#FFB81C"];

type Piece = { x: number; y: number; vx: number; vy: number; size: number; spin: number; angle: number; color: string };

/** A burst of blue and gold paper for a bullseye. Draws for about three seconds, then stops. */
export default function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    el.width = width * ratio;
    el.height = height * ratio;
    ctx.scale(ratio, ratio);

    // Two cannons, bottom left and bottom right, firing up and inward.
    const pieces: Piece[] = Array.from({ length: 170 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 14;
      return {
        x: fromLeft ? -10 : width + 10,
        y: height * 0.85,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 8,
        spin: (Math.random() - 0.5) * 0.4,
        angle: Math.random() * Math.PI,
        color: COLORS[i % COLORS.length],
      };
    });

    let frame = 0;
    const startedAt = performance.now();
    const draw = (now: number) => {
      const age = now - startedAt;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.max(0, Math.min(1, (3200 - age) / 700));
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (age < 3200) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
