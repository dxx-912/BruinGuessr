/**
 * Versus mode, checked against the real database.
 *
 *   npm run test:live
 *
 * Rooms and the multi-player rules live in SQL (supabase/migrations/…_versus.sql).
 * These tests call those functions the way the API routes do, with throwaway
 * accounts. Clocks are moved by editing timestamps, so nothing here waits for
 * a real 30 second round.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameState } from "../../src/lib/game/types";
import type { Leaderboard } from "../../src/lib/leaderboard";
import type { RoomState } from "../../src/lib/versus/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type Failed = { error: string };
type Room = RoomState & Partial<Failed>;
type State = GameState & Partial<Failed>;

const users: string[] = [];

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function newUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: `live-test-${randomUUID()}@bruinguessr.test`, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  return data.user.id;
}

const createRoom = (user: string) => rpc<Room>("create_room", { p_user: user });
const join = (code: string, user: string) => rpc<Room>("join_room", { p_code: code, p_user: user });
const room = (code: string, user: string) => rpc<Room>("room_state", { p_code: code, p_user: user });
const leave = (code: string, user: string) => rpc<{ ok?: true }>("leave_room", { p_code: code, p_user: user });
const start = (code: string, user: string) => rpc<Room>("start_room_game", { p_code: code, p_user: user });
const state = (game: string, user: string) => rpc<State>("game_state", { p_game: game, p_user: user });
const startRound = (game: string, user: string) => rpc<State>("start_round", { p_game: game, p_user: user });
const pin = (game: string, user: string, round: number, lat: number, lng: number) =>
  rpc<{ ok?: true; error?: string }>("place_pin", { p_game: game, p_user: user, p_round: round, p_lat: lat, p_lng: lng });
const lock = (game: string, user: string, round: number, lat: number | null = null, lng: number | null = null) =>
  rpc<State>("lock_guess", { p_game: game, p_user: user, p_round: round, p_lat: lat, p_lng: lng });
const photoPath = (game: string, user: string, round: number) =>
  rpc<string | null>("round_photo_path", { p_game: game, p_user: user, p_round: round });

/** A point on campus, nudged a little differently for each player. */
const spot = (n: number) => ({ lat: (340705 + n * 4) / 10000, lng: -(1184441 + n * 3) / 10000 });

async function update(table: string, values: Record<string, unknown>, match: Record<string, unknown>) {
  const { error } = await admin.from(table).update(values).match(match);
  if (error) throw new Error(`${table}: ${error.message}`);
}

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

