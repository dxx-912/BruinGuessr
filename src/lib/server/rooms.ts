import "server-only";
import { after } from "next/server";
import type { RoomState } from "@/lib/versus/types";
import { call } from "./game";
import { adminClient, supabaseUrl } from "./supabase";

/**
 * Versus rooms. Like the game functions, all the rules live in the database
 * (see the versus migration); this file passes the verified account ID along.
 */

export const createRoom = (userId: string) => call<RoomState>("create_room", { p_user: userId });

/** Joins a room, comes back to it after a disconnect, or says "I'm in" for a rematch. */
export const joinRoom = (code: string, userId: string) => call<RoomState>("join_room", { p_code: code, p_user: userId });

/** Where the room stands. Asking is also how the server knows the player is still there. */
export const roomState = (code: string, userId: string) => call<RoomState>("room_state", { p_code: code, p_user: userId });

export const leaveRoom = (code: string, userId: string) =>
  call<{ ok: true; channel?: string }>("leave_room", { p_code: code, p_user: userId });

/** The host starts the game. Round one opens at once for everyone waiting in the lobby. */
export const startRoomGame = (code: string, userId: string) => call<RoomState>("start_room_game", { p_code: code, p_user: userId });

/** The code of the room this player is mid-game in, if any. */
export async function activeRoom(userId: string): Promise<string | null> {
  const { data, error } = await adminClient().rpc("active_room", { p_user: userId });
  if (error) {
    console.error(`[rooms] active_room failed: ${error.message}`);
    return null;
  }
  return typeof data === "string" && data ? data : null;
}

/**
 * Tells everyone in a room that something changed, so their browsers ask for
 * the new state now instead of at their next regular check. The message is
 * empty: nothing about the game travels over Realtime. It is sent after the
 * response, so it never slows the request that caused it, and if it is lost
 * the regular check catches up a moment later.
 */
export function pingRoom(result: unknown): void {
  const channel = channelOf(result);
  if (!channel) return;
  after(async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return;
    try {
      const response = await fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ messages: [{ topic: channel, event: "changed", payload: {} }] }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) console.error(`[rooms] ping failed: ${response.status}`);
    } catch (err) {
      console.error(`[rooms] ping failed: ${err instanceof Error ? err.message : err}`);
    }
  });
}

/** The room channel named in a room state, a game state, or a leave result. */
function channelOf(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as { channel?: unknown; versus?: { channel?: unknown } | null };
  const channel = typeof r.channel === "string" ? r.channel : r.versus?.channel;
  return typeof channel === "string" && /^room-[0-9a-f-]{36}$/.test(channel) ? channel : null;
}
