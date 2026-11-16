import { formatPoints } from "@/lib/game/format";
import type { RoundResult } from "@/lib/game/types";

type Props = { roundCount: number; currentRound: number; results: RoundResult[]; totalScore: number };

/** Top right of the game screen: one pip per round, and the running total. */
export default function RoundTracker({ roundCount, currentRound, results, totalScore }: Props) {
  return (
    <div className="panel flex items-center gap-3 !rounded-2xl px-3 py-2">
      <ol className="hidden gap-1.5 sm:flex" aria-label={`Round ${Math.max(1, currentRound)} of ${roundCount}`}>
        {Array.from({ length: roundCount }, (_, i) => {
          const number = i + 1;
          const result = results.find((r) => r.round === number);
          const tone = result
            ? "bg-ucla-gold text-night"
            : number === currentRound
              ? "bg-ucla-blue text-paper outline outline-2 outline-offset-1 outline-paper"
              : "bg-night text-sky/60";
          return (
            <li key={number} title={result ? `Round ${number}: ${formatPoints(result.score)} points` : `Round ${number}`} className={`display grid h-8 w-8 place-items-center rounded-lg text-xl ${tone}`}>
              {number}
            </li>
          );
        })}
      </ol>
      <div className="text-right sm:border-l-2 sm:border-navy-line sm:pl-3">
        <p className="text-xs font-semibold leading-tight text-sky">
          <span className="sm:hidden">
            Round {Math.max(1, currentRound)}/{roundCount}
          </span>
          <span className="hidden sm:inline">Score</span>
        </p>
        <p className="display numeric text-2xl text-ucla-gold">{formatPoints(totalScore)}</p>
      </div>
    </div>
  );
}
