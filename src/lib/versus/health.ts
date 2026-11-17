/**
 * Versus health battle: small helpers the screens share. The rules themselves
 * (damage, knock-outs, places) are decided in the database; these only order
 * and describe what the server sent.
 */
import type { VersusPlayer } from "@/lib/game/types";

/** 1 → "×1", 1.5 → "×1.5", 2.25 → "×2.25". */
export function formatMultiplier(multiplier: number): string {
  return `×${Number(Number(multiplier).toFixed(2))}`;
}

/** Share of the starting health left, from 0 to 1. */
export function healthShare(health: number | null, start: number | null): number {
  if (health === null || !start || start <= 0) return 0;
  return Math.min(1, Math.max(0, health / start));
}

/** How healthy a bar looks: plenty, getting low, nearly gone (or out). */
export function healthTone(share: number): "good" | "low" | "critical" {
  if (share > 0.5) return "good";
  if (share > 0.2) return "low";
  return "critical";
}

/**
 * Players in finishing order. While the game is on: everyone still in, most
 * health first, then everyone knocked out, best place first (the most recent
 * knock-outs). At the end every player has a place, and the winner is first.
 * A game from before health (no health) falls back to totals.
 */
export function standings(players: VersusPlayer[]): VersusPlayer[] {
  return [...players].sort(
    (a, b) =>
      (a.place ?? 0) - (b.place ?? 0) ||
      (b.health ?? 0) - (a.health ?? 0) ||
      b.total - a.total ||
      a.seat - b.seat,
  );
}

/** The rank shown beside a player: their place once decided, otherwise their position among those still in. */
export function standingRank(player: VersusPlayer, players: VersusPlayer[]): number {
  if (player.place !== null) return player.place;
  return 1 + players.filter((other) => other.place === null && (other.health ?? 0) > (player.health ?? 0)).length;
}

/** True once a player is knocked out and only watching. */
export const isOut = (player: Pick<VersusPlayer, "eliminatedRound"> | null | undefined): boolean =>
  player?.eliminatedRound !== null && player?.eliminatedRound !== undefined;
