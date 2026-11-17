import { Suspense } from "react";
import { COPY, GuestNote, Scene, SoloSlot, TopPlayers, TopPlayersHeading } from "./shared";
import { EnamelSolo, EnamelVersus } from "./tiles";

/**
 * B. Through the arch. Royce at golden hour, seen through a round-headed
 * opening like its own portals: a stone surround, shadow inside the reveal,
 * warm light spilling out, the bottom dissolving into the page. The art is
 * contained, so nothing in it can collide with the interface. The tiles stay
 * solid gold and blue, now glazed and lit like enamel pins.
 */
export default function HeroB() {
  return (
    <div className="w-full overflow-x-clip pb-6">
      <section aria-labelledby="headline" className="mx-auto max-w-6xl px-4 pt-2 sm:px-6 lg:pt-6">
        <div className="grid items-center gap-x-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          {/* The arch: first on a phone, on the right from 1024 px */}
          <div className="relative mx-auto mt-10 aspect-[5/6] w-[min(72vw,320px)] sm:w-[min(52vw,380px)] lg:order-2 lg:mt-6 lg:w-full lg:max-w-[460px]">
            <div aria-hidden className="hero-arch-glow" />
            <div aria-hidden className="hero-arch-rim-outer" />
            <div aria-hidden className="hero-arch-rim" />
            <div aria-hidden className="hero-arch">
              <Scene grade="gold" className="h-full w-full object-cover object-[50%_100%]" />
            </div>
          </div>

          <div className="relative z-10 -mt-[clamp(44px,12vw,72px)] text-center lg:mt-0 lg:text-left">
            <h1 id="headline" className="display text-[clamp(3.6rem,11vw,6.6rem)]">
              Know <span className="text-ucla-gold">UCLA?</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-lg leading-snug text-[#cfe0f4] sm:text-xl lg:mx-0">{COPY.sub}</p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 sm:gap-5">
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
