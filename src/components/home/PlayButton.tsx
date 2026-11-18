"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { ArrowIcon, SwordsIcon, TargetIcon } from "@/components/art/icons";
import { api, ApiError } from "@/lib/game/api";

/**
 * The Solo and Versus tiles on the Play page, glazed like enamel pins: a
 * gradient face, a sheen across the top, a solid lip and a soft shadow. Each
 * tile is the control as a whole. Below 1280 px (where the left column is
 * narrow) a tile is a compact row: icon disc, title and sentence, arrow. From
 * 1280 px it stands tall, with the call to action along the bottom.
 */
const TILE =
  "group relative flex h-full w-full flex-row items-center gap-4 overflow-hidden rounded-[26px] p-5 text-left transition duration-150 " +
  "xl:min-h-[18rem] xl:flex-col xl:items-stretch xl:gap-0 xl:p-7 hover:-translate-y-0.5 active:translate-y-[3px] " +
  "focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-paper disabled:cursor-wait";

const COPY = {
  solo: { title: "Solo", body: "See how high you can score on the leaderboard.", cta: "Play now" },
  versus: { title: "Versus", body: "Join or host a lobby to play with friends!", cta: "Host or join" },
};

function TileBody({ gold, title, body, cta, icon }: { gold: boolean; title: string; body: string; cta: string; icon: React.ReactNode }) {
  const disc = gold ? "bg-night text-ucla-gold" : "bg-paper text-ucla-blue";
  return (
    <>
      {/* The icon again, large and faint, running off the corner */}
      <span aria-hidden className={`pointer-events-none absolute -bottom-12 -right-10 h-52 w-52 xl:h-60 xl:w-60 rotate-[-12deg] [&>svg]:h-full [&>svg]:w-full ${gold ? "text-night/10" : "text-paper/[0.06]"}`}>
        {icon}
      </span>
      {/* A sheen across the top, as on a glazed pin */}
      <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-1/2 ${gold ? "bg-[linear-gradient(180deg,rgb(255_255_255/0.22),transparent)]" : "bg-[linear-gradient(180deg,rgb(255_255_255/0.12),transparent)]"}`} />
      <span className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full shadow-[0_6px_14px_-4px_rgb(6_24_43/0.6)] ${disc}`}>
        <span className="h-9 w-9 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      </span>
      <span className="relative min-w-0 flex-1 xl:mt-5 xl:flex-none">
        <span className="heading block text-[2.4rem] leading-none xl:text-[3.1rem]">{title}</span>
        <span className={`mt-1.5 block font-semibold leading-snug md:text-[1.05rem] xl:mt-2 xl:text-lg ${gold ? "text-night/85" : "text-paper"}`}>{body}</span>
      </span>
      <span className="relative mt-auto hidden items-center justify-between pt-6 xl:flex">
        <span className="font-display text-xl font-bold uppercase tracking-[0.04em]">{cta}</span>
        <span className={`grid h-12 w-12 place-items-center rounded-full transition-transform group-hover:translate-x-1 ${disc}`}>
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

/**
 * Starting a solo game: on the player's account when signed in, as a guest when not.
 */
function useSoloStart(needsUsername: boolean) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<React.ReactNode>(null);

  // Next.js keeps this page's state while the player is in the game. Coming back with the
  // Back button, the button must be ready again, not still starting.
  useLayoutEffect(() => () => setStarting(false), []);

  const start = async () => {
    if (needsUsername) return router.push("/welcome");
    setStarting(true);
    setProblem(null);
    try {
      const game = await api.newGame();
      router.push(`/game/${game.id}`);
    } catch (err) {
      setStarting(false);
      const code = err instanceof ApiError ? err.code : "server_error";
      if (code === "no_username") router.push("/welcome");
      else if (code === "rate_limited")
        setProblem(
          <>
            That&rsquo;s a lot of guest games from here.{" "}
            <Link href="/login?mode=signup" className="underline">
              Sign up
            </Link>{" "}
            to keep playing, or try again in a little while.
          </>,
        );
      else setProblem(code === "network" ? "No connection. Check your internet and try again." : "The game could not start. Try again in a moment.");
    }
  };

  return { start, starting, problem };
}

/** The Solo tile. Starts a solo game and goes to it. */
export function SoloTile({ needsUsername }: { needsUsername: boolean }) {
  const { start, starting, problem } = useSoloStart(needsUsername);
  return (
    <div className="h-full">
      <button
        type="button"
        onClick={start}
        disabled={starting}
        aria-busy={starting}
        className={`${TILE} cursor-pointer bg-[linear-gradient(180deg,#ffdf4d,#ffd100_45%,#f2c200)] text-night shadow-[inset_0_-2px_0_rgb(0_0_0/0.08),0_6px_0_#b38f00,0_26px_44px_-14px_rgb(0_0_0/0.75),0_0_60px_-10px_rgb(255_209_0/0.35)] active:shadow-[0_3px_0_#b38f00,0_18px_30px_-14px_rgb(0_0_0/0.75)]`}
      >
        <TileBody gold title={starting ? "Starting…" : COPY.solo.title} body={COPY.solo.body} cta={COPY.solo.cta} icon={<TargetIcon />} />
      </button>
      {problem && (
        <p role="alert" className="mt-2 font-semibold text-alarm">
          {problem}
        </p>
      )}
    </div>
  );
}

/** The Versus tile. Versus needs an account; the versus page sends a signed-out visitor to sign in. */
export function VersusTile() {
  return (
    <Link
      href="/versus"
      className={`${TILE} bg-[linear-gradient(180deg,#2774ae,#1f6299_45%,#195385)] text-paper shadow-[inset_0_-2px_0_rgb(0_0_0/0.1),0_6px_0_#17507c,0_26px_44px_-14px_rgb(0_0_0/0.75)] active:shadow-[0_3px_0_#17507c,0_18px_30px_-14px_rgb(0_0_0/0.75)]`}
    >
      <TileBody gold={false} title={COPY.versus.title} body={COPY.versus.body} cta={COPY.versus.cta} icon={<SwordsIcon />} />
    </Link>
  );
}
