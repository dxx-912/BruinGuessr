import Link from "next/link";
import { Suspense } from "react";
import { CampusBackdrop } from "@/components/art/CampusScene";
import { TrophyIcon } from "@/components/art/icons";
import RankDisc from "@/components/RankDisc";
import { formatPoints } from "@/lib/game/format";
import { LEADERBOARD_MAX, LEADERBOARD_PAGE_SIZE, ordinal, pageOfRank, type LeaderboardRow } from "@/lib/leaderboard";
import { currentUser } from "@/lib/server/auth";
import { leaderboard } from "@/lib/server/profile";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Leaderboard",
  description: "The best BruinGuessr solo scores out of 25,000. One row per player: their best solo game.",
  path: "/leaderboard",
});

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <CampusBackdrop />
      <div className="text-center">
        <h1 className="display text-[clamp(3rem,10vw,5rem)]">
          Leader<span className="text-ucla-gold">board</span>
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sky">Every player&rsquo;s best solo game out of 25,000 points. Versus games don&rsquo;t count.</p>
      </div>

      <Suspense fallback={<div className="panel mt-8 h-96 animate-pulse" />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

const COLUMNS = "grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[3rem_1fr_8rem_6.5rem]";

function Row({ row }: { row: LeaderboardRow }) {
  return (
    <li className={`row ${COLUMNS} px-3 py-2.5 ${row.isYou ? "!border-ucla-blue !bg-ucla-blue" : row.rank === 1 ? "!border-ucla-gold/60" : ""}`}>
      <RankDisc rank={row.rank} />
      <span className="min-w-0 truncate text-lg font-semibold">
        <Link href={`/profile/${row.username}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
          {row.username}
        </Link>
        {row.isYou && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-night">You</span>}
      </span>
      <span className={`hidden text-sm sm:block ${row.isYou ? "text-paper" : "text-sky"}`}>{dateFormat.format(row.reachedAt)}</span>
      <span className={`display numeric text-right text-3xl ${row.isYou ? "text-paper" : "text-ucla-gold"}`}>{formatPoints(row.score)}</span>
    </li>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/leaderboard">["searchParams"] }) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const asked = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const lastPage = LEADERBOARD_MAX / LEADERBOARD_PAGE_SIZE;
  const page = Math.min(Math.max(1, asked), lastPage);
  const board = await leaderboard(user?.id ?? null, LEADERBOARD_PAGE_SIZE, (page - 1) * LEADERBOARD_PAGE_SIZE);
  const pages = Math.max(1, Math.min(lastPage, Math.ceil(board.total / LEADERBOARD_PAGE_SIZE)));
  const youOnPage = board.rows.some((r) => r.isYou);
  const youListed = board.you !== null && board.you.rank <= LEADERBOARD_MAX;

  if (board.total === 0) {
    return (
      <div className="panel mt-8 p-8 text-center">
        <p className="heading text-4xl">No scores yet</p>
        <p className="mt-2 text-sky">Finish a game and your score goes up here first.</p>
        <Link href="/" className="btn btn-gold mt-6">
          Play solo
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {user && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <span className="chip bg-ucla-blue">
            <TrophyIcon />
          </span>
          {board.you ? (
            <>
              <p className="flex-1 font-semibold">
                You&rsquo;re <span className="display text-3xl text-ucla-gold">{ordinal(board.you.rank)}</span> of {formatPoints(board.total)} with{" "}
                <span className="display numeric text-3xl">{formatPoints(board.you.score)}</span>
              </p>
              {!youOnPage && youListed && (
                <Link href={`/leaderboard?page=${pageOfRank(board.you.rank)}`} className="btn btn-quiet !py-2 !text-lg">
                  Show me
                </Link>
              )}
            </>
          ) : (
            <p className="flex-1 font-semibold text-sky">Finish a solo game to get on the board.</p>
          )}
        </div>
      )}

      <div className="panel p-2 sm:p-3">
        <div className={`${COLUMNS} px-3 pb-2 pt-1 text-sm font-semibold text-sky`}>
          <span>Rank</span>
          <span>Player</span>
          <span className="hidden sm:block">Reached</span>
          <span className="text-right">Best</span>
        </div>
        {board.rows.length ? (
          <ol className="space-y-1.5">
            {board.rows.map((row) => (
              <Row key={row.rank} row={row} />
            ))}
          </ol>
        ) : (
          <p className="px-3 py-6 text-sky">Nobody this far down yet.</p>
        )}
        {/* The player's own row, pinned under the page when it is somewhere else. */}
        {board.you && !youOnPage && (
          <ol className="mt-2 border-t-2 border-dashed border-navy-line pt-2" aria-label="Your rank">
            <Row row={board.you} />
          </ol>
        )}
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-4" aria-label="Leaderboard pages">
          {page > 1 ? (
            <Link href={`/leaderboard?page=${page - 1}`} className="btn btn-quiet !py-2 !text-lg">
              Previous
            </Link>
          ) : (
            <span className="btn btn-quiet pointer-events-none !py-2 !text-lg opacity-40" aria-hidden>
              Previous
            </span>
          )}
          <span className="text-sm font-semibold text-sky">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/leaderboard?page=${page + 1}`} className="btn btn-quiet !py-2 !text-lg">
              Next
            </Link>
          ) : (
            <span className="btn btn-quiet pointer-events-none !py-2 !text-lg opacity-40" aria-hidden>
              Next
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
