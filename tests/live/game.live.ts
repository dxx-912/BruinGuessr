/**
 * The game rules, checked against the real database.
 *
 *   npm run test:live
 *
 * The rules live in SQL (supabase/migrations/…_single_player.sql). These tests
 * call those functions the way the API routes do, with throwaway accounts, and
 * compare scores with the TypeScript reference in src/lib/geo.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { haversineMeters } from "../../src/lib/geo/distance";
import { scoreForDistance } from "../../src/lib/geo/scoring";
import type { GameState } from "../../src/lib/game/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const campus = JSON.parse(readFileSync(path.join(process.cwd(), "data/campus.geojson"), "utf8"));
const D: number = campus.properties.diagonal_m;

type ImageRow = { id: string; lat: number; lng: number; storage_path: string; report_count: number; hidden: boolean; hidden_reason: string | null };

const users: string[] = [];
let restoreImage: ImageRow | null = null;

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

const state = (game: string, user: string) => rpc<GameState>("game_state", { p_game: game, p_user: user });
const startGame = async (user: string) => (await rpc<{ id: string }>("start_game", { p_user: user })).id;
const startRound = (game: string, user: string) => rpc<GameState>("start_round", { p_game: game, p_user: user });
const pin = (game: string, user: string, round: number, lat: number, lng: number) =>
  rpc<{ ok?: true; error?: string }>("place_pin", { p_game: game, p_user: user, p_round: round, p_lat: lat, p_lng: lng });
const lock = (game: string, user: string, round: number, lat: number | null = null, lng: number | null = null) =>
  rpc<GameState & { error?: string }>("lock_guess", { p_game: game, p_user: user, p_round: round, p_lat: lat, p_lng: lng });
const photoPath = (game: string, user: string, round: number) =>
  rpc<string | null>("round_photo_path", { p_game: game, p_user: user, p_round: round });
const report = (game: string, user: string, round: number, reason = "unclear") =>
  rpc<{ ok?: true; error?: string }>("report_image", { p_game: game, p_user: user, p_round: round, p_reason: reason });

async function imageOf(game: string, round: number): Promise<ImageRow> {
  const r = await admin.from("game_rounds").select("image_id").eq("game_id", game).eq("round_no", round).single();
  if (r.error) throw new Error(r.error.message);
  const i = await admin.from("images").select("id, lat, lng, storage_path, report_count, hidden, hidden_reason").eq("id", r.data.image_id).single();
  if (i.error) throw new Error(i.error.message);
  return i.data;
}

/** Pretends the clock ran: moves a round's deadline to `secondsAgo` in the past. */
async function expire(game: string, round: number, secondsAgo: number) {
  const deadline = new Date(Date.now() - secondsAgo * 1000);
  const { error } = await admin
    .from("game_rounds")
    .update({ started_at: new Date(deadline.getTime() - 30_000).toISOString(), deadline_at: deadline.toISOString() })
    .eq("game_id", game)
    .eq("round_no", round);
  if (error) throw new Error(error.message);
}

afterAll(async () => {
  // Deleting an account removes its profile, games, rounds, guesses and reports.
  for (const id of users) await admin.auth.admin.deleteUser(id);
  if (restoreImage) {
    await admin
      .from("images")
      .update({ report_count: restoreImage.report_count, hidden: restoreImage.hidden, hidden_reason: restoreImage.hidden_reason })
      .eq("id", restoreImage.id);
  }
});

describe("scoring in the database matches the TypeScript reference", () => {
  it("uses the campus diagonal from data/campus.geojson as D", async () => {
    const { data, error } = await admin.from("settings").select("*").single();
    expect(error).toBeNull();
    expect(data.campus_diagonal_m).toBe(D);
    expect(data.perfect_radius_m).toBe(10);
    expect(data.max_round_score).toBe(5000);
    expect(data.score_decay).toBe(10);
    expect(data.report_hide_threshold).toBe(3);
  });

  it("gives the same score for a spread of distances", async () => {
    // The last two are pins dropped a continent away and on the far side of the planet.
    const distances = [0, 5, 10, 10.01, 11, 25, 50, 84.3, 100, 159.2, 250, 500, 750.5, 1000, 1500, D, 3000, 10_000, 4e6, 2e7];
    const got = await Promise.all(distances.map((d) => rpc<number>("score_for_distance", { p_distance_m: d })));
    expect(got).toEqual(distances.map((d) => scoreForDistance(d, D)));
    expect(got[0]).toBe(5000);
    expect(got[2]).toBe(5000);
    expect(got.at(-1)).toBe(0);
  });

  it("measures the same distance between two points", async () => {
    const royce = { lat: 34.07284, lng: -118.44218 };
    const points = [
      { lat: 34.07284, lng: -118.44218 },
      { lat: 34.0729, lng: -118.4421 },
      { lat: 34.07051, lng: -118.44453 },
      { lat: 34.0638, lng: -118.4554 },
      { lat: 34.0781, lng: -118.4374 },
      { lat: 40.7128, lng: -74.006 },
    ];
    const got = await Promise.all(
      points.map((p) => rpc<number>("haversine_m", { lat1: royce.lat, lng1: royce.lng, lat2: p.lat, lng2: p.lng })),
    );
    points.forEach((p, i) => expect(got[i]).toBeCloseTo(haversineMeters(royce, p), 6));
  });
});

