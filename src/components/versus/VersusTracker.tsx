import { formatPoints } from "@/lib/game/format";
import type { VersusInfo } from "@/lib/game/types";
import { formatMultiplier, healthShare, healthTone, isOut } from "@/lib/versus/health";

const TEXT = { good: "text-health", low: "text-ucla-gold", critical: "text-alarm" } as const;

type Props = {
  currentRound: number;
  /** The open round's multiplier, or between rounds the next one's. */
  multiplier: number | null;
  versus: VersusInfo;
};

/**
 * Top right of a versus game: the round, its damage multiplier (red once it
 * is above 1, so a big round reads as dangerous), and this player's health.
 */
export default function VersusTracker({ currentRound, multiplier, versus }: Props) {
  const me = versus.players.find((p) => p.isYou) ?? null;
  const out = isOut(me);
  const tone = healthTone(healthShare(me?.health ?? 0, versus.startHealth));
  const hot = multiplier !== null && multiplier > 1;
  const health = (
    <p className={`display numeric text-2xl leading-tight ${out ? "text-sky/70" : TEXT[tone]}`}>{out ? "Out" : formatPoints(me?.health ?? 0)}</p>
  );
  const times = multiplier !== null && <span className={hot ? "text-alarm" : "text-paper"}>{formatMultiplier(multiplier)}</span>;
  return (
    <div className="panel !rounded-2xl px-3 py-2">
      {/* Phone: one narrow column, so the clock in the middle of the bar keeps its room. */}
      <div className="text-right sm:hidden">
        <p className="whitespace-nowrap text-xs font-semibold leading-tight text-sky">
          Round {Math.max(1, currentRound)} · {times}
        </p>
        {health}
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <div className="text-right">
          <p className="text-xs font-semibold leading-tight text-sky">Round {Math.max(1, currentRound)}</p>
          {multiplier !== null && (
            <p title="Damage multiplier this round" className={`display numeric text-2xl leading-tight ${hot ? "text-alarm" : "text-paper"}`}>
              {formatMultiplier(multiplier)}
            </p>
          )}
        </div>
        <div className="border-l-2 border-navy-line pl-3 text-right">
          <p className="text-xs font-semibold leading-tight text-sky">{out ? "Watching" : "Health"}</p>
          {health}
        </div>
      </div>
    </div>
  );
}
