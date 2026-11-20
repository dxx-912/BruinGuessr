"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { ArrowIcon, SwordsIcon, TargetIcon } from "@/components/art/icons";
import JoinCodeForm from "@/components/JoinCodeForm";
import { api, ApiError } from "@/lib/game/api";
import { formatPoints } from "@/lib/game/format";
import { ordinal } from "@/lib/leaderboard";

/**
 * The Solo and Versus tiles on the Play page, glazed like enamel pins: a
 * gradient face, a sheen across the top, a solid lip and a soft shadow. Each
 * tile is the control as a whole. Below 1280 px (where the left column is
 * narrow) a tile is a compact row: icon disc, title and sentence, arrow. From
 * 1280 px it stands tall, with the call to action along the bottom.
 */
const TILE =
  "group relative isolate flex h-full w-full flex-row items-center gap-4 overflow-hidden rounded-[26px] p-5 text-left transition duration-150 " +
  "xl:min-h-[clamp(18rem,30dvh,22rem)] xl:flex-col xl:items-stretch xl:gap-0 xl:p-7 hover:-translate-y-0.5 active:translate-y-[3px] " +
  "focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-paper disabled:cursor-wait";

const COPY = {
  solo: { title: "Solo", body: "See how high you can score on the leaderboard.", cta: "Play now" },
  versus: { title: "Versus", body: "Join or host a lobby to play with friends!", cta: "Host or join" },
};

/**
 * The inside of a tile. `meta` is what sits at the foot: on a tall tile it
 * replaces the call to action beside the arrow; on a compact row it is a
 * line under the sentence (the call to action is then only read out).
 */
