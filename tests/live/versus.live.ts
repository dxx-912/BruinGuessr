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
/** Versus games these tests start. They outlive their players' accounts, so they are deleted at the end. */
const games: string[] = [];

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
async function start(code: string, user: string): Promise<Room> {
  const room = await rpc<Room>("start_room_game", { p_code: code, p_user: user });
  if (room.gameId && !games.includes(room.gameId)) games.push(room.gameId);
  return room;
}
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

/** Where a round's photo really was (the test reads it with the secret key). */
async function answerOf(game: string, round: number): Promise<{ lat: number; lng: number }> {
  const { data, error } = await admin.from("game_rounds").select("images(lat, lng)").eq("game_id", game).eq("round_no", round).single();
  if (error) throw new Error(error.message);
  return data.images as unknown as { lat: number; lng: number };
}

/** `km` kilometres north of a point. */
const north = (at: { lat: number; lng: number }, km: number) => ({ lat: at.lat + km / 111.32, lng: at.lng });

/**
 * Ends a game: everyone but `winner` drops to 1 health, the next round opens,
 * the winner pins the answer and the others pin `spot(n)`. Returns the
 * winner's final state.
 */
async function finish(game: string, players: string[], host: string, winner: string): Promise<State> {
  const { error } = await admin.from("game_players").update({ health: 1 }).eq("game_id", game).neq("user_id", winner);
  if (error) throw new Error(error.message);
  const opened = await startRound(game, host);
  const round = opened.round!.number;
  const at = await answerOf(game, round);
  for (const [n, player] of players.entries()) if (player !== winner) await lock(game, player, round, spot(n).lat, spot(n).lng);
  return lock(game, winner, round, at.lat, at.lng);
}

/**
 * Plays rounds `fromRound` to 5 with the host opening each next round, then
 * ends the game with the host winning round 6. Health is set high first, so
 * nobody is knocked out along the way.
 */
async function playOut(game: string, players: string[], host: string, fromRound = 1): Promise<State> {
  await admin.from("game_players").update({ health: 1_000_000 }).eq("game_id", game);
  for (let round = fromRound; round <= 5; round++) {
    if (round > 1) expect((await startRound(game, host)).round?.number).toBe(round);
    await everyoneGuesses(game, players, round);
  }
  const last = await finish(game, players, host, host);
  expect(last.status).toBe("completed");
  return last;
}

