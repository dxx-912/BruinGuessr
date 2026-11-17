import { Suspense } from "react";
import { COPY, GuestNote, Scene, SoloSlot, TopPlayers, TopPlayersHeading } from "./shared";
import { EnamelSolo, EnamelVersus } from "./tiles";

/** The scene's left side and top dissolve into the page, so Royce has no edge on the text's side. */
const SIDE_MASK = {
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 18%), linear-gradient(to bottom, transparent 0, #000 16%)",
  WebkitMaskComposite: "source-in",
  maskImage: "linear-gradient(to right, transparent 0%, #000 18%), linear-gradient(to bottom, transparent 0, #000 16%)",
  maskComposite: "intersect",
} as const;

/** Only the top melts into the page (phones). */
const TOP_MASK = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
  maskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
} as const;

/**
 * B2. B without the arch. The same golden-hour Royce, enamel tiles and
 * numbered steps; the headline and both tiles on the left, Royce on the right
 * as part of the background, its left side dissolving into the night. The
 * scene is at most 4:5 and starts where the text column ends (narrower, it gets shorter rather than cropping), so
 * both towers stay in view from a tablet to a wide monitor. A phone is too
 * narrow to split, so there the scene sits between the text and the tiles.
 */
export default function HeroB2() {
  return (
    <div className="w-full overflow-x-clip pb-6">
      <section aria-labelledby="headline" className="@container relative md:min-h-[clamp(540px,calc(100dvh-5rem),720px)]">
        {/* Tablets and up: Royce on the right, anchored to the bottom of the section. Its left edge starts
            just past the text column (46% of the centred 72rem column), so the fade never runs under a tile. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 bottom-0 left-[calc((100cqw-min(100cqw,72rem))/2+min(100cqw,72rem)*0.46)] right-0 -z-10 hidden md:block"
        >
          <div className="absolute bottom-0 right-0 aspect-[4/5] max-h-full w-full">
            <Scene grade="gold" className="h-full w-full object-cover object-[47%_100%]" style={SIDE_MASK} />
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pt-3 sm:pt-6 md:max-w-[44%] md:pt-[clamp(28px,6vh,64px)]">
            <h1 id="headline" className="display text-[clamp(3.6rem,13vw,5rem)] md:text-[clamp(3.4rem,6.4vw,6rem)]">
              Know <span className="text-ucla-gold">UCLA?</span>
            </h1>
            <p className="mt-3 max-w-md text-lg leading-snug text-[#cfe0f4] sm:text-xl">{COPY.sub}</p>

            {/* Phones: the scene between the text and the tiles */}
            <div aria-hidden className="-mx-4 -mt-4 sm:-mx-6 md:hidden">
              <Scene grade="gold" className="aspect-[1600/720] min-h-[300px] w-full object-cover object-bottom" style={TOP_MASK} />
            </div>

            <div className="grid gap-4 md:mt-8 xl:grid-cols-2 xl:gap-5">
              <Suspense fallback={<EnamelSolo needsUsername={false} tallFrom="xl" />}>
                <SoloSlot>{(needsUsername) => <EnamelSolo needsUsername={needsUsername} tallFrom="xl" />}</SoloSlot>
              </Suspense>
              <EnamelVersus tallFrom="xl" />
            </div>
            <Suspense fallback={<p className="mt-5 h-5" />}>
              <GuestNote className="mt-5" />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* How it plays: three numbered steps on one hairline, no colour chips */}
        <ol className="mt-14 grid border-t border-white/10 sm:grid-cols-3">
          {COPY.features.map((f, i) => (
            <li key={f.title} className="flex gap-4 border-b border-white/10 py-5 sm:block sm:border-b-0 sm:py-6 sm:pr-6 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:pl-6">
              <span className="display numeric text-5xl leading-none text-ucla-gold/90">{i + 1}</span>
              <div>
                <h2 className="heading text-[1.75rem] sm:mt-3">{f.title}</h2>
                <p className="mt-1 text-sky">{f.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12" aria-labelledby="top-players">
          <TopPlayersHeading />
          <Suspense fallback={<div className="mt-3 h-20 animate-pulse rounded-[20px] bg-navy" />}>
            <TopPlayers />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