async function roomId(code: string): Promise<string> {
  const { data, error } = await admin.from("rooms").select("id").eq("code", code).neq("status", "closed").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Pretends a player's browser went quiet `seconds` ago. */
const goQuiet = async (code: string, user: string, seconds: number) =>
  update("room_members", { last_seen_at: ago(seconds) }, { room_id: await roomId(code), user_id: user });

/** Pretends the current round's clock ran out `secondsAgo` seconds ago. */
const expire = (game: string, round: number, secondsAgo: number) =>
  update("game_rounds", { started_at: ago(secondsAgo + 30), deadline_at: ago(secondsAgo) }, { game_id: game, round_no: round });

/** Pretends a round was scored `seconds` ago, so its reveal time is up. */
const revealOver = (game: string, round: number, seconds = 60) =>
  update("game_rounds", { resolved_at: ago(seconds) }, { game_id: game, round_no: round });

/** A lobby with `count` players in it. The first is the host. */
async function lobby(count: number): Promise<{ code: string; players: string[] }> {
  const players = await Promise.all(Array.from({ length: count }, newUser));
  const created = await createRoom(players[0]);
  for (const player of players.slice(1)) expect((await join(created.code, player)).error).toBeUndefined();
  return { code: created.code, players };
}

/** Every player guesses, one after another. Returns the last player's state. */
async function everyoneGuesses(game: string, players: string[], round: number): Promise<State> {
  let last: State | null = null;
  for (const [n, player] of players.entries()) last = await lock(game, player, round, spot(n).lat, spot(n).lng);
  return last!;
}

/** Plays the game from `fromRound` to the end, with the host opening each next round. */
async function playOut(game: string, players: string[], host: string, fromRound = 1): Promise<State> {
  let last: State | null = null;
  for (let round = fromRound; round <= 5; round++) {
    if (round > 1) expect((await startRound(game, host)).round?.number).toBe(round);
    last = await everyoneGuesses(game, players, round);
  }
  return last!;
}

afterAll(async () => {
  // Deleting an account removes its profile, room seats, games and guesses.
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await admin.from("rooms").update({ status: "closed", closed_at: new Date().toISOString() }).is("created_by", null).neq("status", "closed");
});

describe("a versus room", () => {
  it("hands out a five letter code with no vowels or look-alike characters", async () => {
    const codes = await Promise.all(Array.from({ length: 12 }, () => rpc<string>("_room_code", {})));
    for (const code of codes) expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{5}$/);
    expect(new Set(codes).size).toBeGreaterThan(8);
  });

  it("takes five players, refuses a sixth, and gives each a seat", async () => {
    const { code, players } = await lobby(5);
    const sixth = await newUser();
    expect((await join(code, sixth)).error).toBe("room_full");

    const seen = await room(code, players[2]);
    expect(seen.status).toBe("lobby");
    expect(seen.members.map((m) => m.seat)).toEqual([1, 2, 3, 4, 5]);
    expect(seen.members.filter((m) => m.isHost).map((m) => m.seat)).toEqual([1]);
    expect(seen.members.filter((m) => m.isYou).map((m) => m.seat)).toEqual([3]);
    expect(seen.isHost).toBe(false);
    expect(seen.canStart).toBe(false);
    expect((await room(code, players[0])).canStart).toBe(true);
    // Someone who is not in the room learns nothing about it.
    expect((await room(code, sixth)).error).toBe("not_in_room");
    // Codes are not case sensitive.
    expect((await room(code.toLowerCase(), players[1])).code).toBe(code);
  });

  it("needs two players, and only the host can start", async () => {
    const host = await newUser();
    const created = await createRoom(host);
    expect(created.isHost).toBe(true);
    expect((await start(created.code, host)).error).toBe("need_players");

    const guest = await newUser();
    await join(created.code, guest);
    expect((await start(created.code, guest)).error).toBe("not_host");
    const started = await start(created.code, host);
    expect(started.status).toBe("playing");
    expect(started.gameId).toMatch(/^[0-9a-f-]{36}$/);
    // A second click starts nothing new.
    expect((await start(created.code, host)).gameId).toBe(started.gameId);
  });

  it("locks once the game starts", async () => {
    const { code, players } = await lobby(2);
    await start(code, players[0]);
    const late = await newUser();
    expect((await join(code, late)).error).toBe("room_locked");
    expect((await room(code, late)).error).toBe("not_in_room");
  });

  it("frees the seat of a player who leaves the lobby, and closes when empty", async () => {
    const { code, players } = await lobby(3);
    await leave(code, players[1]);
    expect((await room(code, players[0])).members.map((m) => m.seat)).toEqual([1, 3]);
    const newcomer = await newUser();
    expect((await join(code, newcomer)).seat).toBe(2);

    // The host leaves: the earliest remaining player is the host.
    await leave(code, players[0]);
    const after = await room(code, players[2]);
    expect(after.isHost).toBe(true);

    await leave(code, players[2]);
    await leave(code, newcomer);
    expect((await join(code, players[0])).error).toBe("not_found");
  });

  it("drops a player who has been away from the lobby too long, but never empties a room that way", async () => {
    const { code, players } = await lobby(2);
    // Both away for ten minutes. The host comes back first: the room is still theirs.
    await goQuiet(code, players[0], 600);
    await goQuiet(code, players[1], 600);
    const back = await room(code, players[0]);
    expect(back.isHost).toBe(true);
    // The other player was away too long and is gone; they can simply join again.
    expect(back.members).toHaveLength(1);
    expect((await room(code, players[1])).error).toBe("not_in_room");
    expect((await join(code, players[1])).members).toHaveLength(2);

    // A host who is away too long while someone else waits loses the chair.
    await goQuiet(code, players[0], 600);
    const waiting = await room(code, players[1]);
    expect(waiting.isHost).toBe(true);
    expect(waiting.members).toHaveLength(1);
  });
});

