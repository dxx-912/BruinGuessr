import "server-only";
import type { GameError, GameState, ReportReason } from "@/lib/game/types";
import { adminClient } from "./supabase";

/** The photo bucket. Private: only the secret key can read from it. */
export const PHOTO_BUCKET = "photos";

export type Failed = { error: GameError };

/**
 * Calls one of the game functions in the database (see the single player
 * migration). All rules, timing and scoring live there; this file only passes
 * the verified account ID along.
 */
export async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | Failed> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) {
    console.error(`[game] ${fn} failed: ${error.message}`);
    return { error: "server_error" };
  }
  return data as T;
}

export const startGame = (userId: string) => call<{ id: string }>("start_game", { p_user: userId });

export const gameState = (gameId: string, userId: string) =>
  call<GameState>("game_state", { p_game: gameId, p_user: userId });

export const startRound = (gameId: string, userId: string) =>
  call<GameState>("start_round", { p_game: gameId, p_user: userId });

export const placePin = (gameId: string, userId: string, round: number, lat: number, lng: number) =>
  call<{ ok: true }>("place_pin", { p_game: gameId, p_user: userId, p_round: round, p_lat: lat, p_lng: lng });

export const lockGuess = (gameId: string, userId: string, round: number, lat: number | null, lng: number | null) =>
  call<GameState>("lock_guess", { p_game: gameId, p_user: userId, p_round: round, p_lat: lat, p_lng: lng });

export const reportImage = (gameId: string, userId: string, round: number, reason: ReportReason) =>
  call<{ ok: true }>("report_image", { p_game: gameId, p_user: userId, p_round: round, p_reason: reason });

/**
 * The bytes of a round's photo, or null if this player may not see it right
 * now (not their game, round not open, or round over). The storage filename
 * never leaves this function.
 */
export async function roundPhoto(gameId: string, userId: string, round: number): Promise<Blob | null> {
  const admin = adminClient();
  const { data: path, error } = await admin.rpc("round_photo_path", { p_game: gameId, p_user: userId, p_round: round });
  if (error) {
    console.error(`[game] round_photo_path failed: ${error.message}`);
    return null;
  }
  if (typeof path !== "string" || !path) return null;
  const file = await admin.storage.from(PHOTO_BUCKET).download(path);
  if (file.error || !file.data) {
    console.error(`[game] photo download failed: ${file.error?.message ?? "no data"}`);
    return null;
  }
  return file.data;
}
