/**
 * Usernames and the leaderboard, checked against the real database.
 *
 *   npm run test:live
 *
 * Games are written straight into the tables (finished, with set totals and
 * completion times) so the ranking rules can be tested without playing them.
 * Other players may already be on the real leaderboard, so these tests check
 * the order of the test accounts among themselves, never absolute ranks.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Leaderboard } from "../../src/lib/leaderboard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

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

const uniqueName = () => `lt_${randomBytes(5).toString("hex")}`;
const setUsername = (user: string, name: string) => rpc<{ ok?: true; username?: string; error?: string }>("set_username", { p_user: user, p_username: name });
const board = (user: string | null, limit = 100, offset = 0) => rpc<Leaderboard>("leaderboard", { p_user: user, p_limit: limit, p_offset: offset });

/** A finished (or abandoned) game with set totals, completed `minutesAgo` minutes ago. */
async function fakeGame(players: Record<string, number>, minutesAgo: number, opts: { mode?: "solo" | "versus"; status?: "completed" | "abandoned" | "active" } = {}) {
  const status = opts.status ?? "completed";
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const [first] = Object.keys(players);
  const game = await admin
    .from("games")
    .insert({
      mode: opts.mode ?? "solo",
      status,
      current_round: 5,
      created_by: first,
      created_at: at,
      completed_at: status === "completed" ? at : null,
      abandoned_at: status === "abandoned" ? at : null,
    })
    .select("id")
    .single();
  if (game.error) throw new Error(game.error.message);
  const rows = Object.entries(players).map(([user_id, total_score]) => ({ game_id: game.data.id, user_id, total_score }));
  const gp = await admin.from("game_players").insert(rows);
  if (gp.error) throw new Error(gp.error.message);
  return game.data.id as string;
}

afterAll(async () => {
  // Deleting an account removes its profile, games and scores.
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("picking a username", () => {
  let a: string;
  let b: string;
  const name = uniqueName();

  beforeAll(async () => {
    a = await newUser();
    b = await newUser();
  });

  it("rejects names that break the format, even if the API check was skipped", async () => {
    for (const bad of ["ab", "has space", "x".repeat(17), "dot.name", "émoji"]) {
      expect((await setUsername(a, bad)).error, bad).toBe("bad_username");
    }
  });

  it("sets a free name, keeping its capitals", async () => {
    const upper = name.toUpperCase().replace("LT_", "lt_");
    expect(await rpc<boolean>("username_available", { p_username: upper })).toBe(true);
    expect(await setUsername(a, upper)).toEqual({ ok: true, username: upper });
    const { data } = await admin.from("profiles").select("username").eq("id", a).single();
    expect(data?.username).toBe(upper);
  });

  it("treats names that differ only in case as the same name", async () => {
    expect(await rpc<boolean>("username_available", { p_username: name })).toBe(false);
    expect((await setUsername(b, name)).error).toBe("username_taken");
  });

  it("is picked once", async () => {
    expect((await setUsername(a, uniqueName())).error).toBe("username_locked");
  });
});

describe("the leaderboard", () => {
  // first: 21,000 (an earlier 20,000 and a later 21,000 tie-break below)
  // tieEarly / tieLate: both 18,000; tieEarly got there first
  // versus: best is a versus game at 22,000
  // abandoned: only an abandoned 24,000 and an unfinished 23,000, so not listed
  // nameless: a completed game but no username, so not listed
  const p: Record<string, string> = {};
  const names: Record<string, string> = {};
  let versusGame: string;

  beforeAll(async () => {
    for (const key of ["first", "tieEarly", "tieLate", "versus", "abandoned", "nameless"]) {
      p[key] = await newUser();
      if (key !== "nameless") {
        names[key] = uniqueName();
        expect((await setUsername(p[key], names[key])).ok).toBe(true);
      }
    }
    await fakeGame({ [p.first]: 20_000 }, 300);
    await fakeGame({ [p.first]: 21_000 }, 200);
    await fakeGame({ [p.first]: 21_000 }, 100); // same score again later: the earlier game stays the record
    await fakeGame({ [p.tieLate]: 18_000 }, 50);
    await fakeGame({ [p.tieEarly]: 18_000 }, 60);
    await fakeGame({ [p.versus]: 12_000 }, 40);
    versusGame = await fakeGame({ [p.versus]: 22_000, [p.tieLate]: 9_000 }, 30, { mode: "versus" });
    await fakeGame({ [p.abandoned]: 24_000 }, 20, { status: "abandoned" });
    await fakeGame({ [p.abandoned]: 23_000 }, 10, { status: "active" });
    await fakeGame({ [p.nameless]: 25_000 }, 5);
  });

  const mine = (b: Leaderboard) => b.rows.filter((r) => Object.values(names).includes(r.username));

  it("lists one row per player, ranked by their best completed game, with ties going to whoever got there first", async () => {
    const all = await board(null, 100, 0);
    const order = mine(all).map((r) => [r.username, r.score]);
    expect(order).toEqual([
      [names.versus, 22_000],
      [names.first, 21_000],
      [names.tieEarly, 18_000],
      [names.tieLate, 18_000],
    ]);
    const ranks = mine(all).map((r) => r.rank);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("counts a versus game as the player's own total, with no schema change", async () => {
    const all = await board(p.versus, 100, 0);
    expect(all.you?.mode).toBe("versus");
    expect(all.you?.gameId).toBe(versusGame);
  });

  it("dates a record from the first game that reached it", async () => {
    const you = (await board(p.first, 1, 0)).you!;
    expect(Date.now() - you.reachedAt).toBeGreaterThan(190 * 60_000);
  });

  it("leaves out abandoned and unfinished games, and players without a username", async () => {
    const all = await board(p.abandoned, 100, 0);
    expect(all.you).toBeNull();
    expect(all.rows.some((r) => r.score === 24_000 || r.score === 23_000 || r.score === 25_000)).toBe(false);
    expect((await board(p.nameless, 100, 0)).you).toBeNull();
  });

  it("returns the player's own row even when it is not on the page asked for", async () => {
    const page = await board(p.tieLate, 1, 0);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].isYou).toBe(false);
    expect(page.you).toMatchObject({ username: names.tieLate, score: 18_000, isYou: true });
    expect(page.you!.rank).toBeGreaterThan(1);
    // Asking for the page that holds it marks the row as "you".
    const at = await board(p.tieLate, 1, page.you!.rank - 1);
    expect(at.rows[0]).toMatchObject({ username: names.tieLate, isYou: true });
  });

  it("never sends account IDs", async () => {
    const text = JSON.stringify(await board(p.first, 100, 0));
    for (const id of Object.values(p)) expect(text).not.toContain(id);
  });
});

describe("the public key (what a browser has) gets nothing new", () => {
  it("cannot read the leaderboard view or usernames", async () => {
    const view = await anon.from("leaderboard_entries").select("*").limit(1);
    expect(view.data ?? []).toEqual([]);
    expect(view.error).not.toBeNull();
    const profiles = await anon.from("profiles").select("username").limit(1);
    expect(profiles.error).not.toBeNull();
  });

  it("cannot call the username or leaderboard functions", async () => {
    const calls = [
      anon.rpc("set_username", { p_user: randomUUID(), p_username: uniqueName() }),
      anon.rpc("username_available", { p_username: "anything" }),
      anon.rpc("leaderboard", { p_user: null, p_limit: 10, p_offset: 0 }),
    ];
    for (const result of await Promise.all(calls)) expect(result.error).not.toBeNull();
  });
});
