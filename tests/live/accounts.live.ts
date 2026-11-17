/**
 * Phase 6a in the real database: guests, public profiles, username changes and
 * account deletion. Every account and guest made here is a throwaway, deleted
 * at the end; nothing touches a real player.
 *
 *   npm run test:live
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { GameState } from "../../src/lib/game/types";
import type { PlayerProfile } from "../../src/lib/profile";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const users: string[] = [];
const guests: string[] = [];
/** Network hashes made up for this run, so the per-network limits start from zero. */
const networks: string[] = [];

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** A throwaway account with a username, flagged as a test account so it never shows on the real board. */
async function newPlayer(name?: string): Promise<{ id: string; username: string }> {
  const { data, error } = await admin.auth.admin.createUser({ email: `live-test-${randomUUID()}@bruinguessr.test`, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const username = name ?? `t_${randomBytes(5).toString("hex")}`;
  await admin.from("profiles").update({ is_test: true }).eq("id", data.user.id);
  const set = await rpc<{ ok?: true; error?: string }>("set_username", { p_user: data.user.id, p_username: username });
  expect(set.ok).toBe(true);
  return { id: data.user.id, username };
}

const network = () => {
  const n = `live-test-network-${randomUUID()}`;
  networks.push(n);
  return n;
};
const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest("hex");

async function newGuest(ip = network()): Promise<string> {
  const made = await rpc<{ id?: string; error?: string }>("create_guest", { p_token_hash: tokenHash(), p_ip_hash: ip });
  expect(made.id).toBeTypeOf("string");
  guests.push(made.id!);
  return made.id!;
}

/** Plays a whole solo game, guessing every round at the answer's latitude shifted north by `offsetM` meters. */
async function playGame(game: string, user: string, offsetM = 0): Promise<GameState> {
  let state = await rpc<GameState>("game_state", { p_game: game, p_user: user });
  for (let n = 1; n <= state.roundCount; n++) {
    await rpc("start_round", { p_game: game, p_user: user });
    const round = await admin.from("game_rounds").select("images(lat, lng)").eq("game_id", game).eq("round_no", n).single();
    const answer = round.data!.images as unknown as { lat: number; lng: number };
    state = await rpc<GameState>("lock_guess", { p_game: game, p_user: user, p_round: n, p_lat: answer.lat + offsetM / 111_320, p_lng: answer.lng });
  }
  return state;
}

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (guests.length) await admin.from("profiles").delete().in("id", guests);
  if (networks.length) {
    await admin.from("guest_game_starts").delete().in("ip_hash", networks);
    await admin.from("guests").delete().in("ip_hash", networks);
  }
});

