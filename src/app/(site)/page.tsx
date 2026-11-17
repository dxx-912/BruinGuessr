import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SoloButton, VersusButton } from "@/components/home/PlayButton";
import { formatPoints } from "@/lib/game/format";
import { currentPlayer, leaderboard } from "@/lib/server/profile";

const FEATURES = [
  { title: "Look", body: "A photo from somewhere on UCLA's campus. No street names, no hints." },
  { title: "Pin", body: "Drop a pin on the campus map before the 30 seconds run out." },
  { title: "Score", body: "Up to 5,000 points a round. Land within 10 meters for a bullseye." },
];

export default function PlayPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-6 pt-6 sm:px-6 sm:pt-10">
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>

      <h1 className="display text-[clamp(3.6rem,12vw,7rem)]">
        Know <span className="text-ucla-gold">UCLA?</span>
      </h1>
      <p className="mt-3 max-w-2xl text-xl text-sky">Real Bruins know campus inside out. Five rounds to prove you actually go to class.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-5">
        <Suspense fallback={<SoloButton needsUsername={false} />}>
          <Solo />
        </Suspense>
        <VersusButton />
      </div>
      <Suspense fallback={<p className="mt-3 h-5" />}>
        <GuestNote />
      </Suspense>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <li key={f.title} className="panel flex gap-3 !rounded-[20px] p-4">
            <span className="display text-5xl text-ucla-blue">{i + 1}</span>
            <div>
              <h2 className="display text-3xl">{f.title}</h2>
              <p className="mt-1 text-sky">{f.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-10" aria-labelledby="top-players">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="top-players" className="display text-4xl">
            Top players
          </h2>
          <Link href="/leaderboard" className="font-semibold text-sky underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
            Full leaderboard
          </Link>
        </div>
        <Suspense fallback={<div className="mt-3 h-20 animate-pulse rounded-[20px] bg-navy" />}>
          <TopPlayers />
        </Suspense>
      </section>
    </div>
  );
}

async function Solo() {
  const player = await currentPlayer();
  return <SoloButton needsUsername={!!player && !player.username} />;
}

/** Under the tiles, for visitors who are not signed in. */
async function GuestNote() {
  if (await currentPlayer()) return null;
  return (
    <p className="mt-3 text-sm font-semibold text-sky">
      No account needed for solo: play as a guest.{" "}
      <Link href="/login?mode=signup" className="text-paper underline decoration-sky decoration-2 underline-offset-4 hover:decoration-ucla-gold">
        Sign up
      </Link>{" "}
      to save your scores and play versus.
    </p>
  );
}

async function Notice({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const query = await searchParams;
  if (query.deleted !== "1") return null;
  return (
    <p role="status" className="panel mb-6 !rounded-[14px] px-4 py-3 font-semibold">
      Your account and everything in it has been deleted.
    </p>
  );
}

async function TopPlayers() {
  // Read when the page is asked for, not when the site is built.
  await connection();
  const board = await leaderboard(null, 5, 0);
  if (!board.rows.length) {
    return <p className="panel mt-3 !rounded-[20px] p-5 text-sky">No scores yet. Finish a game and you&rsquo;re first.</p>;
  }
  return (
    <ol className="mt-3 grid gap-2 sm:grid-cols-5">
      {board.rows.map((row) => (
        <li key={row.rank}>
          <Link href={`/profile/${row.username}`} className="panel flex items-center gap-3 !rounded-[16px] px-3 py-2.5 hover:border-sky sm:flex-col sm:items-start sm:gap-1">
            <span className={`display numeric text-3xl ${row.rank === 1 ? "text-ucla-gold" : "text-sky"}`}>{row.rank}</span>
            <span className="min-w-0 flex-1 truncate font-semibold sm:w-full">{row.username}</span>
            <span className="display numeric text-2xl">{formatPoints(row.score)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
