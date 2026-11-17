import { Suspense } from "react";
import { EyeIcon, PinIcon, TargetIcon } from "@/components/art/icons";
import { COPY, GuestNote, Scene, SoloSlot, TopPlayers, TopPlayersHeading } from "./shared";
import { DockSolo, DockVersus } from "./tiles";

const ICONS = [EyeIcon, PinIcon, TargetIcon];

/**
 * C. Night game. Royce floodlit under a night sky with two beams, big and
 * immersive. On a wide screen the scene bleeds off the right and dissolves
 * into the dark on the left, where the headline and a single dock with both
 * modes sit like a scoreboard's controls. On a phone the scene is the top of
 * the page and the dock follows it.
 */
export default function HeroC() {
  return (
    <div className="w-full pb-6">
      <section aria-labelledby="headline" className="relative lg:min-h-[clamp(560px,calc(100dvh-5rem),720px)]">
        {/* Wide screens: the scene behind the whole section, bleeding off the right */}
        <div aria-hidden className="absolute inset-x-0 -top-24 bottom-0 -z-10 hidden overflow-hidden lg:block">
          <div className="absolute inset-y-0 left-[24%] right-[-16%]">
            <Scene grade="night" className="hero-night-scene h-full w-full object-cover object-bottom" />
          </div>
          <div className="hero-night-scrim absolute inset-0" />
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pt-3 sm:pt-6 lg:max-w-[min(520px,48%)] lg:pt-[clamp(32px,7vh,72px)]">
            <h1 id="headline" className="display text-[clamp(3.6rem,13vw,6.4rem)] lg:text-[clamp(4.2rem,6.4vw,6rem)]">
              Know <span className="text-ucla-gold [text-shadow:0_0_36px_rgb(255_209_0/0.4)]">UCLA?</span>
            </h1>
            <p className="mt-3 max-w-md text-lg leading-snug text-[#cfe0f4] sm:text-xl">{COPY.sub}</p>

            {/* Phones and tablets: the scene between the text and the dock, its empty sky tucked under the text */}
            <div aria-hidden className="-mx-4 -mt-4 sm:-mx-6 lg:hidden">
              <Scene grade="night" className="hero-fade-top aspect-[1600/720] min-h-[300px] w-full object-cover object-bottom" />
            </div>

            <div className={`hero-dock relative rounded-[24px] lg:mt-8`}>
              <Suspense fallback={<DockSolo needsUsername={false} />}>
                <SoloSlot>{(needsUsername) => <DockSolo needsUsername={needsUsername} />}</SoloSlot>
              </Suspense>
              <div className="mx-5 h-px bg-white/8" />
              <DockVersus />
            </div>
            <Suspense fallback={<p className="mt-4 h-5" />}>
              <GuestNote className="mt-4" />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* The three steps in one panel, gold line icons, no colour chips */}
        <ul className={`mt-12 grid rounded-[22px] sm:grid-cols-3 hero-dock`}>
          {COPY.features.map((f, i) => {
            const Icon = ICONS[i];
            return (
              <li key={f.title} className="flex gap-4 p-5 sm:block sm:p-6 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-white/8 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0">
                <Icon className="h-8 w-8 shrink-0 text-ucla-gold" />
                <div>
                  <h2 className="heading text-[1.75rem] sm:mt-3">{f.title}</h2>
                  <p className="mt-1 text-sky">{f.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

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