describe("guests", () => {
  it("get a profile with no account, no username and nothing on the leaderboard, even after a full game", async () => {
    const guest = await newGuest();
    const profile = await admin.from("profiles").select("is_guest, username").eq("id", guest).single();
    expect(profile.data).toEqual({ is_guest: true, username: null });

    const started = await rpc<{ id?: string }>("start_guest_game", { p_guest: guest, p_ip_hash: networks.at(-1) });
    const done = await playGame(started.id!, guest);
    expect(done.status).toBe("completed");
    expect(done.totalScore).toBe(25_000);

    const board = await admin.from("leaderboard_entries").select("user_id").eq("user_id", guest);
    expect(board.data).toEqual([]);
    // A guest can never be given a name, so can never be put on the board.
    const named = await admin.from("profiles").update({ username: "guest_name" }).eq("id", guest);
    expect(named.error).not.toBeNull();
  });

  it("follow the anti-cheat rules exactly like players: no photo before the round opens, none after it ends, nobody else's", async () => {
    const guest = await newGuest();
    const other = await newGuest();
    const game = (await rpc<{ id: string }>("start_guest_game", { p_guest: guest, p_ip_hash: networks.at(-2) })).id;
    expect(await rpc("round_photo_path", { p_game: game, p_user: guest, p_round: 1 })).toBeNull();
    const open = await rpc<GameState>("start_round", { p_game: game, p_user: guest });
    expect(open.results).toEqual([]);
    expect(JSON.stringify(open)).not.toMatch(/"lat"|storage|source/);
    expect(await rpc("round_photo_path", { p_game: game, p_user: guest, p_round: 1 })).toBeTypeOf("string");
    expect(await rpc("round_photo_path", { p_game: game, p_user: other, p_round: 1 })).toBeNull();
    expect(await rpc("game_state", { p_game: game, p_user: other })).toEqual({ error: "not_found" });
    await rpc("lock_guess", { p_game: game, p_user: guest, p_round: 1, p_lat: 34.07, p_lng: -118.44 });
    expect(await rpc("round_photo_path", { p_game: game, p_user: guest, p_round: 1 })).toBeNull();
  });

  it("cannot report photos, because a guest costs nothing to make", async () => {
    const guest = await newGuest();
    const game = (await rpc<{ id: string }>("start_guest_game", { p_guest: guest, p_ip_hash: networks.at(-1) })).id;
    await rpc("start_round", { p_game: game, p_user: guest });
    await rpc("lock_guess", { p_game: game, p_user: guest, p_round: 1, p_lat: 34.07, p_lng: -118.44 });
    expect(await rpc("report_image", { p_game: game, p_user: guest, p_round: 1, p_reason: "unclear" })).toEqual({ error: "account_required" });
    const reports = await admin.from("image_reports").select("user_id").eq("user_id", guest);
    expect(reports.data).toEqual([]);
  });

  it("are limited to 20 games an hour each", async () => {
    const ip = network();
    const guest = await newGuest(ip);
    const rows = Array.from({ length: 19 }, () => ({ guest_id: guest, ip_hash: ip }));
    await admin.from("guest_game_starts").insert(rows);
    expect((await rpc<{ id?: string }>("start_guest_game", { p_guest: guest, p_ip_hash: ip })).id).toBeTypeOf("string");
    expect(await rpc("start_guest_game", { p_guest: guest, p_ip_hash: ip })).toEqual({ error: "rate_limited" });
    // Starts from more than an hour ago no longer count.
    await admin.from("guest_game_starts").update({ created_at: new Date(Date.now() - 61 * 60_000).toISOString() }).eq("guest_id", guest);
    expect((await rpc<{ id?: string }>("start_guest_game", { p_guest: guest, p_ip_hash: ip })).id).toBeTypeOf("string");
  });

  it("are limited per network (guest_games_per_ip_hour), however many guests it makes", async () => {
    const { guest_games_per_ip_hour: limit } = (await admin.from("settings").select("guest_games_per_ip_hour").single()).data!;
    const ip = network();
    const first = await newGuest(ip);
    await admin.from("guest_game_starts").insert(Array.from({ length: limit }, () => ({ guest_id: first, ip_hash: ip })));
    const fresh = await newGuest(ip);
    expect(await rpc("start_guest_game", { p_guest: fresh, p_ip_hash: ip })).toEqual({ error: "rate_limited" });
    // Another network is unaffected.
    const elsewhere = network();
    const away = await newGuest(elsewhere);
    expect((await rpc<{ id?: string }>("start_guest_game", { p_guest: away, p_ip_hash: elsewhere })).id).toBeTypeOf("string");
  });

  it("are limited in how many new guests one network makes an hour (guest_new_per_ip_hour)", async () => {
    const { guest_new_per_ip_hour: limit } = (await admin.from("settings").select("guest_new_per_ip_hour").single()).data!;
    const ip = network();
    // Fill the hour up to one short of the limit directly, then make the last one through the function.
    const ids = Array.from({ length: limit - 1 }, () => randomUUID());
    guests.push(...ids);
    expect((await admin.from("profiles").insert(ids.map((id) => ({ id, is_guest: true })))).error).toBeNull();
    expect((await admin.from("guests").insert(ids.map((id) => ({ id, token_hash: tokenHash(), ip_hash: ip })))).error).toBeNull();
    await newGuest(ip);
    expect(await rpc("create_guest", { p_token_hash: tokenHash(), p_ip_hash: ip })).toEqual({ error: "rate_limited" });
  });

  it("cannot use the guest start for a real account, and a guest token is looked up only by its hash", async () => {
    const player = await newPlayer();
    expect(await rpc("start_guest_game", { p_guest: player.id, p_ip_hash: network() })).toEqual({ error: "unauthorized" });
    expect(await rpc("guest_from_token", { p_token_hash: tokenHash() })).toBeNull();
    expect(await rpc("create_guest", { p_token_hash: "not-a-hash", p_ip_hash: network() })).toEqual({ error: "bad_request" });
  });

  it("are deleted with their games after a week away", async () => {
    const ip = network();
    const old = await newGuest(ip);
    const game = (await rpc<{ id: string }>("start_guest_game", { p_guest: old, p_ip_hash: ip })).id;
    await admin.from("guests").update({ last_seen_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq("id", old);
    await newGuest(); // making a guest runs the clean-up
    expect((await admin.from("profiles").select("id").eq("id", old)).data).toEqual([]);
    expect((await admin.from("games").select("id").eq("id", game)).data).toEqual([]);
  });
});

describe("profiles", () => {
  it("show stats from completed games only, found by username in any capitals, with nothing private in them", async () => {
    const player = await newPlayer();
    const perfect = (await rpc<{ id: string }>("start_game", { p_user: player.id })).id;
    await playGame(perfect, player.id); // five bullseyes
    const far = (await rpc<{ id: string }>("start_game", { p_user: player.id })).id;
    const farState = await playGame(far, player.id, 300);
    await rpc("start_game", { p_user: player.id }); // left unfinished: abandoned by the next start, never counted
    await rpc("start_game", { p_user: player.id });

    const profile = await rpc<PlayerProfile>("player_profile", { p_username: player.username.toUpperCase(), p_viewer: null, p_recent: 10 });
    expect(profile.username).toBe(player.username);
    expect(profile.isYou).toBe(false);
    expect(profile.rank).toBeNull(); // test accounts are never on the board
    expect(profile.stats).toEqual({
      bestScore: 25_000,
      gamesPlayed: 2,
      roundsPlayed: 10,
      averageRound: Math.round((25_000 + farState.totalScore) / 10),
      bullseyes: 5,
      versusPlayed: 0,
      versusWon: 0,
    });
    expect(profile.recent).toHaveLength(2);
    expect(profile.recent[0].total).toBe(farState.totalScore);
    expect(profile.recent[0].rounds).toHaveLength(5);
    expect(profile.recent[0].rounds[0]).toEqual({ round: 1, distanceM: expect.any(Number), score: expect.any(Number) });

    const text = JSON.stringify(profile);
    expect(text).not.toContain(player.id);
    expect(text).not.toContain(perfect);
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/"lat"|"lng"|answer|storage/);

    const own = await rpc<PlayerProfile>("player_profile", { p_username: player.username, p_viewer: player.id, p_recent: 10 });
    expect(own.isYou).toBe(true);
    expect(await rpc("player_profile", { p_username: "nobody_has_this", p_viewer: null, p_recent: 10 })).toBeNull();
  });

  it("count versus games played and won", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const game = await admin.from("games").insert({ mode: "versus", status: "completed", current_round: 5, created_by: a.id, completed_at: new Date().toISOString() }).select("id").single();
    await admin.from("game_players").insert([
      { game_id: game.data!.id, user_id: a.id, total_score: 12_000, seat: 1 },
      { game_id: game.data!.id, user_id: b.id, total_score: 9_000, seat: 2 },
    ]);
    const pa = await rpc<PlayerProfile>("player_profile", { p_username: a.username, p_viewer: null, p_recent: 10 });
    const pb = await rpc<PlayerProfile>("player_profile", { p_username: b.username, p_viewer: null, p_recent: 10 });
    expect([pa.stats.versusPlayed, pa.stats.versusWon]).toEqual([1, 1]);
    expect([pb.stats.versusPlayed, pb.stats.versusWon]).toEqual([1, 0]);
    expect(pb.recent[0]).toMatchObject({ mode: "versus", place: 2, players: 2 });
  });
});