function TileBody({ gold, title, body, cta, icon, meta }: { gold: boolean; title: string; body: string; cta: string; icon: React.ReactNode; meta?: React.ReactNode }) {
  const disc = gold ? "bg-night text-ucla-gold" : "bg-paper text-ucla-blue";
  return (
    <>
      <TileDecor gold={gold} icon={icon} />
      <span className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full shadow-[0_6px_14px_-4px_rgb(6_24_43/0.6)] ${disc}`}>
        <span className="h-9 w-9 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      </span>
      <span className="relative min-w-0 flex-1 xl:mt-5 xl:flex-none">
        <span className="heading block text-[2.4rem] leading-none xl:text-[3.1rem]">{title}</span>
        <span className={`mt-1.5 block font-semibold leading-snug md:text-[1.05rem] xl:mt-2 xl:text-lg ${gold ? "text-night/85" : "text-paper"}`}>{body}</span>
        {meta && <span className="mt-2.5 block xl:hidden">{meta}</span>}
      </span>
      <span className="relative mt-auto hidden items-end justify-between gap-3 pt-6 xl:flex">
        {meta ?? <span className="font-display text-xl font-bold uppercase tracking-[0.04em]">{cta}</span>}
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-transform group-hover:translate-x-1 ${disc}`}>
          <ArrowIcon className="h-5 w-5" />
        </span>
      </span>
      <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform group-hover:translate-x-1 xl:hidden ${disc}`}>
        <ArrowIcon className="h-5 w-5" />
        <span className="sr-only">{cta}</span>
      </span>
    </>
  );
}

/** The glaze (under the tile's content; the tile is `isolate`): the icon again, large and faint, running off the corner, and a sheen across the top. */
function TileDecor({ gold, icon }: { gold: boolean; icon: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className={`pointer-events-none absolute -z-10 -bottom-12 -right-10 h-52 w-52 xl:h-60 xl:w-60 rotate-[-12deg] [&>svg]:h-full [&>svg]:w-full ${gold ? "text-night/10" : "text-paper/[0.06]"}`}>
        {icon}
      </span>
      <span aria-hidden className={`pointer-events-none absolute -z-10 inset-x-0 top-0 h-1/2 ${gold ? "bg-[linear-gradient(180deg,rgb(255_255_255/0.22),transparent)]" : "bg-[linear-gradient(180deg,rgb(255_255_255/0.12),transparent)]"}`} />
    </>
  );
}

/** What the Solo tile knows about the player: their best game and rank, or that they are signed out. */
export type SoloStanding = { kind: "guest" } | { kind: "none" } | { kind: "best"; score: number; rank: number; total: number };

function SoloMeta({ standing }: { standing: SoloStanding }) {
  if (standing.kind === "none") return null;
  if (standing.kind === "guest")
    return <span className="font-display text-xl font-bold uppercase tracking-[0.04em] max-xl:text-base">Sign up to play</span>;
  return (
    <span className="flex items-end gap-3 max-xl:items-center">
      <span className="max-xl:flex max-xl:items-baseline max-xl:gap-2">
        <span className="block whitespace-nowrap text-sm font-bold text-night/75">Your best</span>
        <span className="display numeric block text-[2.1rem] leading-none max-xl:text-2xl">{formatPoints(standing.score)}</span>
      </span>
      <span className="mb-0.5 whitespace-nowrap rounded-full bg-night px-2.5 py-0.5 text-sm font-bold text-ucla-gold max-xl:mb-0">
        {ordinal(standing.rank)}
        <span className="sr-only"> of {formatPoints(standing.total)} on the leaderboard</span>
      </span>
    </span>
  );
}

/**
 * Starting a solo game: on the player's account. A signed-out visitor goes to sign up first.
 */
function useSoloStart(needsUsername: boolean, signedOut: boolean) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<React.ReactNode>(null);

  // Next.js keeps this page's state while the player is in the game. Coming back with the
  // Back button, the button must be ready again, not still starting.
  useLayoutEffect(() => () => setStarting(false), []);

  const start = async () => {
    if (needsUsername) return router.push("/welcome");
    if (signedOut) return router.push("/login?mode=signup");
    setStarting(true);
    setProblem(null);
    try {
      const game = await api.newGame();
      router.push(`/game/${game.id}`);
    } catch (err) {
      setStarting(false);
      const code = err instanceof ApiError ? err.code : "server_error";
      if (code === "no_username") router.push("/welcome");
      else if (code === "unauthorized") router.push("/login?mode=signup");
      else setProblem(code === "network" ? "No connection. Check your internet and try again." : "The game could not start. Try again in a moment.");
    }
  };

  return { start, starting, problem };
}

/** The Solo tile. Starts a solo game and goes to it. */
export function SoloTile({ needsUsername, standing }: { needsUsername: boolean; standing: SoloStanding }) {
  const { start, starting, problem } = useSoloStart(needsUsername, standing.kind === "guest");
  return (
    <div className="h-full">
      <button
        type="button"
        onClick={start}
        disabled={starting}
        aria-busy={starting}
        className={`${TILE} cursor-pointer bg-[linear-gradient(180deg,#ffdf4d,#ffd100_45%,#f2c200)] text-night shadow-[inset_0_-2px_0_rgb(0_0_0/0.08),0_6px_0_#b38f00,0_26px_44px_-14px_rgb(0_0_0/0.75),0_0_60px_-10px_rgb(255_209_0/0.35)] active:shadow-[0_3px_0_#b38f00,0_18px_30px_-14px_rgb(0_0_0/0.75)]`}
      >
        <TileBody
          gold
          title={starting ? "Starting…" : COPY.solo.title}
          body={COPY.solo.body}
          cta={standing.kind === "guest" ? "Sign up to play" : COPY.solo.cta}
          icon={<TargetIcon />}
          meta={<SoloMeta standing={standing} />}
        />
      </button>
      {problem && (
        <p role="alert" className="mt-2 font-semibold text-alarm">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The Versus tile. The tile as a whole goes to the versus page (host or join);
 * the code field at its foot joins a room directly. A link cannot hold a form,
 * so the tile is a box whose title link is stretched over it, and the form
 * sits above that. Versus needs an account; the versus page and a room both
 * send a signed-out visitor to sign in.
 */
export function VersusTile() {
  return (
    <div
      className={`group relative isolate flex h-full w-full flex-col gap-4 overflow-hidden rounded-[26px] p-5 text-paper transition duration-150 hover:-translate-y-0.5 has-[a:active]:translate-y-[3px] has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-paper xl:min-h-[clamp(18rem,30dvh,22rem)] xl:gap-0 xl:p-7 bg-[linear-gradient(180deg,#2774ae,#1f6299_45%,#195385)] shadow-[inset_0_-2px_0_rgb(0_0_0/0.1),0_6px_0_#17507c,0_26px_44px_-14px_rgb(0_0_0/0.75)] has-[a:active]:shadow-[0_3px_0_#17507c,0_18px_30px_-14px_rgb(0_0_0/0.75)]`}
    >
      <TileDecor gold={false} icon={<SwordsIcon />} />
      <div className="flex items-center gap-4 xl:flex-col xl:items-stretch xl:gap-0">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-paper text-ucla-blue shadow-[0_6px_14px_-4px_rgb(6_24_43/0.6)]">
          <span className="h-9 w-9 [&>svg]:h-full [&>svg]:w-full">
            <SwordsIcon />
          </span>
        </span>
        <span className="min-w-0 flex-1 xl:mt-5 xl:flex-none">
          <Link href="/versus" className="heading block text-[2.4rem] leading-none outline-none after:absolute after:inset-0 after:content-[''] xl:text-[3.1rem]">
            {COPY.versus.title}
            <span className="sr-only">: {COPY.versus.cta}</span>
          </Link>
          <span className="mt-1.5 block font-semibold leading-snug md:text-[1.05rem] xl:mt-2 xl:text-lg">{COPY.versus.body}</span>
        </span>
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper text-ucla-blue transition-transform group-hover:translate-x-1 xl:hidden">
          <ArrowIcon className="h-5 w-5" />
        </span>
      </div>
      {/* Above the stretched link, so typing here does not open the versus page. */}
      <div className="relative z-10 xl:mt-auto xl:pt-5">
        <JoinCodeForm variant="tile" label="Have a code?" />
      </div>
    </div>
  );
}
