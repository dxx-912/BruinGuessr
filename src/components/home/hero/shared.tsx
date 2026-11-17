import Link from "next/link";
import { connection } from "next/server";
import RankDisc from "@/components/RankDisc";
import { formatPoints } from "@/lib/game/format";
import { currentPlayer, leaderboard } from "@/lib/server/profile";

/**
 * Pieces every hero variant on /dev/hero shares, so the variants differ only in
 * how they look. The copy is the live Play page's, word for word.
 */

export { COPY } from "./copy";

export type Grade = "blue" | "gold" | "night";

/** The relit campus scene (public/art/hero/royce-<grade>.svg, `npm run art:build`). Decorative. */
export function Scene({ grade, className = "", style }: { grade: Grade; className?: string; style?: React.CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG; next/image adds nothing for vector art
    <img src={`/art/hero/royce-${grade}.svg`} alt="" aria-hidden draggable={false} style={style} className={`pointer-events-none block select-none ${className}`} />
  );
}

/** Reads the session, then hands the Solo control whether the player still has to pick a username. */
export async function SoloSlot({ children }: { children: (needsUsername: boolean) => React.ReactNode }) {
  const player = await currentPlayer();
  return children(!!player && !player.username);
}

/** For visitors who are not signed in. */
export async function GuestNote({ className = "" }: { className?: string }) {
  if (await currentPlayer()) return null;
  return (
    <p className={`text-sm font-semibold text-sky ${className}`}>
      No account needed for solo: play as a guest.{" "}
      <Link href="/login?mode=signup" className="text-paper underline decoration-sky/60 decoration-2 underline-offset-4 hover:decoration-ucla-gold">
        Sign up
      </Link>{" "}
      to save your scores and play versus.
    </p>
  );
}

/** The top five, as on the live page but quieter: one panel of rows, gold only for the scores. */
export async function TopPlayers() {
  await connection();
  const board = await leaderboard(null, 5, 0);
  if (!board.rows.length) {
    return <p className="mt-3 rounded-[18px] border border-white/8 bg-navy/60 p-5 text-sky">No scores yet. Finish a game and you&rsquo;re first.</p>;
  }
  return (
    <ol className="mt-3 grid gap-2 md:grid-cols-5">
      {board.rows.map((row) => (
        <li key={row.rank}>
          <Link
            href={`/profile/${row.username}`}
            className="flex items-center gap-3 rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,#0e2d4d,#0a2440)] px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_10px_24px_-14px_rgb(0_0_0/0.8)] transition-colors hover:border-sky/50 md:flex-col md:items-start md:gap-2"
          >
            <RankDisc rank={row.rank} />
            <span className="min-w-0 flex-1 md:w-full">
              <span className="block truncate font-semibold">{row.username}</span>
              <span className="display numeric block text-xl text-ucla-gold">{formatPoints(row.score)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TopPlayersHeading() {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id="top-players" className="heading text-3xl sm:text-4xl">
        Top players
      </h2>
      <Link href="/leaderboard" className="font-semibold text-sky underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
        Full leaderboard
      </Link>
    </div>
  );
}
