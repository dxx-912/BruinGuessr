"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { SwordsIcon, TargetIcon } from "@/components/art/icons";
import { api, ApiError } from "@/lib/game/api";

const tile =
  "btn flex h-full min-h-44 w-full !flex-col !items-start !justify-between gap-4 !whitespace-normal !rounded-[24px] !p-6 text-left sm:min-h-52 sm:!p-7";

function TileText({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <>
      <span className="flex w-full items-start justify-between gap-3">
        <span className="text-6xl sm:text-7xl">{title}</span>
        <span className="h-11 w-11 shrink-0 opacity-80 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      </span>
      <span className="font-sans text-lg font-semibold normal-case not-italic leading-snug">{body}</span>
    </>
  );
}

/**
 * The Solo tile. Starts a solo game and goes to it: on the player's account
 * when signed in, as a guest when not.
 */
export function SoloButton({ needsUsername }: { needsUsername: boolean }) {
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

  return (
    <div className="h-full">
      <button type="button" className={`${tile} btn-gold`} onClick={start} disabled={starting} aria-busy={starting}>
        <TileText title={starting ? "Starting…" : "Solo"} body="See how high you can score on the leaderboard." icon={<TargetIcon />} />
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
export function VersusButton() {
  return (
    <Link href="/versus" className={`${tile} btn-blue`}>
      <TileText title="Versus" body="Join or host a lobby to play with friends!" icon={<SwordsIcon />} />
    </Link>
  );
}
