"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ordinal, pageOfRank, type Leaderboard } from "@/lib/leaderboard";
import { formatDistance, formatPoints, gameVerdict } from "@/lib/game/format";
import { maxTotal, type GameState } from "@/lib/game/types";
import { rankOf, SeatBadge } from "@/components/versus/SeatBadge";
import CountUp from "./CountUp";

type Props = {
  state: GameState;
  photos: Record<number, string>;
  focus: number | null;
  onFocus: (round: number | null) => void;
  onOpenPhoto: (round: number) => void;
  /** "Play again" in a solo game; "Rematch" in a versus game. */
  onPlayAgain: () => void;
  /** Versus: going home also tells the room. Without it, Home is a plain link. */
  onHome?: () => void;
  busy: boolean;
};

type Standing = { you: Leaderboard["you"]; total: number };

/** Where this game leaves the player on the leaderboard. Quietly absent if it can't be fetched. */
function StandingLine({ gameId }: { gameId: string }) {
  const [standing, setStanding] = useState<Standing | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/standing", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Standing>) : null))
      .then((data) => live && data && setStanding(data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [gameId]);

  const you = standing?.you;
  if (!you) return <div className="mt-3 h-7" />;
  const best = you.gameId === gameId;
  return (
    <p className="mt-3 flex min-h-7 animate-rise flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
      {best ? (
        <span className="display rounded-full bg-ucla-gold px-3 py-0.5 text-lg text-night">New personal best</span>
      ) : (
        <span className="text-sky">Your best: {formatPoints(you.score)}.</span>
      )}
      <Link href={`/leaderboard?page=${pageOfRank(you.rank)}`} className="text-paper underline decoration-sky decoration-2 underline-offset-4 hover:decoration-ucla-gold">
        {ordinal(you.rank)} of {formatPoints(standing.total)} on the leaderboard
      </Link>
    </p>
  );
}

/** A versus game's last word: everyone's total, best first. */
function Standings({ versus }: { versus: NonNullable<GameState["versus"]> }) {
  const totals = versus.players.map((p) => p.total);
  const rows = [...versus.players].sort((a, b) => b.total - a.total || a.seat - b.seat);
  return (
    <section className="px-2 pb-1 pt-2">
      <h2 className="px-2 text-sm font-semibold text-sky">Final standings</h2>
      <ol className="mt-1">
        {rows.map((p) => {
          const rank = rankOf(p.total, totals);
          return (
            <li key={p.seat} className={`flex items-center gap-3 rounded-xl border-2 px-2 py-1.5 ${rank === 1 ? "border-ucla-gold" : "border-transparent"} ${p.isYou ? "bg-navy-line" : ""}`}>
              <span className={`display numeric w-6 text-center text-2xl ${rank === 1 ? "text-ucla-gold" : "text-sky"}`}>{rank}</span>
              <SeatBadge seat={p.seat} name={p.username} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {p.username}
                {p.isYou && <span className="ml-1 font-medium text-sky">(you)</span>}
              </span>
              {rank === 1 && <span className="display rounded-full bg-ucla-gold px-2.5 py-0.5 text-base text-night">Winner</span>}
              <span className="display numeric text-3xl text-paper">{formatPoints(p.total)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Under the standings: can this group play again, and who is already waiting? */
function rematchNote(versus: NonNullable<GameState["versus"]>): string {
  const { state, ready } = versus.rematch;
  if (state === "started") return "The rematch started without you. You can host a new room.";
  if (state === "closed") return "This room has closed. You can host a new one.";
  if (ready === 0) return "Same room, same players, five new photos.";
  return `${ready} of ${versus.players.length} ${ready === 1 ? "is" : "are"} back in the lobby for a rematch.`;
}

/** After round five: every round side by side, the total, and "Play again". In a versus game, the final standings and "Rematch". */
export default function SummaryPanel({ state, photos, focus, onFocus, onOpenPhoto, onPlayAgain, onHome, busy }: Props) {
  const max = maxTotal(state);
  const versus = state.versus;
  const totals = versus?.players.map((p) => p.total) ?? [];
  const rank = versus ? rankOf(state.totalScore, totals) : 0;
  const verdict = !versus
    ? gameVerdict(state.totalScore, max)
    : rank === 1
      ? totals.filter((t) => t === state.totalScore).length > 1
        ? "Tied for first"
        : "You won the room"
      : `${ordinal(rank)} of ${totals.length} in the room`;
  const canRematch = versus?.rematch.state === "open";
  return (
    <section className="absolute inset-x-0 bottom-0 z-30 flex h-[60%] animate-rise flex-col border-t-2 border-navy-line bg-navy md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[28rem] md:border-l-2 md:border-t-0">
      <div className={`border-b-2 border-navy-line px-5 ${versus ? "pb-3 pt-4 md:pb-4 md:pt-5" : "pb-4 pt-5"}`}>
        <p className="text-sm font-semibold text-sky">{verdict}</p>
        {/* On a phone a versus summary also has to fit the standings, so the total is smaller there. */}
        <h1 className={`display mt-1 text-ucla-gold md:text-7xl ${versus ? "text-5xl" : "text-6xl"}`}>
          <CountUp value={state.totalScore} durationMs={1400} />
        </h1>
        <p className="mt-1 font-semibold text-sky">out of {formatPoints(max)} points</p>
        {state.status === "completed" && <StandingLine gameId={state.id} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {versus && <Standings versus={versus} />}
        {versus && <h2 className="px-4 pt-2 text-sm font-semibold text-sky">Your rounds</h2>}
        <ol className="px-3 py-2" onMouseLeave={() => onFocus(null)}>
          {state.results.map((r) => {
            const photo = photos[r.round];
            return (
              <li key={r.round}>
                <div
                  className={`flex items-center gap-3 rounded-xl px-2 py-2 ${focus === r.round ? "bg-navy-line" : ""}`}
                  onMouseEnter={() => onFocus(r.round)}
                >
                  <button
                    type="button"
                    onClick={() => (photo ? onOpenPhoto(r.round) : onFocus(focus === r.round ? null : r.round))}
                    aria-label={photo ? `Look at the photo from round ${r.round}` : `Show round ${r.round} on the map`}
                    className={`display grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-navy-line bg-night text-2xl text-sky ${photo ? "cursor-zoom-in" : "cursor-pointer"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob */}
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : r.round}
                  </button>
                  <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => onFocus(focus === r.round ? null : r.round)}>
                    <p className="font-semibold">Round {r.round}</p>
                    <p className="truncate text-sm text-sky">
                      {r.guess && r.distanceM !== null ? `${formatDistance(r.distanceM)} away` : "No guess"} · {r.credit.photographer}
                    </p>
                  </button>
                  <p className={`display numeric text-3xl ${r.score >= 5000 ? "text-ucla-gold" : "text-paper"}`}>{formatPoints(r.score)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t-2 border-navy-line px-5 pb-4 pt-3">
        {versus && <p className="mb-2.5 text-sm font-semibold text-sky">{rematchNote(versus)}</p>}
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-gold flex-1" onClick={onPlayAgain} disabled={busy} autoFocus>
            {busy ? "Starting…" : !versus ? "Play again" : canRematch ? "Rematch" : "New room"}
          </button>
          {onHome ? (
            <button type="button" className="btn btn-blue" onClick={onHome}>
              Home
            </button>
          ) : (
            <Link href="/" className="btn btn-blue">
              Home
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