describe("a five player game", () => {
  let code: string;
  let players: string[];
  let game: string;

  beforeAll(async () => {
    ({ code, players } = await lobby(5));
    game = (await start(code, players[0])).gameId!;
  });

  it("opens round one for everyone with the same clock and the same photo", async () => {
    const states = await Promise.all(players.map((p) => state(game, p)));
    for (const s of states) {
      expect(s.mode).toBe("versus");
      expect(s.round?.number).toBe(1);
      expect(s.round?.startsAt).toBe(states[0].round?.startsAt);
      expect(s.round?.deadlineAt).toBe(states[0].round?.deadlineAt);
      expect(s.round!.deadlineAt - s.round!.startsAt).toBe(30_000);
      expect(s.versus?.players.map((p) => p.seat)).toEqual([1, 2, 3, 4, 5]);
    }
    expect(states.map((s) => s.versus?.seat)).toEqual([1, 2, 3, 4, 5]);
    expect(states.map((s) => s.versus?.isHost)).toEqual([true, false, false, false, false]);

    const paths = await Promise.all(players.map((p) => photoPath(game, p, 1)));
    expect(paths[0]).toMatch(/^[0-9a-f]{32}\.webp$/);
    expect(new Set(paths).size).toBe(1);
    // Not for someone outside the game.
    expect(await photoPath(game, await newUser(), 1)).toBeNull();
  });

  it("shows who has guessed, never where, while the round is open", async () => {
    await pin(game, players[1], 1, spot(1).lat, spot(1).lng);
    const locked = await lock(game, players[0], 1, spot(0).lat, spot(0).lng);
    // Four players still to go: the round stays open.
    expect(locked.round?.number).toBe(1);
    expect(locked.round?.locked).toBe(true);
    expect(locked.results).toEqual([]);

    const other = await state(game, players[3]);
    expect(other.round?.locked).toBe(false);
    expect(other.round?.pin).toBeNull();
    expect(other.versus?.players.map((p) => p.locked)).toEqual([true, false, false, false, false]);
    const text = JSON.stringify(other);
    expect(text).not.toContain(String(spot(0).lat));
    expect(text).not.toContain(String(spot(1).lat));
    expect(text).not.toMatch(/answer|photographer|storage|image_id/);
    // A locked guess cannot be moved.
    expect((await pin(game, players[0], 1, 34.07, -118.44)).error).toBe("locked");
  });

  it("ends the round the moment the last player guesses, before the timer", async () => {
    for (const n of [1, 2, 3]) expect((await lock(game, players[n], 1, spot(n).lat, spot(n).lng)).round?.number).toBe(1);
    const last = await lock(game, players[4], 1, spot(4).lat, spot(4).lng);
    expect(last.round).toBeNull();
    expect(last.serverNow).toBeLessThan((await admin.from("game_rounds").select("deadline_at").eq("game_id", game).eq("round_no", 1).single().then((r) => Date.parse(r.data!.deadline_at))));

    // The reveal has every player's pin, distance and points, and a running scoreboard.
    const result = last.results[0];
    expect(result.players).toHaveLength(5);
    for (const [n, p] of result.players!.entries()) {
      expect(p.seat).toBe(n + 1);
      expect(p.guess).toEqual(spot(n));
      expect(p.distanceM).toBeGreaterThan(0);
      expect(p.score).toBeGreaterThanOrEqual(0);
    }
    expect(last.versus?.players.map((p) => p.total)).toEqual(result.players!.map((p) => p.score));
    expect(result.guess).toEqual(spot(4));
    expect(last.totalScore).toBe(result.players![4].score);
    // The photo address stops working for everyone.
    expect(await Promise.all(players.map((p) => photoPath(game, p, 1)))).toEqual([null, null, null, null, null]);
  });

  it("opens the next round for the host at once, and for anyone else only when the reveal time is up", async () => {
    const waiting = await startRound(game, players[2]);
    expect(waiting.round).toBeNull();
    expect(waiting.currentRound).toBe(1);
    expect(waiting.versus?.nextRoundAt).toBeGreaterThan(waiting.serverNow);

    await revealOver(game, 1);
    const opened = await startRound(game, players[2]);
    expect(opened.round?.number).toBe(2);
    expect(opened.versus?.nextRoundAt).toBeNull();
    // Everyone asking at the same moment still opens just one round.
    const again = await Promise.all(players.map((p) => startRound(game, p)));
    expect(again.map((s) => s.round?.number)).toEqual([2, 2, 2, 2, 2]);
    expect(new Set(again.map((s) => s.round?.deadlineAt)).size).toBe(1);
  });

  it("scores the round once when two players guess at the same moment", async () => {
    for (const n of [0, 1, 2]) await lock(game, players[n], 2, spot(n).lat, spot(n).lng);
    const [a, b] = await Promise.all([
      lock(game, players[3], 2, spot(3).lat, spot(3).lng),
      lock(game, players[4], 2, spot(4).lat, spot(4).lng),
    ]);
    // One of them was the last one in. Whichever it was, the round is over for both by now.
    expect([a.round, b.round]).toContain(null);
    const [after3, after4] = await Promise.all([state(game, players[3]), state(game, players[4])]);
    expect(after3.round).toBeNull();
    expect(after3.results).toHaveLength(2);
    expect(after3.results[1].players).toEqual(after4.results[1].players);
    expect(after3.results[1].players!.every((p) => p.guess !== null)).toBe(true);
    // Totals are the sum of the two rounds, exactly once.
    for (const [n, p] of after3.versus!.players.entries()) {
      expect(p.total).toBe(after3.results[0].players![n].score + after3.results[1].players![n].score);
    }
  });

  it("does not wait for a player who dropped off, and gives them 0 for the round they missed", async () => {
    expect((await startRound(game, players[0])).round?.number).toBe(3);
    await goQuiet(code, players[4], 30);
    const seen = await state(game, players[0]);
    expect(seen.versus?.players.map((p) => p.away)).toEqual([false, false, false, false, true]);

    for (const n of [0, 1, 2]) expect((await lock(game, players[n], 3, spot(n).lat, spot(n).lng)).round?.number).toBe(3);
    const last = await lock(game, players[3], 3, spot(3).lat, spot(3).lng);
    expect(last.round).toBeNull();
    const missed = last.results[2].players![4];
    expect(missed).toEqual({ seat: 5, guess: null, distanceM: null, score: 0 });
  });

  it("lets that player rejoin the same room mid-game and play on", async () => {
    const back = await join(code, players[4]);
    expect(back.status).toBe("playing");
    expect(back.gameId).toBe(game);

    expect((await startRound(game, players[0])).round?.number).toBe(4);
    const rejoined = await state(game, players[4]);
    expect(rejoined.round?.number).toBe(4);
    expect(rejoined.results[2].score).toBe(0);
    expect(rejoined.versus?.players[4].away).toBe(false);
    // Back in: the round waits for them again.
    for (const n of [0, 1, 2, 3]) expect((await lock(game, players[n], 4, spot(n).lat, spot(n).lng)).round?.number).toBe(4);
    expect((await lock(game, players[4], 4, spot(4).lat, spot(4).lng)).round).toBeNull();
  });

  it("scores a dropped player's saved pin when the others finish the round", async () => {
    expect((await startRound(game, players[0])).round?.number).toBe(5);
    await pin(game, players[2], 5, spot(2).lat, spot(2).lng);
    await goQuiet(code, players[2], 30);
    for (const n of [0, 1, 3]) await lock(game, players[n], 5, spot(n).lat, spot(n).lng);
    const done = await lock(game, players[4], 5, spot(4).lat, spot(4).lng);
    expect(done.status).toBe("completed");
    expect(done.results[4].players![2].guess).toEqual(spot(2));
    expect(done.results[4].players![2].score).toBeGreaterThan(0);
  });

  it("finishes with each player's own five round total", async () => {
    const final = await Promise.all(players.map((p) => state(game, p)));
    for (const [n, s] of final.entries()) {
      expect(s.status).toBe("completed");
      expect(s.results).toHaveLength(5);
      expect(s.totalScore).toBe(s.results.reduce((sum, r) => sum + r.score, 0));
      expect(s.totalScore).toBe(s.versus!.players[n].total);
      expect(s.versus!.players).toEqual(final[0].versus!.players.map((p) => ({ ...p, isYou: p.seat === n + 1 })));
    }
    const rows = await admin.from("game_players").select("user_id, total_score, seat").eq("game_id", game);
    expect(rows.data).toHaveLength(5);
    const gameRow = await admin.from("games").select("status, mode, completed_at").eq("id", game).single();
    expect(gameRow.data).toMatchObject({ status: "completed", mode: "versus" });
    expect(gameRow.data!.completed_at).not.toBeNull();
  });

  it("offers a rematch that keeps the group and leaves out whoever does not come back", async () => {
    const after = await state(game, players[1]);
    expect(after.versus?.rematch).toEqual({ state: "open", ready: 0 });
    const idle = await room(code, players[1]);
    expect(idle.status).toBe("lobby");
    expect(idle.members).toHaveLength(5);
    expect(idle.members.every((m) => !m.ready)).toBe(true);

    // Four press Rematch. The fifth stays on the results.
    for (const n of [0, 1, 2, 3]) expect((await join(code, players[n])).ready).toBe(true);
    expect((await state(game, players[4])).versus?.rematch).toEqual({ state: "open", ready: 4 });
    const next = await start(code, players[0]);
    expect(next.gameId).not.toBe(game);
    expect(next.members.map((m) => m.seat)).toEqual([1, 2, 3, 4]);

    const second = await state(next.gameId!, players[3]);
    expect(second.round?.number).toBe(1);
    expect(second.versus?.players.map((p) => p.seat)).toEqual([1, 2, 3, 4]);
    expect((await state(next.gameId!, players[4])).error).toBe("not_found");
    expect((await state(game, players[4])).versus?.rematch.state).toBe("started");
    expect((await join(code, players[4])).error).toBe("room_locked");

    // The rematch avoids the photos this group has just seen.
    const images = async (id: string) => (await admin.from("game_rounds").select("image_id").eq("game_id", id)).data!.map((r) => r.image_id);
    const [first, rematch] = await Promise.all([images(game), images(next.gameId!)]);
    expect(rematch.filter((id) => first.includes(id))).toEqual([]);
  });
});

