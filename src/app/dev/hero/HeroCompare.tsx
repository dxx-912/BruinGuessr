"use client";

import { useEffect, useRef, useState } from "react";

const VARIANTS = [
  {
    id: "a",
    name: "A · Blue hour",
    idea: "Centred panorama. Cool blue grade, gold only where there is light. Headline in a darkened patch of sky; the scene fades out before two navy cards with a big icon, light and a button.",
  },
  {
    id: "b",
    name: "B · Through the arch",
    idea: "Royce at golden hour seen through a round-headed portal with a stone surround. The art is contained, so nothing collides. Solid gold and blue tiles, glazed like enamel pins.",
  },
  {
    id: "c",
    name: "C · Night game",
    idea: "Floodlit night with two beams. The scene bleeds off the right and dissolves into the dark behind a left column: headline, then one dock holding both modes as rows.",
  },
] as const;

const DEVICES = {
  desktop: { width: 1280, height: 860, label: "Desktop 1280" },
  phone: { width: 390, height: 780, label: "Phone 390" },
} as const;
type Device = keyof typeof DEVICES;

/** An iframe at the device's real width, scaled down to fit its column. */
function Frame({ src, device, title }: { src: string; device: Device; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const { width, height } = DEVICES[device];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={box} className="w-full" style={{ height: height * scale }}>
      <iframe
        src={src}
        title={title}
        width={width}
        height={height}
        className="origin-top-left rounded-[14px] border border-white/10 bg-night shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)]"
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

export default function HeroCompare() {
  const [device, setDevice] = useState<Device>("desktop");
  const [only, setOnly] = useState<string | null>(null);
  const shown = only ? VARIANTS.filter((v) => v.id === only) : VARIANTS;

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-paper text-night" : "text-sky hover:text-paper"}`;

  return (
    <main className="min-h-dvh bg-[#040f1d] px-4 py-5 text-paper sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="heading text-3xl">Play page hero: three variants</h1>
          <p className="mt-1 max-w-2xl text-sm text-sky">
            Each frame is the real page at {DEVICES[device].label.toLowerCase()} px, scaled to fit. Scroll inside a frame, or open it on its own. The live Play page is unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-white/10 p-1" role="group" aria-label="Device">
            {(Object.keys(DEVICES) as Device[]).map((d) => (
              <button key={d} type="button" className={pill(device === d)} aria-pressed={device === d} onClick={() => setDevice(d)}>
                {DEVICES[d].label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-white/10 p-1" role="group" aria-label="Show">
            <button type="button" className={pill(only === null)} aria-pressed={only === null} onClick={() => setOnly(null)}>
              All three
            </button>
            {VARIANTS.map((v) => (
              <button key={v.id} type="button" className={pill(only === v.id)} aria-pressed={only === v.id} onClick={() => setOnly(v.id)}>
                {v.id.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div
        className={`mt-6 grid gap-5 ${only ? "" : device === "phone" ? "md:grid-cols-3" : "xl:grid-cols-3"}`}
        style={only && device === "phone" ? { maxWidth: DEVICES.phone.width, marginInline: "auto" } : undefined}
      >
        {shown.map((v) => (
          <section key={v.id} className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="heading text-2xl">{v.name}</h2>
              <a href={`/dev/hero/${v.id}`} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-sky underline underline-offset-4 hover:text-paper">
                Open
              </a>
            </div>
            <p className="mb-3 text-sm leading-snug text-sky xl:min-h-[3.75rem]">{v.idea}</p>
            <Frame src={`/dev/hero/${v.id}`} device={device} title={v.name} />
          </section>
        ))}
      </div>
    </main>
  );
}
