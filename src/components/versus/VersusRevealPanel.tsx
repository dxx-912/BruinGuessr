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
import { scoreTone, TONE_TEXT } from "@/lib/game/tone";
import { formatMultiplier, isOut, standingRank, standings } from "@/lib/versus/health";
import HealthBar from "./HealthBar";
import { SeatBadge } from "./SeatBadge";

type Props = {
  gameId: string;
  result: RoundResult;
  versus: VersusInfo;
  /** True once the game is over. */
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

function Stamp({ children, tone }: { children: React.ReactNode; tone: "gold" | "red" }) {
  return (
    <p
      aria-hidden
      className={`display pointer-events-none absolute left-1/2 top-[18%] z-30 w-max -translate-x-1/2 animate-stamp rounded-2xl border-4 border-night px-6 py-2 text-center text-5xl text-night shadow-[0_6px_0_#06182B] [animation-delay:900ms] ${tone === "gold" ? "bg-ucla-gold" : "bg-alarm"}`}
    >
      {children}
    </p>
  );
}

/**
 * The versus reveal: this player's points and the damage they took, then
 * everyone's distance, points, damage and health left, best standing first.
 * The map behind it shows every pin.
 */
export default function VersusRevealPanel({ gameId, result, versus, finished, photoUrl, onOpenPhoto, onNext, busy, panelRef }: Props) {
  const legacy = versus.startHealth === null;
  const mine = result.players?.find((r) => r.seat === versus.seat) ?? null;
  // Out before this round: this player only watched it.
  const watching = !mine;
  const me = versus.players.find((p) => p.isYou) ?? null;
  const won = finished && me?.place === 1;
  const knockedOut = !won && mine?.eliminated === true;
  const bullseye = !watching && result.guess !== null && result.score >= MAX;
  const seconds = useSecondsUntil(finished ? null : versus.nextRoundAt);
  const host = versus.players.find((p) => p.isHost);
  const multiplier = result.multiplier ?? null;

  useEffect(() => {
    if (watching) return;
    const id = window.setTimeout(() => {
      if (won || bullseye) sound.bullseye();
      else if (knockedOut) sound.knockout();
      else sound.tally(result.score);
    }, 450);
    return () => window.clearTimeout(id);
  }, [watching, won, bullseye, knockedOut, result.score]);

  const rows = standings(versus.players).map((player) => ({
    player,
    round: result.players?.find((r) => r.seat === player.seat) ?? null,
    rank: standingRank(player, versus.players),
  }));

  return (
    <>
      {(won || bullseye) && <Confetti />}
      {won ? <Stamp tone="gold">Winner!</Stamp> : knockedOut ? <Stamp tone="red">Knocked out</Stamp> : bullseye ? <Stamp tone="gold">Bullseye!</Stamp> : null}

      <section ref={panelRef} aria-live="polite" className="panel absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-5xl animate-rise p-3 sm:p-4">
        <div className="flex flex-col gap-2.5 sm:gap-3 lg:flex-row lg:items-center lg:gap-5">
          {/* This player's round */}
          <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
            {photoUrl ? (
              <button type="button" onClick={onOpenPhoto} aria-label="Look at the photo again" className="h-14 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border-2 border-navy-line sm:h-16 sm:w-24 lg:h-24 lg:w-28">
                {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob */}
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sky">
                Round {result.round}
                {multiplier !== null && <span className={multiplier > 1 ? "text-alarm" : ""}> · {formatMultiplier(multiplier)} damage</span>}
                {!watching && <> · {roundVerdict(result.score, result.guess !== null)}</>}
              </p>
              {watching ? (
                <>
                  <p className="display mt-0.5 text-4xl text-out lg:text-5xl">You&apos;re out</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">Watching the rest of the game.</p>
                </>
              ) : (
                <>
                  <p className={`display mt-0.5 flex items-baseline gap-2 text-4xl lg:text-5xl ${TONE_TEXT[scoreTone(result.score, result.guess !== null)]}`}>
                    <CountUp value={result.score} delayMs={450} />
                    <span className="text-xl text-paper">points</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold">
                    {result.guess && result.distanceM !== null ? `${formatDistance(result.distanceM)} away` : "Time ran out before you placed a pin."}
                    {!legacy && mine && (
                      <span className={mine.damage ? "text-alarm" : "text-health"}> · {mine.damage ? `−${formatPoints(mine.damage)} health` : "no damage"}</span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Everyone, best standing first */}
          <ol aria-label="Scoreboard" className="min-w-0 flex-1 rounded-xl bg-night/60 p-1">
            {rows.map(({ player, round, rank }) => {
              const outBefore = isOut(player) && !round;
              return (
                <li key={player.seat} className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-sm sm:h-[30px] sm:gap-2 ${player.isYou ? "bg-navy-line" : ""} ${outBefore ? "opacity-50" : player.away ? "opacity-70" : ""}`}>
                  <span className="display numeric w-4 text-center text-lg text-sky">{rank}</span>
                  <SeatBadge seat={player.seat} name={player.username} className={`h-6 w-6 text-sm ${isOut(player) ? "grayscale" : ""}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {player.username}
                    {player.isYou && <span className="ml-1 font-medium text-sky">(you)</span>}
                  </span>
                  {outBefore ? (
                    <span className="text-xs font-semibold text-out">Out in round {player.eliminatedRound}</span>
                  ) : (
                    <>
                      <span className="hidden w-16 text-right text-sky sm:block">{round?.guess && round.distanceM !== null ? formatDistance(round.distanceM) : "No guess"}</span>
                      <span className={`numeric w-12 text-right font-semibold sm:w-14 ${round ? TONE_TEXT[scoreTone(round.score, round.guess !== null)] : "text-out"}`}>+{formatPoints(round?.score ?? 0)}</span>
                      {legacy ? (
                        <span className="display numeric w-16 text-right text-xl text-ucla-gold">{formatPoints(player.total)}</span>
                      ) : (
                        <>
                          <span className={`numeric w-14 text-right font-semibold ${round?.damage ? "text-alarm" : "text-out"}`}>{round?.damage ? `−${formatPoints(round.damage)}` : "0"}</span>
                          {round?.eliminated ? (
                            <span className="display w-16 text-right text-base text-alarm sm:w-24">Out!</span>
                          ) : (
                            <HealthBar health={player.health} start={versus.startHealth} className="w-16 justify-end sm:w-24 max-sm:[&>[role=meter]]:hidden" />
                          )}
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
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
                <p className="numeric whitespace-nowrap text-center text-xs font-semibold text-sky">
                  {versus.nextMultiplier !== null && <span className={versus.nextMultiplier > 1 ? "text-alarm" : ""}>{formatMultiplier(versus.nextMultiplier)} damage</span>}
                  {seconds !== null && <> · or in {seconds} s</>}
                </p>
              </>
            ) : (
              <p className="flex-1 rounded-[14px] border-2 border-navy-line px-3 py-2 text-center">
                <span className="display numeric block text-2xl">Next round in {seconds ?? "…"}</span>
                <span className="block truncate text-xs font-semibold text-sky">
                  {versus.nextMultiplier !== null && <span className={versus.nextMultiplier > 1 ? "text-alarm" : ""}>{formatMultiplier(versus.nextMultiplier)} damage · </span>}
                  {host ? `${host.username} can start it sooner` : "Starting soon"}
                </span>
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