describe("leaving and the host", () => {
  it("passes the host to the next player when the host leaves mid-game, and plays on", async () => {
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    await everyoneGuesses(game, players, 1);

    await leave(code, players[0]);
    const seen = await state(game, players[2]);
    expect(seen.versus?.players.map((p) => p.isHost)).toEqual([false, true, false]);
    expect(seen.versus?.players.map((p) => p.away)).toEqual([true, false, false]);
    // The new host opens the next round; the round ends when the two who remain have guessed.
    expect((await startRound(game, players[2])).round).toBeNull();
    expect((await startRound(game, players[1])).round?.number).toBe(2);
    await lock(game, players[1], 2, spot(1).lat, spot(1).lng);
    const done = await lock(game, players[2], 2, spot(2).lat, spot(2).lng);
    expect(done.round).toBeNull();
    expect(done.results[1].players![0]).toEqual({ seat: 1, guess: null, distanceM: null, score: 0 });

    // The old host comes back as an ordinary player, with 0 for the round they missed.
    const back = await join(code, players[0]);
    expect(back.gameId).toBe(game);
    expect(back.isHost).toBe(false);
    const final = await playOut(game, players, players[1], 3);
    expect(final.status).toBe("completed");
    const mine = await state(game, players[0]);
    expect(mine.results.map((r) => r.score > 0)).toEqual([true, false, true, true, true]);
    expect(mine.totalScore).toBe(mine.results.reduce((sum, r) => sum + r.score, 0));
  });

  it("passes the host on when the host's browser goes quiet mid-game", async () => {
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    await goQuiet(code, players[0], 30);
    const seen = await state(game, players[1]);
    expect(seen.versus?.isHost).toBe(true);
    // And the round does not wait for the quiet player.
    expect((await lock(game, players[1], 1, spot(1).lat, spot(1).lng)).round).toBeNull();
  });

  it("still ends a round on the clock when nobody guesses", async () => {
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    await pin(game, players[0], 1, spot(0).lat, spot(0).lng);
    await expire(game, 1, 1);
    // Inside the grace period the round is still open; after it, the next request scores it.
    expect((await state(game, players[1])).round?.number).toBe(1);
    await expire(game, 1, 3);
    const scored = await state(game, players[1]);
    expect(scored.round).toBeNull();
    expect(scored.results[0].players![0].guess).toEqual(spot(0));
    expect(scored.results[0].players![1]).toEqual({ seat: 2, guess: null, distanceM: null, score: 0 });
    expect((await lock(game, players[0], 1, 34.07, -118.44)).results[0].players![0].guess).toEqual(spot(0));
  });

  it("abandons the game and closes the room when everyone leaves", async () => {
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    await leave(code, players[0]);
    await leave(code, players[1]);
    const row = await admin.from("games").select("status").eq("id", game).single();
    expect(row.data?.status).toBe("abandoned");
    expect((await join(code, players[0])).error).toBe("not_found");
    expect((await state(game, players[0])).status).toBe("abandoned");
  });

  it("gives the host's chair to whoever comes back for the rematch if the host does not", async () => {
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    await playOut(game, players, players[0]);
    await join(code, players[1]);
    await join(code, players[2]);
    // The host gets the length of a reveal to come back.
    expect((await room(code, players[1])).isHost).toBe(false);
    await update("rooms", { lobby_since: ago(60) }, { id: await roomId(code) });
    const waiting = await room(code, players[1]);
    expect(waiting.isHost).toBe(true);
    expect(waiting.canStart).toBe(true);
    const next = await start(code, players[1]);
    expect(next.members.map((m) => m.seat)).toEqual([2, 3]);
  });
});

