/**
 * The shapes the browser and the server exchange for a versus room.
 * These mirror what the `_room_state` SQL function returns.
 */

export type RoomMember = {
  /** 1 to 5. Decides the player's colour. */
  seat: number;
  username: string;
  isHost: boolean;
  isYou: boolean;
  /** In the lobby, waiting for the next game. False after a game until they press Rematch. */
  ready: boolean;
  /** Not heard from for a little while. */
  away: boolean;
};

export type RoomState = {
  code: string;
  status: "lobby" | "playing";
  /** The Realtime channel that says "something changed, ask again". */
  channel: string;
  serverNow: number;
  minPlayers: number;
  maxPlayers: number;
  gamesPlayed: number;
  isHost: boolean;
  seat: number;
  ready: boolean;
  /** The game to go to, while one is on and this player is in it. */
  gameId: string | null;
  canStart: boolean;
  members: RoomMember[];
};

/** A–Z without vowels, I or O: what a room code is made of. */
export const ROOM_CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 5;
const ROOM_CODE = new RegExp(`^[${ROOM_CODE_LETTERS}]{${ROOM_CODE_LENGTH}}$`);

/** "bcd fg" → "BCDFG", or null if it could not be a room code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return ROOM_CODE.test(code) ? code : null;
}

/**
 * One colour per seat. The same colour follows a player from the lobby to
 * their pin on the map and their row on the scoreboard. Gold is not here: it
 * belongs to the answer.
 */
export const SEAT_COLORS = ["#2774AE", "#E5484D", "#1E9E62", "#8B5CD6", "#DD7A12"] as const;
export const seatColor = (seat: number): string => SEAT_COLORS[(seat - 1) % SEAT_COLORS.length] ?? SEAT_COLORS[0];

/** The letter on a player's pin and chip. */
export const initialOf = (username: string): string => (username.trim()[0] ?? "?").toUpperCase();
