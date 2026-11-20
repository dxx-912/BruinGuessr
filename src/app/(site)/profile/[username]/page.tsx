import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CampusBackdrop } from "@/components/art/CampusScene";
import { CrownIcon, GamesIcon, SwordsIcon, TargetIcon, TrophyIcon } from "@/components/art/icons";
import { formatDistance, formatPoints } from "@/lib/game/format";
import { scoreTone, TONE_TEXT } from "@/lib/game/tone";
import { ordinal } from "@/lib/leaderboard";
import { formatDay, placeLabel, type PlayerProfile, type ProfileGame } from "@/lib/profile";
import { currentUser } from "@/lib/server/auth";
import { playerProfile } from "@/lib/server/profile";

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default function ProfilePage({ params }: PageProps<"/profile/[username]">) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <CampusBackdrop />
      <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
        <Profile params={params} />
      </Suspense>
    </section>
  );
}

async function Profile({ params }: { params: PageProps<"/profile/[username]">["params"] }) {
  const { username } = await params;
  if (!USERNAME.test(username)) notFound();
  const viewer = await currentUser();
  const profile = await playerProfile(username, viewer?.id ?? null);
  if (!profile) notFound();
  return <ProfileView profile={profile} />;
}

function Stat({ label, value, icon, chip, accent = false }: { label: string; value: string; icon: React.ReactNode; chip: string; accent?: boolean }) {
  return (
    <div className="row flex flex-col items-start gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
      <span className={`chip !h-10 !w-10 ${chip}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-sky">{label}</p>
        <p className={`display numeric mt-0.5 text-3xl ${accent ? "text-ucla-gold" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

/** Average points per round as a ring out of 5,000, coloured like a round of that score. */
function AverageRing({ average }: { average: number | null }) {
  const share = average === null ? 0 : Math.min(1, average / 5000);
  const r = 42;
  const length = 2 * Math.PI * r;
  return (
    <div className="row flex items-center gap-4 px-4 py-3 md:flex-col md:justify-center md:gap-2 md:py-4">
      <div className={`relative h-24 w-24 shrink-0 ${TONE_TEXT[scoreTone(average ?? 0, average !== null)]}`}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-navy-line" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${share * length} ${length}`} />
        </svg>
        <span className="display numeric absolute inset-0 grid place-items-center text-2xl text-paper">{average === null ? "–" : `${Math.round(share * 100)}%`}</span>
      </div>
      <div className="md:text-center">
        <p className="text-sm font-semibold text-sky">Average per round</p>
        <p className="display numeric text-2xl">{average === null ? "No games yet" : `${formatPoints(average)} / 5,000`}</p>
      </div>
    </div>
  );
}

function ProfileView({ profile }: { profile: PlayerProfile }) {
  const { stats } = profile;
  const dash = "–";
  return (
    <>
      <div className="panel grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_13rem]">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            {/* An initial, not the Google photo: profiles are public, and nobody chose to publish that photo. */}
            <span className="display grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-navy-line bg-ucla-blue text-5xl">
              {profile.username[0]}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="display break-words text-[clamp(2.4rem,8vw,3.75rem)]">{profile.username}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold">
                {profile.rank ? (
                  <Link
                    href={`/leaderboard`}
                    className="rounded-full border-2 border-ucla-gold/70 bg-ucla-gold/10 px-2.5 py-0.5 text-ucla-gold hover:bg-ucla-gold hover:text-night"
                  >
                    {ordinal(profile.rank)} on the leaderboard
                  </Link>
                ) : (
                  <span className="rounded-full border-2 border-navy-line px-2.5 py-0.5 text-sky">Not on the leaderboard yet</span>
                )}
                <span className="text-sky">Joined {formatDay(profile.joinedAt)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Best game" value={stats.bestScore === null ? dash : formatPoints(stats.bestScore)} icon={<TrophyIcon />} chip="bg-ucla-gold !text-night" accent />
            <Stat label="Games played" value={formatPoints(stats.gamesPlayed)} icon={<GamesIcon />} chip="bg-ucla-blue" />
          </div>
        </div>
        <AverageRing average={stats.averageRound} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Bullseyes" value={formatPoints(stats.bullseyes)} icon={<TargetIcon />} chip="bg-green" />
        <Stat label="Versus played" value={formatPoints(stats.versusPlayed)} icon={<SwordsIcon />} chip="bg-brick" />
        <Stat label="Versus won" value={formatPoints(stats.versusWon)} icon={<CrownIcon />} chip="bg-ucla-gold !text-night" />
      </div>

      <div className="panel mt-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 border-b-2 border-navy-line px-1 pb-3">
          <h2 className="heading text-3xl">Recent games</h2>
          {profile.isYou && (
            <Link href="/settings" className="btn-outline">
              Settings
            </Link>
          )}
        </div>
        {profile.recent.length ? (
          <ol className="mt-3 space-y-1.5">
            {profile.recent.map((game, i) => (
              <RecentGame key={i} game={game} />
            ))}
          </ol>
        ) : (
          <div className="px-1 py-6 text-center">
            <p className="heading text-3xl">No games yet</p>
            <p className="mt-1 text-sky">{profile.isYou ? "Finish a game and it shows up here." : `${profile.username} hasn't finished a game yet.`}</p>
            {profile.isYou && (
              <Link href="/" className="btn btn-gold mt-5">
                Play
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** One finished game. Opens to show its rounds: distance and points only, never where the photo was. */
function RecentGame({ game }: { game: ProfileGame }) {
  // A versus game has no fixed length: it shows where the player finished, not points out of a maximum.
  const max = game.roundCount === null ? null : game.roundCount * 5000;
  return (
    <li>
      <details className="row group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-sky transition-transform group-open:rotate-90" aria-hidden>
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {game.mode === "versus" ? "Versus" : "Solo"}
              {game.mode === "versus" && game.place && game.players && (
                <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${game.place === 1 ? "bg-ucla-gold text-night" : "bg-navy-line text-paper"}`}>
                  {placeLabel(game.place, game.players)}
                </span>
              )}
            </span>
            <span className="block text-sm text-sky">{formatDay(game.completedAt)}</span>
          </span>
          {max === null ? (
            <span className="text-right text-sm font-semibold text-sky">
              {game.rounds.length} {game.rounds.length === 1 ? "round" : "rounds"}
            </span>
          ) : (
            <span className="display numeric text-3xl text-ucla-gold">
              {formatPoints(game.total)}
              <span className="ml-1 font-sans text-sm font-semibold normal-case not-italic text-sky">/ {formatPoints(max)}</span>
            </span>
          )}
        </summary>
        <ol className="border-t border-navy-line px-4 py-2">
          {game.rounds.map((r) => (
            <li key={r.round} className="flex items-center justify-between gap-3 py-1.5">
              <span className="font-semibold">Round {r.round}</span>
              <span className="flex-1 text-right text-sky">{r.distanceM === null ? "No guess" : `${formatDistance(r.distanceM)} away`}</span>
              <span className={`display numeric w-20 text-right text-2xl ${TONE_TEXT[scoreTone(r.score, r.distanceM !== null)]}`}>{formatPoints(r.score)}</span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
