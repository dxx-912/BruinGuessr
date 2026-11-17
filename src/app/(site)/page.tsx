import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampusHero } from "@/components/art/CampusScene";
import { SoloTile, VersusTile } from "@/components/home/PlayButton";
import RankDisc from "@/components/RankDisc";
import { formatPoints } from "@/lib/game/format";
import { currentPlayer, leaderboard } from "@/lib/server/profile";

const STEPS = [
  { title: "Look", body: "A photo from somewhere on UCLA's campus. No street names, no hints." },
  { title: "Pin", body: "Drop a pin on the campus map before the 30 seconds run out." },
  { title: "Score", body: "Up to 5,000 points a round. Land within 10 meters for a bullseye." },
];

/** Royce's left side and top dissolve into the page, so the scene has no edge on the text's side. */
const SIDE_MASK = {
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 18%), linear-gradient(to bottom, transparent 0, #000 16%)",
  WebkitMaskComposite: "source-in",
  maskImage: "linear-gradient(to right, transparent 0%, #000 18%), linear-gradient(to bottom, transparent 0, #000 16%)",
  maskComposite: "intersect",
} as const;

/** On a phone only the top melts into the page (the drawing fades out at the bottom by itself). */
const TOP_MASK = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
  maskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
} as const;

/**
 * The Play page (DESIGN.md "Play page"). From 768 px the headline, the line
 * under it and both tiles stand in a left column, and Royce at golden hour
 * fills the right as part of the background, its left side dissolving into
 * the night. The scene's left edge starts where the text column ends (46% of
 * the centred 72rem column, in container units), and it is never taller than
 * 4:5, so narrower screens get a shorter scene instead of losing a tower. A
 * phone is too narrow to split: there the scene sits between the text and
 * the tiles.
 */
export default function PlayPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="w-full overflow-x-clip pb-6">
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>

      <section aria-labelledby="headline" className="@container relative md:min-h-[clamp(540px,calc(100dvh-5rem),720px)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 bottom-0 left-[calc((100cqw-min(100cqw,72rem))/2+min(100cqw,72rem)*0.46)] right-0 -z-10 hidden md:block"
        >
          <div className="absolute bottom-0 right-0 aspect-[4/5] max-h-full w-full">
            <CampusHero className="h-full w-full object-cover object-[47%_100%]" style={SIDE_MASK} />
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pt-3 sm:pt-6 md:max-w-[44%] md:pt-[clamp(28px,6vh,64px)]">
            <h1 id="headline" className="display text-[clamp(3.6rem,13vw,5rem)] md:text-[clamp(3.4rem,6.4vw,6rem)]">
              Know <span className="text-ucla-gold">UCLA?</span>
            </h1>
            <p className="mt-3 max-w-md text-lg leading-snug text-[#cfe0f4] sm:text-xl">
              Real Bruins know campus inside out. Five rounds to prove you actually go to class.
            </p>

            {/* Phones: the scene between the text and the tiles, its empty sky tucked under the text. Its height
                follows the screen's, so on a short phone the Solo tile is still on the first screen. */}
            <div aria-hidden className="-mx-4 -mt-4 sm:-mx-6 md:hidden">
              <CampusHero className="h-[clamp(180px,34svh,300px)] w-full object-cover object-bottom" style={TOP_MASK} />
            </div>

            <div className="grid gap-4 md:mt-8 xl:grid-cols-2 xl:gap-5">
              <Suspense fallback={<SoloTile needsUsername={false} />}>
                <Solo />
              </Suspense>
              <VersusTile />
            </div>
            <Suspense fallback={<p className="mt-5 h-5" />}>
              <GuestNote />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* How it plays: three numbered steps on one hairline */}
        <ol className="mt-14 grid border-t border-white/10 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 border-b border-white/10 py-5 sm:block sm:border-b-0 sm:py-6 sm:pr-6 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:pl-6">
              <span aria-hidden className="display numeric text-5xl leading-none text-ucla-gold/90">
                {i + 1}
              </span>
              <div>
                <h2 className="heading text-[1.75rem] sm:mt-3">{step.title}</h2>
                <p className="mt-1 text-sky">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12" aria-labelledby="top-players">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="top-players" className="heading text-3xl sm:text-4xl">
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
  return <SoloTile needsUsername={!!player && !player.username} />;
}

/** Under the tiles, for visitors who are not signed in. */
async function GuestNote() {
  if (await currentPlayer()) return null;
  return (
    <p className="mt-5 text-sm font-semibold text-sky">
      No account needed for solo: play as a guest.{" "}
      <Link href="/login?mode=signup" className="text-paper underline decoration-sky/60 decoration-2 underline-offset-4 hover:decoration-ucla-gold">
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
    <div className="mx-auto mb-4 max-w-6xl px-4 sm:px-6">
      <p role="status" className="panel !rounded-[14px] px-4 py-3 font-semibold">
        Your account and everything in it has been deleted.
      </p>
    </div>
  );
}

async function TopPlayers() {
  // Read when the page is asked for, not when the site is built.
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