describe("a solo game", () => {
  let user: string;
  let stranger: string;
  let game: string;
  const scores: number[] = [];

  beforeAll(async () => {
    user = await newUser();
    stranger = await newUser();
    game = await startGame(user);
  });

  it("starts with five different photos and nothing revealed", async () => {
    const s = await state(game, user);
    expect(s).toMatchObject({ status: "active", mode: "solo", roundCount: 5, roundSeconds: 30, currentRound: 0, round: null, results: [], totalScore: 0 });
    const rounds = await admin.from("game_rounds").select("image_id").eq("game_id", game);
    expect(new Set(rounds.data!.map((r) => r.image_id)).size).toBe(5);
    expect(await photoPath(game, user, 1)).toBeNull();
  });

  it("is invisible to anyone who is not in it", async () => {
    expect(await state(game, stranger)).toEqual({ error: "not_found" });
    expect(await startRound(game, stranger)).toEqual({ error: "not_found" });
  });

  it("round 1: the photo is fetchable only by the player, only while the round is open; a guess on the spot scores 5,000", async () => {
    const s = await startRound(game, user);
    expect(s.currentRound).toBe(1);
    expect(s.round).toMatchObject({ number: 1, pin: null });
    expect(s.round!.deadlineAt - s.round!.startsAt).toBe(30_000);
    // The clock starts a couple of seconds after the round opens, so the photo can load first.
    expect(s.round!.startsAt - s.serverNow).toBeGreaterThan(1500);
    expect(s.round!.startsAt - s.serverNow).toBeLessThanOrEqual(2500);

    const image = await imageOf(game, 1);
    expect(await photoPath(game, user, 1)).toBe(image.storage_path);
    expect(await photoPath(game, stranger, 1)).toBeNull();
    expect(await photoPath(game, user, 2)).toBeNull();

    // Nothing about the photo is in what the player is told while guessing.
    const told = JSON.stringify(s);
    expect(told).not.toContain(image.id);
    expect(told).not.toContain(image.storage_path);
    expect(told).not.toContain(String(image.lat));
    expect(told).not.toContain(String(image.lng));

    // Starting the round again changes nothing.
    const again = await startRound(game, user);
    expect(again.round!.deadlineAt).toBe(s.round!.deadlineAt);

    expect(await pin(game, user, 1, 34.07, -118.44)).toEqual({ ok: true });
    expect((await state(game, user)).round!.pin).toEqual({ lat: 34.07, lng: -118.44 });
    expect(await pin(game, user, 2, 34.07, -118.44)).toEqual({ error: "round_closed" });
    expect(await pin(game, stranger, 1, 34.07, -118.44)).toEqual({ error: "not_found" });
    expect(await pin(game, user, 1, 134.07, -118.44)).toEqual({ error: "bad_pin" });

    const done = await lock(game, user, 1, image.lat, image.lng);
    expect(done.round).toBeNull();
    expect(done.results).toHaveLength(1);
    expect(done.results[0]).toMatchObject({ round: 1, score: 5000, distanceM: 0, guess: { lat: image.lat, lng: image.lng }, answer: { lat: image.lat, lng: image.lng }, reported: false });
    expect(done.results[0].credit.photographer).toBeTruthy();
    expect(done.results[0].credit.license).toBeTruthy();
    expect(done.totalScore).toBe(5000);
    scores.push(5000);

    // The per-round photo address stops working the moment the round is scored.
    expect(await photoPath(game, user, 1)).toBeNull();
    // And the pin cannot be moved afterwards.
    expect(await pin(game, user, 1, 34.07, -118.44)).toEqual({ error: "round_closed" });
  });

  it("round 2: when time runs out, the pin already on the map is the guess", async () => {
    await startRound(game, user);
    const image = await imageOf(game, 2);
    const guess = { lat: image.lat + 0.0012, lng: image.lng - 0.0009 };
    await pin(game, user, 2, 34.0, -118.4);
    await pin(game, user, 2, guess.lat, guess.lng);

    await expire(game, 2, 2);
    expect(await photoPath(game, user, 2)).toBeNull();
    const s = await state(game, user);
    expect(s.round).toBeNull();
    const d = haversineMeters(guess, image);
    // Coordinates come back rounded to about a millionth of a millimetre.
    expect(s.results[1].guess!.lat).toBeCloseTo(guess.lat, 9);
    expect(s.results[1].guess!.lng).toBeCloseTo(guess.lng, 9);
    expect(s.results[1].distanceM).toBeCloseTo(d, 6);
    expect(s.results[1].score).toBe(scoreForDistance(d, D));
    expect(s.results[1].score).toBeGreaterThan(0);
    expect(s.results[1].score).toBeLessThan(5000);
    scores.push(s.results[1].score);
  });

  it("round 3: no pin means 0 points", async () => {
    await startRound(game, user);
    expect(await lock(game, user, 3)).toEqual({ error: "no_pin" });
    await expire(game, 3, 2);
    const s = await state(game, user);
    expect(s.results[2]).toMatchObject({ round: 3, guess: null, distanceM: null, score: 0 });
    scores.push(0);
  });

  it("round 4: a guess inside the grace period counts, a later one is refused", async () => {
    await startRound(game, user);
    const image = await imageOf(game, 4);
    const early = { lat: image.lat + 0.002, lng: image.lng };

    // Half a second after the deadline: still accepted.
    await expire(game, 4, 0.5);
    expect(await pin(game, user, 4, early.lat, early.lng)).toEqual({ ok: true });

    // Ten seconds after the deadline: refused, and the earlier pin is what gets scored.
    await expire(game, 4, 10);
    expect(await pin(game, user, 4, image.lat, image.lng)).toEqual({ error: "too_late" });
    const s = await lock(game, user, 4, image.lat, image.lng);
    expect(s.results[3].guess!.lat).toBeCloseTo(early.lat, 9);
    expect(s.results[3].guess!.lng).toBeCloseTo(early.lng, 9);
    expect(s.results[3].score).toBe(scoreForDistance(haversineMeters(early, image), D));
    expect(s.results[3].score).toBeLessThan(5000);
    scores.push(s.results[3].score);
  });

  it("round 5 finishes the game with the right total", async () => {
    const opened = await startRound(game, user);
    expect(opened.currentRound).toBe(5);
    const image = await imageOf(game, 5);
    await pin(game, user, 5, image.lat + 0.0003, image.lng + 0.0003);
    const s = await lock(game, user, 5);
    scores.push(s.results[4].score);
    expect(s.status).toBe("completed");
    expect(s.results).toHaveLength(5);
    expect(s.totalScore).toBe(scores.reduce((a, b) => a + b, 0));

    const row = await admin.from("game_players").select("total_score").eq("game_id", game).single();
    expect(row.data!.total_score).toBe(s.totalScore);
    const g = await admin.from("games").select("status, completed_at").eq("id", game).single();
    expect(g.data!.status).toBe("completed");
    expect(g.data!.completed_at).not.toBeNull();

    // A finished game cannot be continued.
    const after = await startRound(game, user);
    expect(after.currentRound).toBe(5);
    expect(after.round).toBeNull();
  });

  it("a new game avoids photos from recent games and ends an unfinished one", async () => {
    const first = await admin.from("game_rounds").select("image_id").eq("game_id", game);
    const seen = new Set(first.data!.map((r) => r.image_id));

    const second = await startGame(user);
    const rounds2 = await admin.from("game_rounds").select("image_id").eq("game_id", second);
    expect(rounds2.data!.some((r) => seen.has(r.image_id))).toBe(false);
    await startRound(second, user);

    const third = await startGame(user);
    const abandoned = await state(second, user);
    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.round).toBeNull();
    // The abandoned game's photo is no longer fetchable, and it cannot be played on.
    expect(await photoPath(second, user, 1)).toBeNull();
    expect(await pin(second, user, 1, 34.07, -118.44)).toEqual({ error: "round_closed" });
    expect((await startRound(second, user)).round).toBeNull();
    expect((await state(third, user)).status).toBe("active");
  });
});