afterAll(async () => {
  // Deleting an account removes its profile, room seats, solo games and guesses. Versus games stay for
  // the other players, so the ones made here are deleted by hand (with their rounds and guesses).
  for (const id of users) await admin.auth.admin.deleteUser(id);
  for (let i = 0; i < games.length; i += 50) await admin.from("games").delete().in("id", games.slice(i, i + 50));
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
    // These checks are about rounds, not health: nobody is knocked out along the way.
    await update("game_players", { health: 1_000_000 }, { game_id: game });
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
    expect(missed).toMatchObject({ seat: 5, guess: null, distanceM: null, score: 0 });
    expect(missed.damage).toBe(Math.max(...last.results[2].players!.map((p) => p.score)));
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
    expect(done.round).toBeNull();
    expect(done.status).toBe("active");
    expect(done.results[4].players![2].guess).toEqual(spot(2));
    expect(done.results[4].players![2].score).toBeGreaterThan(0);
  });

  it("goes past round five, and ends when one player is left", async () => {
    const back = await join(code, players[2]);
    expect(back.status).toBe("playing");
    const final = await finish(game, players, players[0], players[0]);
    expect(final.status).toBe("completed");
    expect(final.currentRound).toBe(6);
    expect(final.versus!.players.map((p) => p.eliminatedRound)).toEqual([null, 6, 6, 6, 6]);
    expect(final.versus!.players[0].place).toBe(1);
    // The four knocked out together are ranked by health left: whoever took the least damage is second.
    const damage = final.results[5].players!.map((p) => p.damage!);
    for (const [n, p] of final.versus!.players.entries()) {
      if (n === 0) continue;
      expect(p.place).toBe(2 + damage.slice(1).filter((d) => d < damage[n]).length);
    }
  });

  it("finishes with each player's own total", async () => {
    const final = await Promise.all(players.map((p) => state(game, p)));
    for (const [n, s] of final.entries()) {
      expect(s.status).toBe("completed");
      expect(s.results).toHaveLength(6);
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
    expect(done.results[1].players![0]).toMatchObject({ seat: 1, guess: null, distanceM: null, score: 0 });

    // The old host comes back as an ordinary player, with 0 for the round they missed.
    const back = await join(code, players[0]);
    expect(back.gameId).toBe(game);
    expect(back.isHost).toBe(false);
    const final = await playOut(game, players, players[1], 3);
    expect(final.status).toBe("completed");
    const mine = await state(game, players[0]);
    expect(mine.results.map((r) => r.score > 0)).toEqual([true, false, true, true, true, true]);
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
    expect(scored.results[0].players![1]).toMatchObject({ seat: 2, guess: null, distanceM: null, score: 0 });
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

describe("the health battle", () => {
  type Settings = { versus_start_health: number; versus_first_lock_seconds: number; versus_multiplier_base: number; versus_multiplier_step: number; versus_multiplier_from_round: number; guess_grace_ms: number };
  let settings: Settings;
  const multiplier = (round: number) =>
    Number(settings.versus_multiplier_base) + Number(settings.versus_multiplier_step) * Math.max(0, round - settings.versus_multiplier_from_round + 1);
  const deadline = async (game: string, round: number) =>
    Date.parse((await admin.from("game_rounds").select("deadline_at").eq("game_id", game).eq("round_no", round).single()).data!.deadline_at);
  /** Skips the intro: the clock started `secondsAgo` ago and has the rest of its 30 seconds. */
  const clockRunning = (game: string, round: number, secondsAgo = 1) =>
    update("game_rounds", { started_at: ago(secondsAgo), deadline_at: new Date(Date.now() + (30 - secondsAgo) * 1000).toISOString(), cut_at: null }, { game_id: game, round_no: round });

  beforeAll(async () => {
    settings = (await admin.from("settings").select("*").single()).data as Settings;
  });

  it("starts everyone at full health, on a round with the base multiplier and no round limit", async () => {
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    const s = await state(game, players[1]);
    expect(s.roundCount).toBeNull();
    expect(s.versus?.startHealth).toBe(settings.versus_start_health);
    expect(s.versus?.players.map((p) => [p.health, p.eliminatedRound, p.place])).toEqual(Array(3).fill([settings.versus_start_health, null, null]));
    expect(Number(s.round?.multiplier)).toBe(multiplier(1));
    expect(s.round?.shortened).toBe(false);
    expect(s.round!.deadlineAt - s.round!.startsAt).toBe(30_000);
  });

  it("takes (best − own score) × multiplier from everyone; the best scorer loses nothing", async () => {
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    const at = await answerOf(game, 1);
    await lock(game, players[0], 1, north(at, 0.3).lat, north(at, 0.3).lng);
    await lock(game, players[1], 1, at.lat, at.lng);
    await pin(game, players[2], 1, north(at, 1).lat, north(at, 1).lng);
    await goQuiet(code, players[2], 30);
    const s = await state(game, players[0]);
    const [a, b, c] = s.results[0].players!;
    expect(b).toMatchObject({ score: 5000, damage: 0, health: settings.versus_start_health, eliminated: false });
    expect(a.damage).toBe(Math.round((5000 - a.score) * multiplier(1)));
    expect(c.damage).toBe(Math.round((5000 - c.score) * multiplier(1)));
    expect(c.score).toBeGreaterThan(0);
    expect(s.versus!.players.map((p) => p.health)).toEqual([a, b, c].map((p) => settings.versus_start_health - p.damage!));
    expect(Number(s.results[0].multiplier)).toBe(multiplier(1));
  });

  it("cuts everyone's clock to the countdown at the first guess, once, when two players lock in at the same moment", async () => {
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    await clockRunning(game, 1);
    const before = await deadline(game, 1);
    const sentAt = Date.now();
    const [a, b] = await Promise.all([
      lock(game, players[0], 1, spot(0).lat, spot(0).lng),
      lock(game, players[1], 1, spot(1).lat, spot(1).lng),
    ]);
    const answeredAt = Date.now();
    expect([a.round?.locked, b.round?.locked]).toEqual([true, true]);
    // Both answers carry the same, single cut: the first lock's time plus the countdown.
    expect(a.round?.deadlineAt).toBe(b.round?.deadlineAt);
    const cut = await deadline(game, 1);
    expect(cut).toBe(a.round?.deadlineAt);
    expect(cut).toBeLessThan(before - 15_000);
    const countdown = settings.versus_first_lock_seconds * 1000;
    expect(cut).toBeGreaterThanOrEqual(sentAt + countdown - 1500);
    expect(cut).toBeLessThanOrEqual(answeredAt + countdown + 1500);

    // The third player sees the new clock, and can still pin and guess before it runs out.
    const third = await state(game, players[2]);
    expect(third.round).toMatchObject({ number: 1, locked: false, shortened: true, deadlineAt: cut });
    expect(await photoPath(game, players[2], 1)).not.toBeNull();
    expect((await pin(game, players[2], 1, spot(2).lat, spot(2).lng)).ok).toBe(true);
    // After the cut deadline (and its grace), the round is scored and the photo address closes.
    await update("game_rounds", { deadline_at: ago(3) }, { game_id: game, round_no: 1 });
    expect(await photoPath(game, players[2], 1)).toBeNull();
    const scored = await state(game, players[2]);
    expect(scored.round).toBeNull();
    expect(scored.results[0].players![2].guess).toEqual(spot(2));
  });

  it("leaves the clock alone when the first guess comes with less than the countdown left", async () => {
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    const left = settings.versus_first_lock_seconds * 1000 - 4000;
    await update("game_rounds", { started_at: ago(30 - left / 1000), deadline_at: new Date(Date.now() + left).toISOString() }, { game_id: game, round_no: 1 });
    const before = await deadline(game, 1);
    const locked = await lock(game, players[0], 1, spot(0).lat, spot(0).lng);
    expect(locked.round?.deadlineAt).toBe(before);
    expect(locked.round?.shortened).toBe(false);
    expect(await deadline(game, 1)).toBe(before);
  });

  it("counts the countdown from the clock's start when someone guesses during the intro", async () => {
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    const locked = await lock(game, players[0], 1, spot(0).lat, spot(0).lng);
    expect(locked.round!.startsAt).toBeGreaterThan(locked.serverNow);
    expect(locked.round!.deadlineAt - locked.round!.startsAt).toBe(settings.versus_first_lock_seconds * 1000);
  });

  it("does not wait for a player who disconnects during the countdown, and scores the pin they left", async () => {
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    await update("game_players", { health: 1_000_000 }, { game_id: game });
    await clockRunning(game, 1);
    await lock(game, players[0], 1, spot(0).lat, spot(0).lng);
    await pin(game, players[1], 1, spot(1).lat, spot(1).lng);
    await goQuiet(code, players[1], 30);
    const last = await lock(game, players[2], 1, spot(2).lat, spot(2).lng);
    expect(last.round).toBeNull();
    const dropped = last.results[0].players![1];
    expect(dropped.guess).toEqual(spot(1));
    expect(dropped.score).toBeGreaterThan(0);
    expect(dropped.damage).toBe(Math.max(...last.results[0].players!.map((p) => p.score)) - dropped.score);

    // Round two: one in, one drops without a pin, and the one who comes back mid-countdown keeps the cut clock.
    expect((await startRound(game, players[0])).round?.number).toBe(2);
    await clockRunning(game, 2);
    const first = await lock(game, players[0], 2, spot(0).lat, spot(0).lng);
    await goQuiet(code, players[2], 30);
    expect((await state(game, players[1])).round).toMatchObject({ number: 2, shortened: true, deadlineAt: first.round!.deadlineAt });
    const done = await lock(game, players[1], 2, spot(1).lat, spot(1).lng);
    expect(done.round).toBeNull();
    expect(done.results[1].players![2]).toMatchObject({ guess: null, score: 0 });
    expect(done.results[1].players![2].damage).toBe(Math.max(...done.results[1].players!.map((p) => p.score)));
  });

  it("knocks out two players in the same round, ranks them by health left, and lets them watch", async () => {
    const { code, players } = await lobby(4);
    const game = (await start(code, players[0])).gameId!;
    await update("game_players", { health: 500 }, { game_id: game, seat: 2 });
    await update("game_players", { health: 500 }, { game_id: game, seat: 3 });
    const at = await answerOf(game, 1);
    await lock(game, players[0], 1, at.lat, at.lng);
    await lock(game, players[1], 1, north(at, 0.5).lat, north(at, 0.5).lng);
    await lock(game, players[2], 1, north(at, 1).lat, north(at, 1).lng);
    const s = await lock(game, players[3], 1, north(at, 0.02).lat, north(at, 0.02).lng);
    expect(s.status).toBe("active");
    expect(s.results[0].players!.map((p) => p.eliminated)).toEqual([false, true, true, false]);
    expect(s.results[0].players!.map((p) => p.health)).toEqual([settings.versus_start_health, 0, 0, settings.versus_start_health - s.results[0].players![3].damage!]);
    expect(s.versus!.players.map((p) => p.eliminatedRound)).toEqual([null, 1, 1, null]);
    // Both are behind the two still standing; the one who missed by less is third.
    expect(s.versus!.players.map((p) => p.place)).toEqual([null, 3, 4, null]);

    // Round two: the knocked-out players can see the photo but not guess, and the round does not wait for them.
    expect((await startRound(game, players[0])).round?.number).toBe(2);
    expect(await photoPath(game, players[1], 2)).not.toBeNull();
    expect((await pin(game, players[1], 2, spot(1).lat, spot(1).lng)).error).toBe("eliminated");
    expect((await lock(game, players[2], 2, spot(2).lat, spot(2).lng)).error).toBe("eliminated");
    await lock(game, players[0], 2, spot(0).lat, spot(0).lng);
    const two = await lock(game, players[3], 2, spot(3).lat, spot(3).lng);
    expect(two.round).toBeNull();
    expect(two.results[1].players!.map((p) => p.seat)).toEqual([1, 4]);
    // A spectator's own view of the round: watching, with everyone's pins.
    const watching = await state(game, players[1]);
    expect(watching.results[1].guess).toBeNull();
    expect(watching.results[1].players).toHaveLength(2);
  });

  it("lets the one with the most health left win when the last players all reach 0 together", async () => {
    // Under the damage rule the round's best scorer loses nothing, so this cannot happen in a real
    // game. Forcing everyone to 0 health first is the only way to reach the rule.
    const { code, players } = await lobby(3);
    const game = (await start(code, players[0])).gameId!;
    await update("game_players", { health: 0 }, { game_id: game });
    const at = await answerOf(game, 1);
    await lock(game, players[0], 1, north(at, 0.2).lat, north(at, 0.2).lng);
    await lock(game, players[1], 1, at.lat, at.lng);
    const s = await lock(game, players[2], 1, north(at, 0.6).lat, north(at, 0.6).lng);
    expect(s.status).toBe("completed");
    expect(s.versus!.players.map((p) => p.eliminatedRound)).toEqual([1, 1, 1]);
    expect(s.versus!.players.map((p) => p.place)).toEqual([2, 1, 3]);
  });

  it("plays a long game past round 20 with rising multipliers and no repeated photo", { timeout: 120_000 }, async () => {
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    const rounds = 23;
    for (let round = 1; round < rounds; round++) {
      if (round > 1) expect((await startRound(game, players[0])).round?.number).toBe(round);
      // Both pin the same spot: level scores, no damage.
      await lock(game, players[0], round, spot(0).lat, spot(0).lng);
      const tied = await lock(game, players[1], round, spot(0).lat, spot(0).lng);
      expect(tied.round).toBeNull();
    }
    const opened = await startRound(game, players[0]);
    expect(Number(opened.round?.multiplier)).toBe(multiplier(rounds));
    const at = await answerOf(game, rounds);
    await lock(game, players[0], rounds, at.lat, at.lng);
    const end = await lock(game, players[1], rounds, north(at, 0.15).lat, north(at, 0.15).lng);
    const s = await state(game, players[1]);
    expect(s.results.map((r) => Number(r.multiplier))).toEqual(Array.from({ length: rounds }, (_, i) => multiplier(i + 1)));
    expect(s.results.slice(0, -1).every((r) => r.players!.every((p) => p.damage === 0))).toBe(true);
    const loser = end.results[rounds - 1].players![1];
    expect(loser.damage).toBe(Math.floor((5000 - loser.score) * multiplier(rounds) + 0.5));
    expect(loser.damage).toBeGreaterThan(settings.versus_start_health);
    expect(end.status).toBe("completed");
    expect(end.versus!.players.map((p) => p.place)).toEqual([1, 2]);
    const images = (await admin.from("game_rounds").select("image_id").eq("game_id", game)).data!.map((r) => r.image_id);
    expect(images).toHaveLength(rounds);
    expect(new Set(images).size).toBe(rounds);
  });

  it("ends the game on health when every photo has been used", { timeout: 300_000 }, async () => {
    const { count } = await admin.from("images").select("id", { count: "exact", head: true }).eq("hidden", false);
    const { code, players } = await lobby(2);
    const game = (await start(code, players[0])).gameId!;
    await update("game_players", { health: 4000 }, { game_id: game, seat: 2 });
    let last: State | null = null;
    for (let round = 1; round <= count!; round++) {
      if (round > 1) expect((await startRound(game, players[0])).round?.number).toBe(round);
      await lock(game, players[0], round, spot(0).lat, spot(0).lng);
      last = await lock(game, players[1], round, spot(0).lat, spot(0).lng);
    }
    expect(last!.status).toBe("active");
    const over = await startRound(game, players[0]);
    expect(over.status).toBe("completed");
    expect(over.currentRound).toBe(count);
    expect(over.versus!.players.map((p) => [p.health, p.place])).toEqual([[settings.versus_start_health, 1], [4000, 2]]);
  });
});

describe("versus games and the leaderboard", () => {
  const name = () => `lt_${randomBytes(5).toString("hex")}`;
  const board = (user: string | null) => rpc<Leaderboard>("leaderboard", { p_user: user, p_limit: 100, p_offset: 0 });

  it("never counts a versus game: the board is solo only", async () => {
    const { code, players } = await lobby(2);
    for (const p of players) await rpc("set_username", { p_user: p, p_username: name() });
    const game = (await start(code, players[0])).gameId!;
    const final = await playOut(game, players, players[0]);
    expect(final.status).toBe("completed");
    expect(final.totalScore).toBeGreaterThan(0);
    for (const p of players) expect((await board(p)).you).toBeNull();

    // A solo game does count, even one scoring less than the versus total.
    const solo = await admin.from("games").insert({ status: "completed", current_round: 5, created_by: players[0], completed_at: new Date().toISOString() }).select("id").single();
    await admin.from("game_players").insert({ game_id: solo.data!.id, user_id: players[0], total_score: 100 });
    expect((await board(players[0])).you).toMatchObject({ score: 100, mode: "solo" });
    expect((await board(players[1])).you).toBeNull();

    // The profile's best game follows the board; the versus game still counts as played (and won).
    const profile = await rpc<{ stats: { bestScore: number | null; gamesPlayed: number; versusPlayed: number; versusWon: number } }>("player_profile", {
      p_username: (await admin.from("profiles").select("username").eq("id", players[0]).single()).data!.username,
      p_viewer: null,
      p_recent: 10,
    });
    expect(profile.stats).toMatchObject({ bestScore: 100, gamesPlayed: 2, versusPlayed: 1, versusWon: 1 });
  });

  it("has no versus rows left on the board at all", async () => {
    const { data, error } = await admin.from("leaderboard_entries").select("rank").eq("mode", "versus");
    expect(error).toBeNull();
    expect(data).toEqual([]);
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
      ["_versus_multiplier", { p_round: 5 }],
      ["_versus_finish", { p_game: someone }],
    ];
    for (const [fn, args] of calls) {
      const { data, error } = await anon.rpc(fn, args);
      expect(error, fn).not.toBeNull();
      expect(data, fn).toBeNull();
    }
  });
});
