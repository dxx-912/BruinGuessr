"use client";

import Link from "next/link";
import { ArrowIcon, SwordsIcon, TargetIcon } from "@/components/art/icons";
import { useSoloStart } from "@/components/home/PlayButton";
import { COPY } from "./copy";

/**
 * The Solo and Versus controls for the three hero variants on /dev/hero. Each
 * fixes the old tiles the same ways (a big icon, a clear action, text on one
 * alignment, real depth) in its own style. The whole tile is the control; the
 * button inside is only its label.
 */

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 font-semibold text-alarm">
      {children}
    </p>
  );
}

/* ---------- A: elevated cards ---------- */

const card =
  "group relative flex h-full w-full flex-col overflow-hidden rounded-[22px] border p-5 text-left transition duration-200 sm:p-6 " +
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_2px_0_#030d18,0_28px_56px_-20px_rgb(0_0_0/0.85)] hover:-translate-y-0.5 " +
  "focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-paper disabled:cursor-wait";

function CardBody({ tone, title, body, cta, icon }: { tone: "gold" | "blue"; title: string; body: string; cta: string; icon: React.ReactNode }) {
  const gold = tone === "gold";
  return (
    <>
      {/* Light falling on the card from its icon's colour */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100 ${
          gold ? "bg-ucla-gold/22 opacity-70" : "bg-ucla-blue/40 opacity-70"
        }`}
      />
      <span className="relative flex items-center gap-4">
        <span
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-[18px] ${
            gold
              ? "bg-[linear-gradient(160deg,#ffe066,#ffd100_55%,#e6b800)] text-night shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_10px_24px_-6px_rgb(255_209_0/0.55)]"
              : "bg-[linear-gradient(160deg,#4a95d0,#2774ae_55%,#1d5f92)] text-paper shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_24px_-6px_rgb(39_116_174/0.7)]"
          }`}
        >
          <span className="h-9 w-9 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
        </span>
        <span className="heading text-[2.6rem] leading-none">{title}</span>
      </span>
      <span className="relative mt-4 text-[1.05rem] leading-snug text-[#c3d6ec]">{body}</span>
      <span className="relative mt-auto pt-6">
        <span className={`btn ${gold ? "btn-gold" : "btn-blue"} !mb-[5px] !text-lg group-hover:brightness-105`}>
          {cta}
          <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </>
  );
}

export function CardSolo({ needsUsername }: { needsUsername: boolean }) {
  const { start, starting, problem } = useSoloStart(needsUsername);
  return (
    <div className="h-full">
      <button
        type="button"
        onClick={start}
        disabled={starting}
        aria-busy={starting}
        className={`${card} cursor-pointer border-ucla-gold/35 bg-[linear-gradient(180deg,#14385e,#0b2742_70%)] hover:border-ucla-gold/70`}
      >
        <CardBody tone="gold" title={COPY.solo.title} body={COPY.solo.body} cta={starting ? "Starting…" : COPY.solo.cta} icon={<TargetIcon />} />
      </button>
      {problem && <Problem>{problem}</Problem>}
    </div>
  );
}

export function CardVersus() {
  return (
    <Link href="/versus" className={`${card} border-white/10 bg-[linear-gradient(180deg,#123459,#0b2742_70%)] hover:border-sky/60`}>
      <CardBody tone="blue" title={COPY.versus.title} body={COPY.versus.body} cta={COPY.versus.cta} icon={<SwordsIcon />} />
    </Link>
  );
}

/* ---------- B: enamel tiles ---------- */

const enamel =
  "group relative flex h-full w-full overflow-hidden rounded-[24px] text-left transition duration-150 " +
  "flex-row items-center gap-4 p-4 sm:flex-col sm:items-stretch sm:gap-0 sm:p-5 " +
  "hover:-translate-y-0.5 active:translate-y-[3px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-paper disabled:cursor-wait";

function EnamelBody({ tone, title, body, cta, icon }: { tone: "gold" | "blue"; title: string; body: string; cta: string; icon: React.ReactNode }) {
  const gold = tone === "gold";
  return (
    <>
      {/* The icon again, large and faint, running off the corner */}
      <span aria-hidden className={`pointer-events-none absolute -bottom-10 -right-8 h-44 w-44 rotate-[-12deg] [&>svg]:h-full [&>svg]:w-full ${gold ? "text-night/10" : "text-paper/10"}`}>
        {icon}
      </span>
      {/* A sheen across the top, as on a glazed pin */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(180deg,rgb(255_255_255/0.22),transparent)]" />
      <span
        className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full ${
          gold ? "bg-night text-ucla-gold shadow-[0_6px_14px_-4px_rgb(6_24_43/0.6)]" : "bg-paper text-ucla-blue shadow-[0_6px_14px_-4px_rgb(6_24_43/0.6)]"
        }`}
      >
        <span className="h-8 w-8 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      </span>
      <span className="relative min-w-0 flex-1 sm:mt-4 sm:flex-none">
        <span className="heading block text-[2.2rem] leading-none sm:text-[2.5rem]">{title}</span>
        <span className="mt-1.5 block font-semibold leading-snug opacity-85">{body}</span>
      </span>
      <span className="relative mt-auto hidden items-center justify-between pt-5 sm:flex">
        <span className="font-display text-lg font-bold uppercase tracking-[0.04em]">{cta}</span>
        <span className={`grid h-10 w-10 place-items-center rounded-full transition-transform group-hover:translate-x-1 ${gold ? "bg-night text-ucla-gold" : "bg-paper text-ucla-blue"}`}>
          <ArrowIcon className="h-5 w-5" />
        </span>
      </span>
      <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full sm:hidden ${gold ? "bg-night text-ucla-gold" : "bg-paper text-ucla-blue"}`}>
        <ArrowIcon className="h-5 w-5" />
        <span className="sr-only">{cta}</span>
      </span>
    </>
  );
}