describe("changing a username", () => {
  it("follows the pick rules, then waits 30 days", async () => {
    const taken = await newPlayer();
    const player = await newPlayer();
    const change = (name: string) => rpc<{ ok?: true; username?: string; error?: string; nextChangeAt?: number }>("change_username", { p_user: player.id, p_username: name });

    expect(await rpc("username_next_change", { p_user: player.id })).toBeNull();
    expect(await change("no spaces")).toEqual({ error: "bad_username" });
    expect(await change(player.username)).toEqual({ error: "same_name" });
    expect(await change(taken.username.toUpperCase())).toEqual({ error: "username_taken" });

    const renamed = `${player.username}x`;
    const first = await change(renamed);
    expect(first.ok).toBe(true);
    const days = (first.nextChangeAt! - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    const second = await change(`${player.username}y`);
    expect(second.error).toBe("too_soon");
    expect(second.nextChangeAt).toBe(first.nextChangeAt);
    expect(await rpc("username_next_change", { p_user: player.id })).toBe(first.nextChangeAt);

    // The old name is free again.
    expect(await rpc("username_available", { p_username: player.username })).toBe(true);

    // 31 days later: allowed again, and changing only the capitals is a change.
    await admin.from("profiles").update({ username_changed_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("id", player.id);
    expect((await change(renamed.toUpperCase())).ok).toBe(true);
  });

  it("is refused for guests and for accounts with no name yet", async () => {
    const guest = await newGuest();
    expect(await rpc("change_username", { p_user: guest, p_username: "guest_rename" })).toEqual({ error: "no_username" });
  });
});

describe("deleting an account", () => {
  it("removes the profile, solo games and leaderboard entry, and leaves versus games to the other players", async () => {
    const leaving = await newPlayer();
    const staying = await newPlayer();
    const solo = (await rpc<{ id: string }>("start_game", { p_user: leaving.id })).id;
    await playGame(solo, leaving.id);
    const versus = await admin.from("games").insert({ mode: "versus", status: "completed", current_round: 5, created_by: leaving.id, completed_at: new Date().toISOString() }).select("id").single();
    await admin.from("game_players").insert([
      { game_id: versus.data!.id, user_id: leaving.id, total_score: 10_000, seat: 1 },
      { game_id: versus.data!.id, user_id: staying.id, total_score: 8_000, seat: 2 },
    ]);
    // Flagged test accounts are hidden from the board; unflag to see the entry go.
    await admin.from("profiles").update({ is_test: false }).eq("id", leaving.id);
    expect((await admin.from("leaderboard_entries").select("user_id").eq("user_id", leaving.id)).data).toHaveLength(1);

    const { error } = await admin.auth.admin.deleteUser(leaving.id);
    expect(error).toBeNull();

    expect((await admin.from("profiles").select("id").eq("id", leaving.id)).data).toEqual([]);
    expect((await admin.from("games").select("id").eq("id", solo)).data).toEqual([]);
    expect((await admin.from("leaderboard_entries").select("user_id").eq("user_id", leaving.id)).data).toEqual([]);
    const left = await admin.from("games").select("id, created_by").eq("id", versus.data!.id).single();
    expect(left.data).toEqual({ id: versus.data!.id, created_by: null });
    const players = await admin.from("game_players").select("user_id").eq("game_id", versus.data!.id);
    expect(players.data).toEqual([{ user_id: staying.id }]);
    expect((await rpc<PlayerProfile>("player_profile", { p_username: staying.username, p_viewer: null, p_recent: 10 })).stats.versusPlayed).toBe(1);
    expect(await rpc("player_profile", { p_username: leaving.username, p_viewer: null, p_recent: 10 })).toBeNull();
  });

  it("cannot be undone by a leftover sign-in token: no profile without an account", async () => {
    const ghost = randomUUID();
    const insert = await admin.from("profiles").insert({ id: ghost });
    expect(insert.error?.message).toContain("has no account");
    const pick = await admin.rpc("set_username", { p_user: ghost, p_username: "ghost_name" });
    expect(pick.error).not.toBeNull();
  });
});

describe("the public key gets nothing new", () => {
  it("cannot read guests or rate-limit rows", async () => {
    for (const table of ["guests", "guest_game_starts"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it("cannot call any of the new functions", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["create_guest", { p_token_hash: tokenHash(), p_ip_hash: "x" }],
      ["start_guest_game", { p_guest: randomUUID(), p_ip_hash: "x" }],
      ["guest_from_token", { p_token_hash: tokenHash() }],
      ["change_username", { p_user: randomUUID(), p_username: "abc" }],
      ["username_next_change", { p_user: randomUUID() }],
      ["player_profile", { p_username: "abc", p_viewer: null, p_recent: 1 }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await anon.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
  });
});
