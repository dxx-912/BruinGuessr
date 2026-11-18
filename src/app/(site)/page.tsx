import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampusHero } from "@/components/art/CampusScene";
import { CrownIcon, EyeIcon, PinIcon, TargetIcon } from "@/components/art/icons";
import { SoloTile, VersusTile } from "@/components/home/PlayButton";
import RankDisc from "@/components/RankDisc";
import { formatPoints } from "@/lib/game/format";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { currentPlayer, leaderboard } from "@/lib/server/profile";

const STEPS = [
  { title: "Look", body: "A photo from somewhere on UCLA's campus. No street names, no hints.", icon: <EyeIcon />, chip: "bg-ucla-blue" },
  { title: "Pin", body: "Drop a pin on the campus map before the 30 seconds run out.", icon: <PinIcon />, chip: "bg-brick" },
  { title: "Score", body: "Up to 5,000 points a round. Land within 10 meters for a bullseye.", icon: <TargetIcon />, chip: "bg-green" },
];

/** How many players the Play page shows: a podium of three, then rows down to this rank. */
const TOP = 10;

/**
 * Where Royce sits in the wide hero, as CSS custom properties on the hero
 * (container query units, so it follows the hero's width, not the window's):
 * - `--f`: the share of the centred 72rem column the text takes;
 * - `--te`: where the text column ends, so where the scene may start;
 * - `--xl` / `--xw`: the window of the 1600-unit drawing to show, from its
 *   left edge and how wide. Both towers sit inside it with wing on each side,
 *   so the right tower is never cut: the window's right edge falls in the
 *   right wing, about a tower's width past it (the towers span x 583 to 1015).
 * - `--w` / `--h`: the drawing's size that puts exactly that window between
 *   the text and the right edge of the page;
 * - `--bl`: where the text column itself starts (the centred column plus its
 *   padding), since the scene is placed from inside it.
 * The scene hangs from the tiles, not from the hero's edge: the foot of
 * Royce's steps (y 598 of 720) is level with the bottom of the tiles, so the
 * building and the text stay together however tall the window is.
 */
const HERO_VARS =
  "[--f:0.47] xl:[--f:0.5] [--xl:430] [--xw:680] xl:[--xl:420] xl:[--xw:700] " +
  "[--te:calc((100cqw-min(100cqw,72rem))/2+min(100cqw,72rem)*var(--f))] " +
  "[--w:calc((100cqw-var(--te))*1600/var(--xw))] [--h:calc(var(--w)*0.45)] " +
  "[--bl:calc((100cqw-min(100cqw,72rem))/2+1.5rem)]";

/**
 * The drawing's sky, stop for stop down to the wings' roofline
 * (scripts/build-campus-scene.py, the `gold` grade), so Royce melts into it
 * without a seam. Lower down the drawing's sky is hidden behind the wings,
 * so here it is a softer afterglow than the drawing's, fading back to night.
 */
const SCENE_SKY =
  "linear-gradient(180deg,#06182b 0%,#0b2747 20%,#173f70 38.3%,#3a63a2 51.7%,#6c6ea8 61.7%,#9a7d95 72%,#4b4058 81%,#1a2a40 90%,#06182b 100%)";

/**
 * Both the drawing and its sky melt into the dusk around them: over their top
 * third, and over the last stretch of the walkway, so neither has an edge.
 */
const MELT_TOP = "linear-gradient(to bottom, transparent 0, #000 34%, #000 84%, transparent 100%)";

/** Royce dissolves into that sky on its left, from the start of the window over about 150 units. */
const SCENE_LEFT = "linear-gradient(to right, transparent calc(var(--xl) / 16 * 1%), #000 calc((var(--xl) + 150) / 16 * 1%))";
const SCENE_MASK = {
  WebkitMaskImage: `${SCENE_LEFT}, ${MELT_TOP}`,
  WebkitMaskComposite: "source-in",
  maskImage: `${SCENE_LEFT}, ${MELT_TOP}`,
  maskComposite: "intersect",
} as const;