describe("reporting a photo", () => {
  it("hides a photo once three different accounts report it, and caps reports per day", async () => {
    const players = [await newUser(), await newUser(), await newUser()];
    const games: string[] = [];
    let target: ImageRow | null = null;

    for (const player of players) {
      const game = await startGame(player);
      games.push(game);
      if (!target) {
        target = await imageOf(game, 1);
        restoreImage = target;
      } else {
        // Give this player the same photo in round 1 (swapping it out of a later round if it is there).
        const rounds = await admin.from("game_rounds").select("round_no, image_id").eq("game_id", game);
        const clash = rounds.data!.find((r) => r.image_id === target!.id && r.round_no !== 1);
        if (clash) {
          const inGame = rounds.data!.map((r) => r.image_id);
          const spare = await admin.from("images").select("id").eq("hidden", false).not("id", "in", `(${inGame.join(",")})`).limit(1).single();
          await admin.from("game_rounds").update({ image_id: spare.data!.id }).eq("game_id", game).eq("round_no", clash.round_no);
        }
        const upd = await admin.from("game_rounds").update({ image_id: target.id }).eq("game_id", game).eq("round_no", 1);
        expect(upd.error).toBeNull();
      }
      await startRound(game, player);
    }
    expect(target!.hidden).toBe(false);

    // Not before the round is over.
    expect(await report(games[0], players[0], 1)).toEqual({ error: "not_found" });
    for (let i = 0; i < 3; i++) await lock(games[i], players[i], 1, 34.07, -118.44);

    const image = async () => (await admin.from("images").select("report_count, hidden, hidden_reason").eq("id", target!.id).single()).data!;

    expect(await report(games[0], players[0], 1, "nonsense")).toEqual({ error: "bad_reason" });
    expect(await report(games[0], players[0], 1)).toEqual({ ok: true });
    expect((await state(games[0], players[0])).results[0].reported).toBe(true);
    // The same account reporting again does not count twice.
    expect(await report(games[0], players[0], 1)).toEqual({ ok: true });
    expect(await image()).toMatchObject({ report_count: target!.report_count + 1, hidden: false });
    // Someone else's game cannot be used to report.
    expect(await report(games[0], players[1], 1)).toEqual({ error: "not_found" });

    expect(await report(games[1], players[1], 1, "wrong_location")).toEqual({ ok: true });
    expect(await image()).toMatchObject({ report_count: target!.report_count + 2, hidden: false });

    expect(await report(games[2], players[2], 1)).toEqual({ ok: true });
    expect(await image()).toMatchObject({ report_count: target!.report_count + 3, hidden: true, hidden_reason: "reported by players" });

    // Hidden, not deleted, and out of rotation for new games.
    const fresh = await newUser();
    for (let i = 0; i < 3; i++) {
      const g = await startGame(fresh);
      const rounds = await admin.from("game_rounds").select("image_id").eq("game_id", g);
      expect(rounds.data!.map((r) => r.image_id)).not.toContain(target!.id);
    }

    // Daily cap: ten reports already filed today, the eleventh is refused.
    const busy = await newUser();
    const game = await startGame(busy);
    await startRound(game, busy);
    await pin(game, busy, 1, 34.07, -118.44);
    await lock(game, busy, 1);
    const mine = (await imageOf(game, 1)).id;
    const others = await admin.from("images").select("id").neq("id", mine).neq("id", target!.id).limit(10);
    const filler = await admin.from("image_reports").insert(others.data!.map((o) => ({ image_id: o.id, user_id: busy, reason: "other" })));
    expect(filler.error).toBeNull();
    expect(await report(game, busy, 1)).toEqual({ error: "daily_cap" });
  });
});

