import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDistance, formatPoints } from "@/lib/game/format";
import { ordinal, pageOfRank } from "@/lib/leaderboard";
import { formatDay, placeLabel, type PlayerProfile, type ProfileGame } from "@/lib/profile";
import { currentUser } from "@/lib/server/auth";
import { playerProfile } from "@/lib/server/profile";

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default function ProfilePage({ params }: PageProps<"/profile/[username]">) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[20px] bg-navy" />}>
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

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel !rounded-[16px] px-4 py-3">
      <p className="text-sm font-semibold text-sky">{label}</p>
      <p className={`display numeric mt-1 text-4xl ${accent ? "text-ucla-gold" : ""}`}>{value}</p>
    </div>
  );
}

function ProfileView({ profile }: { profile: PlayerProfile }) {
  const { stats } = profile;
  const dash = "–";
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        {/* An initial, not the Google photo: profiles are public, and nobody chose to publish that photo. */}
        <span className="display grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-navy-line bg-ucla-blue text-5xl">
          {profile.username[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="display break-words text-[clamp(2.6rem,9vw,4.5rem)]">{profile.username}</h1>
          <p className="mt-1 font-semibold text-sky">
            Joined {formatDay(profile.joinedAt)}
            {profile.rank && (
              <>
                {" · "}
                <Link href={`/leaderboard?page=${pageOfRank(profile.rank)}`} className="text-paper underline decoration-sky decoration-2 underline-offset-4 hover:decoration-ucla-gold">
                  {ordinal(profile.rank)} on the leaderboard
                </Link>
              </>
            )}
          </p>
        </div>
        {profile.isYou && (
          <Link href="/settings" className="btn btn-quiet !text-base">
            Edit
          </Link>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Best game" value={stats.bestScore === null ? dash : formatPoints(stats.bestScore)} accent />
        <Stat label="Games played" value={formatPoints(stats.gamesPlayed)} />
        <Stat label="Average per round" value={stats.averageRound === null ? dash : formatPoints(stats.averageRound)} />
        <Stat label="Bullseyes" value={formatPoints(stats.bullseyes)} />
        <Stat label="Versus played" value={formatPoints(stats.versusPlayed)} />
        <Stat label="Versus won" value={formatPoints(stats.versusWon)} />
      </div>

      <h2 className="display mt-10 text-4xl">Recent games</h2>
      {profile.recent.length ? (
        <ol className="mt-3 space-y-2">
          {profile.recent.map((game, i) => (
            <RecentGame key={i} game={game} />
          ))}
        </ol>
      ) : (
        <div className="panel mt-3 !rounded-[20px] p-6 text-center">
          <p className="display text-3xl">No games yet</p>
          <p className="mt-1 text-sky">{profile.isYou ? "Finish a game and it shows up here." : `${profile.username} hasn't finished a game yet.`}</p>
          {profile.isYou && (
            <Link href="/" className="btn btn-gold mt-5">
              Play
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** One finished game. Opens to show its rounds: distance and points only, never where the photo was. */
function RecentGame({ game }: { game: ProfileGame }) {
  // A versus game has no fixed length: it shows where the player finished, not points out of a maximum.
  const max = game.roundCount === null ? null : game.roundCount * 5000;
  return (
    <li>
      <details className="panel group !rounded-[16px]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-sky transition-transform group-open:rotate-90" aria-hidden>
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {game.mode === "versus" ? "Versus" : "Solo"}
              {game.mode === "versus" && game.place && game.players && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${game.place === 1 ? "bg-ucla-gold text-night" : "bg-navy-line text-paper"}`}>
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
            <span className="display numeric text-3xl">
              {formatPoints(game.total)}
              <span className="ml-1 font-sans text-sm font-semibold normal-case not-italic text-sky">/ {formatPoints(max)}</span>
            </span>
          )}
        </summary>
        <ol className="border-t-2 border-navy-line px-4 py-2">
          {game.rounds.map((r) => (
            <li key={r.round} className="flex items-center justify-between gap-3 py-1.5">
              <span className="font-semibold">Round {r.round}</span>
              <span className="flex-1 text-right text-sky">{r.distanceM === null ? "No guess" : `${formatDistance(r.distanceM)} away`}</span>
              <span className={`display numeric w-20 text-right text-2xl ${r.score >= 5000 ? "text-ucla-gold" : ""}`}>{formatPoints(r.score)}</span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