/** The scene's own sky covers the right; from the text's end leftwards it gives way to the calmer blue under the text. */
const SKY_LEFT = "linear-gradient(to right, transparent calc(var(--te) - 1cqw), #000 calc(var(--te) + 7cqw))";
const SKY_MASK = {
  WebkitMaskImage: `${SKY_LEFT}, ${MELT_TOP}`,
  WebkitMaskComposite: "source-in",
  maskImage: `${SKY_LEFT}, ${MELT_TOP}`,
  maskComposite: "intersect",
} as const;

/** On a phone only the top melts into the page (the drawing fades out at the bottom by itself). */
const TOP_MASK = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
  maskImage: "linear-gradient(to bottom, transparent 0, #000 22%)",
} as const;

/**
 * The Play page (DESIGN.md "Play page"). From 768 px the hero fills the
 * screen under the header with its content centred: the headline, the line
 * under it and both tiles in a left column, Royce at golden hour on the right.
 * A dusk sky runs across the whole hero: the drawing's own sky behind Royce,
 * a calmer blue under the text, and a soft glow behind the headline. A phone
 * is too narrow to split: there the scene sits between the text and the tiles.
 */
export default function PlayPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="w-full overflow-x-clip pb-6">
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>

      <section
        aria-labelledby="headline"
        className={`@container relative md:flex md:min-h-[calc(100dvh-4.5rem-3.5rem-env(safe-area-inset-bottom))] md:items-center lg:min-h-[calc(100dvh-4.5rem)] ${HERO_VARS}`}
      >
        <HeroSky />

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="pt-3 sm:pt-6 md:max-w-[calc(var(--f)*100%)] md:pb-16 md:pt-8">
            <h1 id="headline" className="display text-[clamp(3.6rem,15cqw,5.25rem)] md:whitespace-nowrap md:text-[clamp(4.25rem,8.8cqw,7rem)]">
              Know <span className="text-ucla-gold">UCLA?</span>
            </h1>
            <p className="mt-3 max-w-lg text-lg leading-snug text-[#d5e4f5] sm:text-xl md:mt-4 md:text-[1.4rem] md:leading-snug">
              Real Bruins know campus inside out. Five rounds to prove you actually go to class.
            </p>

            {/* Phones: the scene between the text and the tiles, its empty sky tucked under the text. Its height
                follows the screen's, so on a short phone the Solo tile is still on the first screen. */}
            <div aria-hidden className="-mx-4 -mt-4 sm:-mx-6 md:hidden">
              <CampusHero className="h-[clamp(180px,34svh,300px)] w-full object-cover object-bottom" style={TOP_MASK} />
            </div>

            <div className="relative md:mt-[clamp(2.5rem,5dvh,4rem)]">
              <RoyceScene />
              <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
                <Suspense fallback={<SoloTile needsUsername={false} />}>
                  <Solo />
                </Suspense>
                <VersusTile />
              </div>
            </div>
            <Suspense fallback={<p className="mt-5 h-5" />}>
              <GuestNote />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* How it plays: three frosted cards over the foot of the scene */}
        <ol aria-label="How it plays" className="relative mt-10 grid gap-3 sm:grid-cols-3 sm:gap-4 md:mt-2">
          {STEPS.map((step) => (
            <li
              key={step.title}
              className="flex gap-4 rounded-[20px] border border-white/10 bg-[rgb(11_39_66/0.55)] p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_24px_40px_-24px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:block sm:p-6"
            >
              <span aria-hidden className={`chip ${step.chip}`}>
                {step.icon}
              </span>
              <div>
                <h2 className="heading text-[1.75rem] sm:mt-4">{step.title}</h2>
                <p className="mt-1 text-[#c4d9f0]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mx-auto mt-20 max-w-3xl" aria-labelledby="top-players">
          <div className="text-center">
            <h2 id="top-players" className="heading text-4xl sm:text-5xl">
              Top players
            </h2>
            <p className="mt-2 text-sky">Each player&rsquo;s best solo game.</p>
          </div>
          <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-[20px] bg-navy" />}>
            <TopPlayers />
          </Suspense>
          <p className="mt-7 text-center">
            <Link href="/leaderboard" className="btn-outline">
              Full leaderboard
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

/**
 * Behind the whole hero, from behind the header down: a blue dusk across the
 * full width with a glow behind the headline.
 */
function HeroSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 bottom-0 -z-10">
      {/* The dusk under the text: night at the top, a deep blue low down, back to night at the foot. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#06182b_0%,#0a2340_35%,#123663_72%,#06182b_100%)] max-md:bg-[linear-gradient(180deg,#06182b_0%,#0c2a4c_14%,#06182b_30%)]" />
      {/* The glow behind the headline: UCLA Blue, with a breath of gold where "UCLA?" sits. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_44cqw_30cqw_at_calc(var(--te)*0.42)_38%,rgb(39_116_174/0.42),transparent_70%),radial-gradient(ellipse_22cqw_14cqw_at_calc(var(--te)*0.62)_34%,rgb(255_209_0/0.09),transparent_70%)] max-md:bg-[radial-gradient(ellipse_70cqw_42cqw_at_40%_12%,rgb(39_116_174/0.42),transparent_70%)]" />
    </div>
  );
}

/**
 * From 768 px: the scene's sky across the full width, lined up with the
 * drawing, then Royce. Placed from the tiles' wrapper (see HERO_VARS), so the
 * foot of Royce's steps is level with the bottom of the tiles; the walkway
 * below it fades into the night under them.
 */
function RoyceScene() {
  return (
    <div aria-hidden className="pointer-events-none hidden md:block">
      <div
        className="absolute -z-10 bottom-[calc(var(--h)*-0.17)] left-[calc(var(--bl)*-1)] h-[var(--h)] w-[100cqw]"
        style={{ ...SKY_MASK, backgroundImage: SCENE_SKY }}
      />
      <div className="absolute -z-10 bottom-[calc(var(--h)*-0.17)] left-[calc(var(--te)-var(--bl)-var(--w)*var(--xl)/1600)] h-[var(--h)] w-[var(--w)]">
        <CampusHero className="h-full w-full" style={SCENE_MASK} />
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
    <p className="mt-6 font-semibold text-[#c4d9f0] md:text-[1.05rem]">
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

/** Podium faces: an enamel gradient, a solid lip, and the rank in night. */
const MEDAL: Record<1 | 2 | 3, { face: string; ring: string; height: string }> = {
  1: {
    face: "bg-[linear-gradient(180deg,#ffe066,#ffd100_40%,#f0c000)] shadow-[inset_0_2px_0_rgb(255_255_255/0.35),0_6px_0_#b38f00,0_0_60px_-12px_rgb(255_209_0/0.45)]",
    ring: "ring-ucla-gold",
    height: "h-32 sm:h-40",
  },
  2: {
    face: "bg-[linear-gradient(180deg,#eef3f8,#c9d6e2_45%,#b4c4d4)] shadow-[inset_0_2px_0_rgb(255_255_255/0.5),0_6px_0_#7d8fa3]",
    ring: "ring-silver",
    height: "h-24 sm:h-28",
  },
  3: {
    face: "bg-[linear-gradient(180deg,#f9b39c,#f28b6c_45%,#e2724f)] shadow-[inset_0_2px_0_rgb(255_255_255/0.3),0_6px_0_#b9472a]",
    ring: "ring-brick-light",
    height: "h-[4.5rem] sm:h-20",
  },
};

async function TopPlayers() {
  // Read when the page is asked for, not when the site is built.
  await connection();
  const player = await currentPlayer();
  const board = await leaderboard(player?.id ?? null, TOP, 0);
  const at = (rank: number) => board.rows.find((row) => row.rank === rank) ?? null;

  return (
    <>
      {/* Second, first, third: the winner in the middle and highest. */}
      <ol className="mt-10 grid grid-cols-3 items-end gap-2 sm:gap-4">
        {([2, 1, 3] as const).map((rank) => (
          <PodiumSpot key={rank} rank={rank} row={at(rank)} />
        ))}
      </ol>

      <ol className="mt-6 space-y-2 rounded-[22px] border border-white/10 bg-navy/70 p-2 sm:p-2.5">
        {Array.from({ length: TOP - 3 }, (_, i) => i + 4).map((rank) => {
          const row = at(rank);
          return (
            <li key={rank} value={rank}>
              <PlayerRow rank={rank} row={row} />
            </li>
          );
        })}
      </ol>
    </>
  );
}

function PodiumSpot({ rank, row }: { rank: 1 | 2 | 3; row: LeaderboardRow | null }) {
  const medal = MEDAL[rank];
  const first = rank === 1;
  const name = row ? row.username : "Your name here";
  const who = (
    <span className="flex flex-col items-center px-1 text-center">
      {first && <CrownIcon className="mb-1 h-7 w-7 text-ucla-gold" />}
      <span
        className={`display grid place-items-center rounded-full ring-4 ring-offset-4 ring-offset-night ${medal.ring} ${
          first ? "h-16 w-16 text-4xl sm:h-20 sm:w-20 sm:text-5xl" : "h-12 w-12 text-2xl sm:h-16 sm:w-16 sm:text-4xl"
        } ${row ? "bg-ucla-blue text-paper" : "border-2 border-dashed border-navy-line bg-night text-out !ring-0 !ring-offset-0"}`}
      >
        {row ? row.username[0] : "?"}
      </span>
      <span className={`mt-3 block w-full font-semibold ${row ? "truncate" : "text-balance leading-tight text-out"} ${first ? "sm:text-lg" : ""}`}>{name}</span>
      <span className={`display numeric block ${first ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl"} ${row ? "text-ucla-gold" : "text-out"}`}>
        {row ? formatPoints(row.score) : "—"}
      </span>
      {row?.isYou && <span className="mt-1 rounded-full bg-ucla-blue px-2 text-xs font-semibold">You</span>}
    </span>
  );
  return (
    <li value={rank} className="flex min-w-0 flex-col">
      {row ? (
        <Link href={`/profile/${row.username}`} className="group rounded-[14px] pb-1 focus-visible:outline-2 focus-visible:outline-paper">
          <span className="block transition-transform group-hover:-translate-y-1">{who}</span>
        </Link>
      ) : (
        who
      )}
      <div className={`mt-3 grid place-items-start justify-center rounded-t-[18px] pt-2 ${medal.height} ${medal.face}`}>
        <span className="display numeric text-5xl text-night/85 sm:text-6xl">{rank}</span>
        <span className="sr-only">{["", "1st", "2nd", "3rd"][rank]} place</span>
      </div>
    </li>
  );
}

function PlayerRow({ rank, row }: { rank: number; row: LeaderboardRow | null }) {
  const inner = (
    <>
      <RankDisc rank={rank} />
      <span className={`min-w-0 flex-1 truncate font-semibold ${row ? "" : "text-out"}`}>{row ? row.username : "Your name here"}</span>
      {row?.isYou && <span className="rounded-full bg-ucla-blue px-2 text-xs font-semibold">You</span>}
      <span className={`display numeric text-2xl ${row ? "text-ucla-gold" : "text-out"}`}>{row ? formatPoints(row.score) : "—"}</span>
    </>
  );
  const box = "flex items-center gap-3 rounded-[14px] border px-3 py-2.5 sm:px-4";
  if (!row) return <div className={`${box} border-dashed border-navy-line/70 bg-night/40`}>{inner}</div>;
  return (
    <Link
      href={`/profile/${row.username}`}
      className={`${box} transition-colors focus-visible:outline-2 focus-visible:outline-paper ${
        row.isYou ? "border-ucla-blue bg-ucla-blue/20 hover:bg-ucla-blue/30" : "border-navy-line bg-night/70 hover:border-sky/50 hover:bg-navy"
      }`}
    >
      {inner}
    </Link>
  );
}
