import { initialOf, seatColor } from "@/lib/versus/types";

type Props = { seat: number; name: string; className?: string };

/** A player's mark: their initial on their seat colour. The same colour is on their pin. */
export function SeatBadge({ seat, name, className = "h-8 w-8 text-lg" }: Props) {
  return (
    <span aria-hidden className={`display grid shrink-0 place-items-center rounded-full border-2 border-paper text-paper ${className}`} style={{ background: seatColor(seat) }}>
      {initialOf(name)}
    </span>
  );
}

/** A small gold tick: this player has guessed. */
export function Tick({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#FFD100" />
      <path d="M4.300 8.300l2.500 2.500 4.900-5.300" fill="none" stroke="#06182B" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 1 for the highest total, shared by players who are level. */
export function rankOf(total: number, totals: number[]): number {
  return 1 + totals.filter((other) => other > total).length;
}
