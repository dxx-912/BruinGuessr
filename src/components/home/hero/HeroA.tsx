import { Suspense } from "react";
import { EyeIcon, PinIcon, TargetIcon } from "@/components/art/icons";
import { COPY, GuestNote, Scene, SoloSlot, TopPlayers, TopPlayersHeading } from "./shared";
import { CardSolo, CardVersus } from "./tiles";

const ICONS = [EyeIcon, PinIcon, TargetIcon];

/**
 * A. Blue hour. A centred panorama: the headline in a clear, darkened patch of
 * sky, Royce relit in cool blue with gold only where there is light, the scene
 * fading into the page before the two cards begin. Cards are navy with a
 * coloured icon, light and call to action; the features drop their rainbow chips.
 */
export default function HeroA() {
  return (
    <div className="w-full pb-6">
      <section aria-labelledby="headline" className="relative">
        <div className="relative">
          {/* The scene reaches up behind the header and fades into the page at the top and bottom */}
          <div aria-hidden className={`absolute inset-x-0 -top-24 bottom-0 -z-10 overflow-hidden hero-fade-top`}>
            <Scene grade="blue" className="absolute inset-x-0 bottom-0 aspect-[1600/720] min-h-[340px] w-full object-cover object-bottom" />
            <div className={`absolute inset-0 hero-vignette`} />
            <div className={`absolute inset-0 hero-sky-scrim`} />
          </div>
          <div className="mx-auto max-w-4xl px-4 pt-4 text-center sm:px-6 sm:pt-8">
            <h1 id="headline" className="display text-[clamp(3.6rem,11vw,7rem)] drop-shadow-[0_4px_18px_rgb(2_10_20/0.6)]">
              Know <span className={`text-ucla-gold hero-gold-glow`}>UCLA?</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-snug text-[#cfe0f4] sm:text-xl">{COPY.sub}</p>
          </div>
          {/* Room for Royce: a little less than the scene's height, so only its empty top sky reaches the text */}
          <div className="aspect-[1600/600] min-h-[290px] w-full" />
        </div>

        <div className="relative mx-auto -mt-6 max-w-4xl sm:-mt-8 px-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <Suspense fallback={<CardSolo needsUsername={false} />}>
              <SoloSlot>{(needsUsername) => <CardSolo needsUsername={needsUsername} />}</SoloSlot>
            </Suspense>
            <CardVersus />
          </div>
          <Suspense fallback={<p className="mt-4 h-5" />}>
            <GuestNote className="mt-4 text-center" />
          </Suspense>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <ul className="mt-12 grid gap-3 sm:grid-cols-3">
          {COPY.features.map((f, i) => {
            const Icon = ICONS[i];
            return (
              <li
                key={f.title}
                className="flex gap-4 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,#0d2b4a,#0a223c)] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_16px_32px_-20px_rgb(0_0_0/0.9)] sm:block sm:p-5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-ucla-blue/18 text-sky ring-1 ring-sky/20">
                  <Icon className="h-6 w-6" />
                </span>
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
