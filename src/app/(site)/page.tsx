import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampusHero } from "@/components/art/CampusScene";
import { EyeIcon, PinIcon, TargetIcon } from "@/components/art/icons";
import { SoloButton, VersusButton } from "@/components/home/PlayButton";
import RankDisc from "@/components/RankDisc";
import { formatPoints } from "@/lib/game/format";
import { currentPlayer, leaderboard } from "@/lib/server/profile";

const FEATURES = [
  { title: "Look", body: "A photo from somewhere on UCLA's campus. No street names, no hints.", icon: EyeIcon, chip: "bg-ucla-blue" },
  { title: "Pin", body: "Drop a pin on the campus map before the 30 seconds run out.", icon: PinIcon, chip: "bg-brick" },
  { title: "Score", body: "Up to 5,000 points a round. Land within 10 meters for a bullseye.", icon: TargetIcon, chip: "bg-green" },
];

export default function PlayPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="w-full pb-6">
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>

      {/* The headline sits in the scene's night sky; the tiles stand on its lawn. */}
      <section aria-labelledby="headline">
        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-2 text-center sm:px-6 sm:pt-4">
          <h1 id="headline" className="display text-[clamp(3.6rem,12vw,7rem)]">
            Know <span className="text-ucla-gold">UCLA?</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-sky sm:text-xl">Real Bruins know campus inside out. Five rounds to prove you actually go to class.</p>
        </div>
        <CampusHero className="-mt-[clamp(8px,4vw,56px)] h-[clamp(290px,38vw,540px)] w-full" />
      </section>

      <div className="relative mx-auto -mt-[clamp(28px,6vw,96px)] max-w-4xl px-4 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <Suspense fallback={<SoloButton needsUsername={false} />}>
            <Solo />
          </Suspense>
          <VersusButton />
        </div>
        <Suspense fallback={<p className="mt-3 h-5" />}>
          <GuestNote />
        </Suspense>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <ul className="mt-10 grid gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="panel flex gap-4 p-4 sm:block sm:p-5">
              <span className={`chip ${f.chip}`}>
                <f.icon />
              </span>
              <div>
                <h2 className="heading text-3xl sm:mt-3">{f.title}</h2>
                <p className="mt-1 text-sky">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <section className="mt-10" aria-labelledby="top-players">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="top-players" className="heading text-4xl">
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
    <p className="mt-3 text-center text-sm font-semibold text-sky">
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
    <p role="status" className="panel mx-auto mb-4 max-w-4xl !rounded-[14px] px-4 py-3 font-semibold">
      Your account and everything in it has been deleted.
    </p>
  );
}

async function TopPlayers() {
  // Read when the page is asked for, not when the site is built.
  await connection();
  const board = await leaderboard(null, 5, 0);
  if (!board.rows.length) {
    return <p className="panel mt-3 p-5 text-sky">No scores yet. Finish a game and you&rsquo;re first.</p>;
  }
  return (
    <ol className="mt-3 grid gap-2 md:grid-cols-5">
      {board.rows.map((row) => (
        <li key={row.rank}>
          <Link
            href={`/profile/${row.username}`}
            className={`panel flex items-center gap-3 !rounded-[16px] px-3 py-2.5 hover:border-sky md:flex-col md:items-start md:gap-2 ${row.rank === 1 ? "!border-ucla-gold" : ""}`}
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
