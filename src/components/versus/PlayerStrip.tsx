import type { VersusPlayer } from "@/lib/game/types";
import { SeatBadge, Tick } from "./SeatBadge";

/**
 * During a versus round: everyone in the game, and who has guessed. Never
 * where: the other pins stay hidden until the round is over. A row of marks
 * on a phone, a list with names on a wider screen.
 */
export default function PlayerStrip({ players }: { players: VersusPlayer[] }) {
  return (
    <ul aria-label="Players" className="panel pointer-events-auto flex gap-1.5 !rounded-2xl p-1.5 md:w-52 md:flex-col md:gap-1 md:p-2">
      {players.map((p) => {
        const status = p.away ? "Away" : p.locked ? "Guessed" : "Guessing";
        return (
          <li key={p.seat} title={`${p.username}: ${status.toLowerCase()}`} className={`flex items-center gap-2 ${p.away ? "opacity-50" : ""}`}>
            <span className="relative">
              <SeatBadge seat={p.seat} name={p.username} className="h-7 w-7 text-base" />
              {p.locked && (
                <span className="absolute -bottom-1 -right-1 animate-pop">
                  <Tick className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
            <span className="hidden min-w-0 flex-1 truncate text-sm font-semibold md:block">
              {p.username}
              {p.isYou && <span className="ml-1 font-medium text-sky">(you)</span>}
            </span>
            <span className={`hidden text-xs font-semibold md:block ${p.locked && !p.away ? "text-ucla-gold" : "text-sky"}`}>{status}</span>
            <span className="sr-only md:hidden">
              {p.username}: {status}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
