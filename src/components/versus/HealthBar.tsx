import { formatPoints } from "@/lib/game/format";
import { healthShare, healthTone } from "@/lib/versus/health";

const FILL = { good: "bg-health", low: "bg-ucla-gold", critical: "bg-alarm" } as const;
const TEXT = { good: "text-health", low: "text-ucla-gold", critical: "text-alarm" } as const;

type Props = {
  health: number | null;
  start: number | null;
  /** Show the number beside the bar. */
  number?: boolean;
  className?: string;
};

/** A player's health: a bar that drains from the right, green to gold to red, with the number beside it. */
export default function HealthBar({ health, start, number = true, className = "" }: Props) {
  const share = healthShare(health, start);
  const tone = healthTone(share);
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      <span
        role="meter"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={start ?? 0}
        aria-valuenow={health ?? 0}
        className="relative h-2 min-w-6 flex-1 overflow-hidden rounded-full bg-night ring-1 ring-navy-line"
      >
        <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${FILL[tone]}`} style={{ width: `${share * 100}%` }} />
      </span>
      {number && <span className={`display numeric text-base leading-none ${health === 0 ? "text-sky/60" : TEXT[tone]}`}>{formatPoints(health ?? 0)}</span>}
    </span>
  );
}