export function EnamelSolo({ needsUsername }: { needsUsername: boolean }) {
  const { start, starting, problem } = useSoloStart(needsUsername);
  return (
    <div className="h-full">
      <button
        type="button"
        onClick={start}
        disabled={starting}
        aria-busy={starting}
        className={`${enamel} cursor-pointer bg-[linear-gradient(180deg,#ffdf4d,#ffd100_45%,#f2c200)] text-night shadow-[inset_0_-2px_0_rgb(0_0_0/0.08),0_6px_0_#b38f00,0_26px_44px_-14px_rgb(0_0_0/0.75),0_0_60px_-10px_rgb(255_209_0/0.35)] active:shadow-[0_3px_0_#b38f00,0_18px_30px_-14px_rgb(0_0_0/0.75)]`}
      >
        <EnamelBody tone="gold" title={starting ? "Starting…" : COPY.solo.title} body={COPY.solo.body} cta={COPY.solo.cta} icon={<TargetIcon />} />
      </button>
      {problem && <Problem>{problem}</Problem>}
    </div>
  );
}

export function EnamelVersus() {
  return (
    <Link
      href="/versus"
      className={`${enamel} bg-[linear-gradient(180deg,#3a8ccb,#2774ae_45%,#2168a0)] text-paper shadow-[inset_0_-2px_0_rgb(0_0_0/0.1),0_6px_0_#17507c,0_26px_44px_-14px_rgb(0_0_0/0.75)] active:shadow-[0_3px_0_#17507c,0_18px_30px_-14px_rgb(0_0_0/0.75)]`}
    >
      <EnamelBody tone="blue" title={COPY.versus.title} body={COPY.versus.body} cta={COPY.versus.cta} icon={<SwordsIcon />} />
    </Link>
  );
}

/* ---------- C: one dock, two rows ---------- */

const row =
  "group relative flex w-full items-center gap-4 px-4 py-4 text-left transition-colors sm:gap-5 sm:px-5 sm:py-5 " +
  "focus-visible:z-10 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-paper disabled:cursor-wait";

function RowBody({ tone, title, body, cta, icon }: { tone: "gold" | "blue"; title: string; body: string; cta: string; icon: React.ReactNode }) {
  const gold = tone === "gold";
  return (
    <>
      <span
        className={`grid h-14 w-14 shrink-0 place-items-center rounded-full sm:h-16 sm:w-16 ${
          gold
            ? "bg-[radial-gradient(circle_at_35%_30%,#ffe680,#ffd100_60%,#d9ad00)] text-night shadow-[0_0_0_4px_rgb(255_209_0/0.12),0_0_36px_-4px_rgb(255_209_0/0.6)]"
            : "bg-[radial-gradient(circle_at_35%_30%,#5aa3db,#2774ae_60%,#1b5a8a)] text-paper shadow-[0_0_0_4px_rgb(39_116_174/0.18),0_0_32px_-6px_rgb(39_116_174/0.8)]"
        }`}
      >
        <span className="h-8 w-8 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="heading block text-[2rem] leading-none sm:text-[2.3rem]">{title}</span>
        <span className="mt-1 block leading-snug text-[#b9cde4]">{body}</span>
      </span>
      <span
        className={`flex shrink-0 items-center gap-2 rounded-full font-display text-base font-bold uppercase tracking-[0.04em] transition-transform group-hover:translate-x-1 ${
          gold ? "bg-ucla-gold py-2.5 pl-4 pr-3 text-night shadow-[0_4px_0_#b38f00]" : "border-2 border-ucla-blue py-2 pl-4 pr-3 text-paper"
        }`}
      >
        <span className="hidden sm:inline">{cta}</span>
        <ArrowIcon className="h-5 w-5" />
        <span className="sr-only sm:hidden">{cta}</span>
      </span>
    </>
  );
}

export function DockSolo({ needsUsername }: { needsUsername: boolean }) {
  const { start, starting, problem } = useSoloStart(needsUsername);
  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={starting}
        aria-busy={starting}
        className={`${row} cursor-pointer rounded-t-[22px] bg-[linear-gradient(90deg,rgb(255_209_0/0.14),transparent_70%)] hover:bg-[linear-gradient(90deg,rgb(255_209_0/0.22),transparent_80%)]`}
      >
        <span aria-hidden className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-ucla-gold" />
        <RowBody tone="gold" title={starting ? "Starting…" : COPY.solo.title} body={COPY.solo.body} cta={COPY.solo.cta} icon={<TargetIcon />} />
      </button>
      {problem && <div className="px-5 pb-3">{<Problem>{problem}</Problem>}</div>}
    </>
  );
}

export function DockVersus() {
  return (
    <Link href="/versus" className={`${row} rounded-b-[22px] hover:bg-white/[0.04]`}>
      <RowBody tone="blue" title={COPY.versus.title} body={COPY.versus.body} cta={COPY.versus.cta} icon={<SwordsIcon />} />
    </Link>
  );
}
