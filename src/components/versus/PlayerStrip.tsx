import type { VersusPlayer } from "@/lib/game/types";
import { isOut } from "@/lib/versus/health";
import HealthBar from "./HealthBar";
import { SeatBadge, Tick } from "./SeatBadge";

/**
 * During a versus round: everyone in the game, their health, and who has
 * guessed. Never where: the other pins stay hidden until the round is over.
 * A row of marks with a thin health bar under each on a phone, a list with
 * names and numbers on a wider screen. Players who are out are dimmed and
 * marked "Out".
 */
export default function PlayerStrip({ players, startHealth }: { players: VersusPlayer[]; startHealth: number | null }) {
  return (
    <ul aria-label="Players" className="panel pointer-events-auto flex gap-1.5 !rounded-2xl p-1.5 md:w-56 md:flex-col md:gap-1 md:p-2">
      {players.map((p) => {
        const out = isOut(p);
        const status = out ? "Out" : p.away ? "Away" : p.locked ? "Guessed" : "Guessing";
        return (
          <li key={p.seat} title={`${p.username}: ${status.toLowerCase()}`} className={`flex flex-col items-center gap-1 md:flex-row md:gap-2 ${out ? "opacity-45" : p.away ? "opacity-60" : ""}`}>
            <span className="relative">
              <SeatBadge seat={p.seat} name={p.username} className={`h-7 w-7 text-base ${out ? "grayscale" : ""}`} />
              {p.locked && !out && (
                <span className="absolute -bottom-1 -right-1 animate-pop">
                  <Tick className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
            {/* Phone: a thin bar under the mark. */}
            {startHealth !== null && <HealthBar health={p.health} start={startHealth} number={false} className="w-7 md:hidden" />}
            <span className="hidden min-w-0 flex-1 md:block">
              <span className={`block truncate text-sm font-semibold ${out ? "line-through decoration-2" : ""}`}>
                {p.username}
                {p.isYou && <span className="ml-1 font-medium text-sky no-underline">(you)</span>}
              </span>
              {startHealth !== null && !out && <HealthBar health={p.health} start={startHealth} className="mt-0.5" />}
            </span>
            <span className={`hidden self-start pt-0.5 text-xs font-semibold md:block ${out ? "text-alarm" : p.locked && !p.away ? "text-ucla-gold" : "text-sky"}`}>{status}</span>
            <span className="sr-only md:hidden">
              {p.username}: {status}
              {startHealth !== null && !out ? `, ${p.health ?? 0} health` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
