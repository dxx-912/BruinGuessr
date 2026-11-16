"use client";

import { useEffect } from "react";
import { formatDistance, formatImperial, roundVerdict } from "@/lib/game/format";
import { sound } from "@/lib/game/sound";
import type { RoundResult } from "@/lib/game/types";
import Confetti from "./Confetti";
import CountUp from "./CountUp";
import PhotoCredit from "./PhotoCredit";
import ReportButton from "./ReportButton";

type Props = {
  gameId: string;
  result: RoundResult;
  roundCount: number;
  /** The in-memory copy of the photo, if this browser tab still has it. */
  photoUrl: string | undefined;
  onOpenPhoto: () => void;
  onNext: () => void;
  busy: boolean;
};

const MAX = 5000;

/** The card that slides up over the map after a guess: distance, points, credit, next. */
export default function RevealPanel({ gameId, result, roundCount, photoUrl, onOpenPhoto, onNext, busy }: Props) {
  const bullseye = result.guess !== null && result.score >= MAX;
  const last = result.round >= roundCount;

  useEffect(() => {
    const id = window.setTimeout(() => (bullseye ? sound.bullseye() : sound.tally(result.score)), 450);
    return () => window.clearTimeout(id);
  }, [bullseye, result.score]);

  return (
    <>
      {bullseye && <Confetti />}
      {bullseye && (
        <p aria-hidden className="display pointer-events-none absolute left-1/2 top-[22%] z-30 -ml-[6.5rem] w-52 animate-stamp rounded-2xl border-4 border-night bg-ucla-gold py-2 text-center text-5xl text-night shadow-[0_6px_0_#06182B] [animation-delay:900ms]">
          Bullseye!
        </p>
      )}

      <section aria-live="polite" className="panel absolute inset-x-3 bottom-3 z-30 mx-auto max-w-4xl animate-rise p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {photoUrl ? (
              <button type="button" onClick={onOpenPhoto} aria-label="Look at the photo again" className="h-20 w-28 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border-2 border-navy-line sm:h-24 sm:w-36">
                {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob */}
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sky">
                Round {result.round} of {roundCount} · {roundVerdict(result.score, result.guess !== null)}
              </p>
              <p className="display mt-1 flex items-baseline gap-2 text-5xl text-ucla-gold sm:text-6xl">
                <CountUp value={result.score} delayMs={450} />
                <span className="text-2xl text-paper">points</span>
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-night" role="img" aria-label={`${result.score} of ${MAX} points`}>
                <div className="h-full origin-left animate-fill rounded-full bg-ucla-gold" style={{ transform: `scaleX(${result.score / MAX})` }} />
              </div>
              <p className="mt-2 font-semibold">
                {result.guess && result.distanceM !== null ? (
                  <>
                    {formatDistance(result.distanceM)} away <span className="font-medium text-sky">({formatImperial(result.distanceM)})</span>
                  </>
                ) : (
                  "Time ran out before you placed a pin."
                )}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-gold md:self-center" onClick={onNext} disabled={busy} autoFocus>
            {busy ? "Loading…" : last ? "See your results" : "Next round"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-2 border-navy-line pt-3">
          <PhotoCredit credit={result.credit} />
          <ReportButton gameId={gameId} round={result.round} alreadyReported={result.reported} />
        </div>
      </section>
    </>
  );
}