describe("the public key (what a browser has) gets nothing", () => {
  it("cannot read any game table", async () => {
    for (const table of ["settings", "profiles", "games", "game_players", "game_rounds", "guesses", "image_reports", "images"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, `${table} is readable`).toBe(true);
    }
  });

  it("cannot call any game function", async () => {
    const id = randomUUID();
    const calls: [string, Record<string, unknown>][] = [
      ["start_game", { p_user: id }],
      ["game_state", { p_game: id, p_user: id }],
      ["start_round", { p_game: id, p_user: id }],
      ["place_pin", { p_game: id, p_user: id, p_round: 1, p_lat: 34, p_lng: -118 }],
      ["lock_guess", { p_game: id, p_user: id, p_round: 1 }],
      ["round_photo_path", { p_game: id, p_user: id, p_round: 1 }],
      ["report_image", { p_game: id, p_user: id, p_round: 1 }],
      ["score_for_distance", { p_distance_m: 5 }],
      ["_build_state", { p_game: id, p_user: id }],
      ["_resolve_round", { p_game: id, p_round: 1 }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await anon.rpc(fn, args);
      expect(error, `${fn} is callable with the public key`).not.toBeNull();
    }
  });

  it("cannot fetch a photo by its storage filename", async () => {
    const { data } = await admin.from("images").select("storage_path").eq("hidden", false).limit(1).single();
    const direct = await fetch(`${url}/storage/v1/object/public/photos/${data!.storage_path}`);
    expect(direct.ok).toBe(false);
    const viaKey = await anon.storage.from("photos").download(data!.storage_path);
    expect(viaKey.error).not.toBeNull();
    const signed = await anon.storage.from("photos").createSignedUrl(data!.storage_path, 60);
    expect(signed.error).not.toBeNull();
    // The server can still read it.
    const server = await admin.storage.from("photos").download(data!.storage_path);
    expect(server.error).toBeNull();
    expect(server.data!.type).toBe("image/webp");
  });
});
