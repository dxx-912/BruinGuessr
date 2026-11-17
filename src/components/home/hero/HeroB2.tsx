import { Suspense } from "react";
import { COPY, GuestNote, Scene, SoloSlot, TopPlayers, TopPlayersHeading } from "./shared";
import { EnamelSolo, EnamelVersus } from "./tiles";

/** The scene's left side and top dissolve into the page (1280 px and wider). */
const WIDE_MASK = {
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 36%), linear-gradient(to bottom, transparent 0, #000 14%)",
  WebkitMaskComposite: "source-in",
  maskImage: "linear-gradient(to right, transparent 0%, #000 36%), linear-gradient(to bottom, transparent 0, #000 14%)",
  maskComposite: "intersect",
} as const;

/** Only the top melts into the page (phones and tablets). */
const TOP_MASK = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
  maskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
} as const;

/**
 * B2. B without the arch. The same golden-hour Royce, enamel tiles and
 * numbered steps, but the scene is part of the background, as in C: on a wide
 * screen (from 1280 px, so both towers always fit) it bleeds off the right and dissolves into the night behind the text;
 * on a phone it sits between the text and the tiles, fading in at the top and
 * out at the bottom.
 */
export default function HeroB2() {
  return (
    <div className="w-full overflow-x-clip pb-6">
      <section aria-labelledby="headline" className="relative xl:min-h-[clamp(560px,calc(100dvh-5rem),720px)]">
        {/* Wide screens: the scene behind the whole section */}
        <div aria-hidden className="absolute inset-x-0 -top-24 bottom-0 -z-10 hidden overflow-hidden xl:block">
          <div className="absolute inset-y-0 left-[30%] right-[-22%]">
            <Scene grade="gold" className="h-full w-full object-cover object-bottom" style={WIDE_MASK} />
          </div>
          {/* Night behind the text, clearing toward Royce */}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(6_24_43/0.96)_0%,rgb(6_24_43/0.86)_40%,rgb(6_24_43/0)_64%)]" />
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pt-3 text-center sm:pt-6 xl:max-w-[min(520px,48%)] xl:pt-[clamp(32px,7vh,72px)] xl:text-left">
            <h1 id="headline" className="display text-[clamp(3.6rem,13vw,6.4rem)] xl:text-[clamp(4.2rem,6.4vw,6rem)]">
              Know <span className="text-ucla-gold">UCLA?</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-lg leading-snug text-[#cfe0f4] sm:text-xl xl:mx-0">{COPY.sub}</p>

            {/* Phones and tablets: the scene between the text and the tiles */}
            <div aria-hidden className="-mx-4 -mt-4 sm:-mx-6 xl:hidden">
              <Scene grade="gold" className="aspect-[1600/720] min-h-[300px] w-full object-cover object-bottom" style={TOP_MASK} />
            </div>

            <div className="grid gap-4 text-left sm:grid-cols-2 sm:gap-5 xl:mt-8">
              <Suspense fallback={<EnamelSolo needsUsername={false} />}>
                <SoloSlot>{(needsUsername) => <EnamelSolo needsUsername={needsUsername} />}</SoloSlot>
              </Suspense>
              <EnamelVersus />
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