describe("versus games and the leaderboard", () => {
  const name = () => `lt_${randomBytes(5).toString("hex")}`;
  const board = (user: string | null) => rpc<Leaderboard>("leaderboard", { p_user: user, p_limit: 100, p_offset: 0 });

  it("counts each player's versus total like a solo game, and only if it is their best", async () => {
    const { code, players } = await lobby(2);
    for (const p of players) await rpc("set_username", { p_user: p, p_username: name() });
    const game = (await start(code, players[0])).gameId!;

    // Mid-game: nothing on the board yet.
    await everyoneGuesses(game, players, 1);
    expect((await board(players[0])).you).toBeNull();

    const final = await playOut(game, players, players[0], 2);
    expect(final.status).toBe("completed");
    for (const [n, p] of players.entries()) {
      const mine = (await board(p)).you;
      expect(mine).toMatchObject({ score: final.versus!.players[n].total, mode: "versus", gameId: game });
    }

    // A better solo game replaces it; a worse versus rematch does not.
    const best = final.versus!.players[0].total + 1;
    const solo = await admin.from("games").insert({ status: "completed", current_round: 5, created_by: players[0], completed_at: new Date().toISOString() }).select("id").single();
    await admin.from("game_players").insert({ game_id: solo.data!.id, user_id: players[0], total_score: best });
    expect((await board(players[0])).you).toMatchObject({ score: best, mode: "solo" });

    await join(code, players[0]);
    await join(code, players[1]);
    const rematch = (await start(code, players[0])).gameId!;
    for (let round = 1; round <= 5; round++) {
      if (round > 1) await startRound(rematch, players[0]);
      // Player one guesses from another continent this time.
      await lock(rematch, players[0], round, -33.86, 151.21);
      await lock(rematch, players[1], round, spot(1).lat, spot(1).lng);
    }
    expect((await state(rematch, players[0])).totalScore).toBe(0);
    expect((await board(players[0])).you).toMatchObject({ score: best, mode: "solo" });
  });

  it("does not count an abandoned versus game", async () => {
    const { code, players } = await lobby(2);
    for (const p of players) await rpc("set_username", { p_user: p, p_username: name() });
    const game = (await start(code, players[0])).gameId!;
    await everyoneGuesses(game, players, 1);
    await leave(code, players[0]);
    await leave(code, players[1]);
    expect((await board(players[0])).you).toBeNull();
    expect((await board(players[1])).you).toBeNull();
  });

  it("keeps development test accounts off the board", async () => {
    const { code, players } = await lobby(2);
    for (const p of players) await rpc("set_username", { p_user: p, p_username: name() });
    await update("profiles", { is_test: true }, { id: players[0] });
    const game = (await start(code, players[0])).gameId!;
    await playOut(game, players, players[0]);
    expect((await board(players[0])).you).toBeNull();
    expect((await board(players[1])).you).not.toBeNull();
  });
});

