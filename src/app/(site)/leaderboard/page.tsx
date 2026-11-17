import Link from "next/link";
import { Suspense } from "react";
import { formatPoints } from "@/lib/game/format";
import { LEADERBOARD_PAGE_SIZE, ordinal, pageOfRank, type LeaderboardRow } from "@/lib/leaderboard";
import { currentUser } from "@/lib/server/auth";
import { leaderboard } from "@/lib/server/profile";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Leaderboard",
  description: "The best BruinGuessr scores out of 25,000. One row per player: their best game, solo or versus.",
  path: "/leaderboard",
});

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="display text-[clamp(3rem,10vw,5.5rem)]">
          Leader<span className="text-ucla-gold">board</span>
        </h1>
        <p className="mt-2 text-sky">Each player&rsquo;s best game out of 25,000. Equal scores go to whoever got there first.</p>

        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-[20px] bg-navy" />}>
          <Board searchParams={searchParams} />
        </Suspense>
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

function Row({ row }: { row: LeaderboardRow }) {
  const podium = row.rank <= 3;
  return (
    <li
      className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[4.5rem_1fr_8rem_auto] ${
        row.isYou ? "bg-ucla-blue" : "odd:bg-night/40"
      }`}
    >
      <span className={`display numeric text-3xl ${row.rank === 1 ? "text-ucla-gold" : podium ? "text-paper" : "text-sky"} ${row.isYou ? "!text-paper" : ""}`}>
        {row.rank}
      </span>
      <span className="min-w-0 truncate text-lg font-semibold">
        <Link href={`/profile/${row.username}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
          {row.username}
        </Link>
        {row.isYou && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-night">You</span>}
        {row.mode === "versus" && <span className="ml-2 text-xs font-semibold text-sky">versus</span>}
      </span>
      <span className={`hidden text-sm sm:block ${row.isYou ? "text-paper" : "text-sky"}`}>{dateFormat.format(row.reachedAt)}</span>
      <span className={`display numeric text-right text-3xl ${row.rank === 1 && !row.isYou ? "text-ucla-gold" : ""}`}>{formatPoints(row.score)}</span>
    </li>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/leaderboard">["searchParams"] }) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const asked = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const page = Math.max(1, asked);
  const board = await leaderboard(user?.id ?? null, LEADERBOARD_PAGE_SIZE, (page - 1) * LEADERBOARD_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(board.total / LEADERBOARD_PAGE_SIZE));
  const youOnPage = board.rows.some((r) => r.isYou);

  if (board.total === 0) {
    return (
      <div className="panel mt-8 !rounded-[20px] p-8 text-center">
        <p className="display text-4xl">No scores yet</p>
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
        <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 !rounded-[20px] px-5 py-4">
          {board.you ? (
            <>
              <p className="font-semibold">
                You&rsquo;re <span className="display text-3xl text-ucla-gold">{ordinal(board.you.rank)}</span> of {formatPoints(board.total)} with{" "}
                <span className="display numeric text-3xl">{formatPoints(board.you.score)}</span>
              </p>
              {!youOnPage && (
                <Link href={`/leaderboard?page=${pageOfRank(board.you.rank)}`} className="btn btn-quiet !py-2 !text-lg">
                  Show me
                </Link>
              )}
            </>
          ) : (
            <p className="font-semibold text-sky">Finish a game to get on the board.</p>
          )}
        </div>
      )}

      <div className="panel overflow-hidden !rounded-[20px] !p-0">
        <div className="grid grid-cols-[3.5rem_1fr_auto] gap-3 border-b-2 border-navy-line px-4 py-2 text-sm font-semibold text-sky sm:grid-cols-[4.5rem_1fr_8rem_auto]">
          <span>Rank</span>
          <span>Player</span>
          <span className="hidden sm:block">Reached</span>
          <span className="text-right">Best</span>
        </div>
        {board.rows.length ? (
          <ol>
            {board.rows.map((row) => (
              <Row key={row.rank} row={row} />
            ))}
          </ol>
        ) : (
          <p className="px-4 py-6 text-sky">Nobody this far down yet.</p>
        )}
        {/* The player's own row, pinned under the page when it is somewhere else. */}
        {board.you && !youOnPage && (
          <ol className="border-t-2 border-dashed border-navy-line" aria-label="Your rank">
            <Row row={board.you} />
          </ol>
        )}
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Leaderboard pages">
          {page > 1 ? (
            <Link href={`/leaderboard?page=${page - 1}`} className="btn btn-quiet !py-2 !text-lg">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm font-semibold text-sky">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/leaderboard?page=${page + 1}`} className="btn btn-quiet !py-2 !text-lg">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
