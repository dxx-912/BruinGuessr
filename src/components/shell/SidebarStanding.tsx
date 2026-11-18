import Link from "next/link";
import { TrophyIcon } from "@/components/art/icons";
import RankDisc from "@/components/RankDisc";
import { formatPoints } from "@/lib/game/format";
import { ordinal, pageOfRank } from "@/lib/leaderboard";
import { currentPlayer, leaderboard } from "@/lib/server/profile";

const CARD = "rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgb(39_116_174/0.18),rgb(6_24_43/0.55))] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]";

/**
 * The card at the foot of the side bar. Signed in: the player's best solo
 * game and where it stands on the leaderboard (or a nudge to finish one).
 * Signed out: what an account is for, and Sign up.
 */
export default async function SidebarStanding() {
  const player = await currentPlayer();

  if (!player) {
    return (
      <div className={CARD}>
        <p className="heading text-xl">Get on the board</p>
        <p className="mt-1 text-sm text-sky">Sign up to save your scores, climb the leaderboard and play versus.</p>
        <Link href="/login?mode=signup" className="btn btn-gold mt-4 w-full ![--lip:4px] !py-2.5 !text-lg">
          Sign up
        </Link>
      </div>
    );
  }

  const board = await leaderboard(player.id, 1, 0);
  const you = board.you;

  if (!you) {
    return (
      <div className={CARD}>
        <p className="flex items-center gap-2 text-sm font-semibold text-sky">
          <TrophyIcon className="h-4 w-4" /> Your best
        </p>
        <p className="heading mt-1 text-xl">No score yet</p>
        <p className="mt-1 text-sm text-sky">Finish a solo game to get your rank.</p>
      </div>
    );
  }

  return (
    <Link
      href={`/leaderboard?page=${pageOfRank(you.rank)}`}
      className={`${CARD} group block transition-colors hover:border-sky/40 focus-visible:outline-2 focus-visible:outline-paper`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-sky">
        <TrophyIcon className="h-4 w-4" /> Your best
      </p>
      <p className="display numeric mt-1 text-[2.4rem] text-ucla-gold">{formatPoints(you.score)}</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
        <RankDisc rank={you.rank} className="h-7 w-7 text-base" />
        <span>
          {ordinal(you.rank)} <span className="text-sky">of {formatPoints(board.total)}</span>
        </span>
        <span aria-hidden className="ml-auto text-sky transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </p>
    </Link>
  );
}

/** The same space while the session is read, so the side bar does not jump. */
export function SidebarStandingPlaceholder() {
  return <div className="h-36 animate-pulse rounded-[18px] bg-white/[0.04]" />;
}