describe("the public key cannot reach versus data", () => {
  it("cannot read rooms or members", async () => {
    for (const table of ["rooms", "room_members"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error ?? data).toSatisfy((v: unknown) => (Array.isArray(v) ? v.length === 0 : true));
      expect(data ?? []).toEqual([]);
    }
  });

  it("cannot call any room function", async () => {
    const someone = randomUUID();
    const calls: [string, Record<string, unknown>][] = [
      ["create_room", { p_user: someone }],
      ["join_room", { p_code: "BCDFG", p_user: someone }],
      ["room_state", { p_code: "BCDFG", p_user: someone }],
      ["leave_room", { p_code: "BCDFG", p_user: someone }],
      ["start_room_game", { p_code: "BCDFG", p_user: someone }],
      ["active_room", { p_user: someone }],
      ["_room_state", { p_room: someone, p_user: someone }],
      ["_room_upkeep", { p_room: someone }],
      ["_pick_images", { p_users: [someone], p_count: 5, p_exclude_game: someone }],
      ["_everyone_in", { p_game: someone, p_round: 1 }],
    ];
    for (const [fn, args] of calls) {
      const { data, error } = await anon.rpc(fn, args);
      expect(error, fn).not.toBeNull();
      expect(data, fn).toBeNull();
    }
  });
});
