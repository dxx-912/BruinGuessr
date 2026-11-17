"use client";

import { useEffect, useState } from "react";
import Confetti from "@/components/game/Confetti";
import CountUp from "@/components/game/CountUp";
import PhotoCredit from "@/components/game/PhotoCredit";
import ReportButton from "@/components/game/ReportButton";
import { serverClock } from "@/lib/game/api";
import { formatDistance, formatPoints, roundVerdict } from "@/lib/game/format";
import { sound } from "@/lib/game/sound";
import type { RoundResult, VersusInfo } from "@/lib/game/types";
import { rankOf, SeatBadge } from "./SeatBadge";

type Props = {
  gameId: string;
  result: RoundResult;
  roundCount: number;
  versus: VersusInfo;
  /** True after the last round. */
  finished: boolean;
  /** The in-memory copy of the photo, if this browser tab still has it. */
  photoUrl: string | undefined;
  onOpenPhoto: () => void;
  onNext: () => void;
  busy: boolean;
  /** Lets the game screen measure the panel, so the map keeps its pins clear of it. */
  panelRef?: React.Ref<HTMLElement>;
};

const MAX = 5000;

/** Whole seconds until a server time, counting down on screen. */
function useSecondsUntil(at: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (at === null) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((at - serverClock.now()) / 1000)));
    const first = requestAnimationFrame(update);
    const timer = window.setInterval(update, 250);
    return () => {
      cancelAnimationFrame(first);
      window.clearInterval(timer);
    };
  }, [at]);
  return at === null ? null : seconds;
}

/**
 * The versus reveal: this player's points for the round, then the scoreboard
 * with every player's distance and points for the round and their running
 * total. The map behind it shows every pin.
 */
export default function VersusRevealPanel({ gameId, result, roundCount, versus, finished, photoUrl, onOpenPhoto, onNext, busy, panelRef }: Props) {
  const bullseye = result.guess !== null && result.score >= MAX;
  const seconds = useSecondsUntil(finished ? null : versus.nextRoundAt);
  const host = versus.players.find((p) => p.isHost);

  useEffect(() => {
    const id = window.setTimeout(() => (bullseye ? sound.bullseye() : sound.tally(result.score)), 450);
    return () => window.clearTimeout(id);
  }, [bullseye, result.score]);

  const totals = versus.players.map((p) => p.total);
  const rows = versus.players
    .map((player) => ({ player, round: result.players?.find((r) => r.seat === player.seat) ?? null, rank: rankOf(player.total, totals) }))
    .sort((a, b) => b.player.total - a.player.total || a.player.seat - b.player.seat);

  return (
    <>
      {bullseye && <Confetti />}
      {bullseye && (
        <p aria-hidden className="display pointer-events-none absolute left-1/2 top-[18%] z-30 -ml-[6.5rem] w-52 animate-stamp rounded-2xl border-4 border-night bg-ucla-gold py-2 text-center text-5xl text-night shadow-[0_6px_0_#06182B] [animation-delay:900ms]">
          Bullseye!
        </p>
      )}

      <section ref={panelRef} aria-live="polite" className="panel absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-5xl animate-rise p-3 sm:p-4">
        <div className="flex flex-col gap-2.5 sm:gap-3 lg:flex-row lg:items-center lg:gap-5">
          {/* This player's round */}
          <div className="flex min-w-0 items-center gap-3 lg:w-80 lg:shrink-0">
            {photoUrl ? (
              <button type="button" onClick={onOpenPhoto} aria-label="Look at the photo again" className="h-14 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border-2 border-navy-line sm:h-16 sm:w-24 lg:h-24 lg:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob */}
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sky">
                Round {result.round} of {roundCount} · {roundVerdict(result.score, result.guess !== null)}
              </p>
              <p className="display mt-0.5 flex items-baseline gap-2 text-4xl text-ucla-gold lg:text-5xl">
                <CountUp value={result.score} delayMs={450} />
                <span className="text-xl text-paper">points</span>
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold">
                {result.guess && result.distanceM !== null ? `${formatDistance(result.distanceM)} away` : "Time ran out before you placed a pin."}
              </p>
            </div>
          </div>

          {/* The scoreboard */}
          <ol aria-label="Scoreboard" className="min-w-0 flex-1 rounded-xl bg-night/60 p-1">
            {rows.map(({ player, round, rank }) => (
              <li key={player.seat} className={`flex h-7 items-center gap-2 rounded-lg px-2 text-sm sm:h-[30px] ${player.isYou ? "bg-navy-line" : ""} ${player.away ? "opacity-60" : ""}`}>
                <span className="display numeric w-4 text-center text-lg text-sky">{rank}</span>
                <SeatBadge seat={player.seat} name={player.username} className="h-6 w-6 text-sm" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {player.username}
                  {player.isYou && <span className="ml-1 font-medium text-sky">(you)</span>}
                </span>
                <span className="hidden w-20 text-right text-sky sm:block">{round?.guess && round.distanceM !== null ? formatDistance(round.distanceM) : "No guess"}</span>
                <span className={`numeric w-14 text-right font-semibold ${round && round.score >= MAX ? "text-ucla-gold" : ""}`}>+{formatPoints(round?.score ?? 0)}</span>
                <span className="display numeric w-16 text-right text-xl text-ucla-gold">{formatPoints(player.total)}</span>
              </li>
            ))}
          </ol>

          {/* What happens next */}
          <div className="flex items-center gap-3 lg:w-48 lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-1.5">
            {finished ? (
              <button type="button" className="btn btn-gold flex-1 max-md:!py-3" onClick={onNext} autoFocus>
                Final standings
              </button>
            ) : versus.isHost ? (
              <>
                <button type="button" className="btn btn-gold flex-1 max-md:!py-3" onClick={onNext} disabled={busy} autoFocus>
                  {busy ? "Loading…" : "Next round"}
                </button>
                {seconds !== null && <p className="numeric whitespace-nowrap text-center text-xs font-semibold text-sky">or in {seconds} s</p>}
              </>
            ) : (
              <p className="flex-1 rounded-[14px] border-2 border-navy-line px-3 py-2 text-center">
                <span className="display numeric block text-2xl">Next round in {seconds ?? "…"}</span>
                <span className="block truncate text-xs font-semibold text-sky">{host ? `${host.username} can start it sooner` : "Starting soon"}</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t-2 border-navy-line pt-2.5 sm:mt-3">
          <PhotoCredit credit={result.credit} />
          <ReportButton gameId={gameId} round={result.round} alreadyReported={result.reported} />
        </div>
      </section>
    </>
  );
}
