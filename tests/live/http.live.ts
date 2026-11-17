/**
 * The game API over HTTP, the way a browser uses it.
 *
 *   npm run dev          (in another terminal)
 *   npm run test:live
 *
 * These checks need the development server, because they sign in through the
 * development-only test login. If the server is not running they are skipped,
 * and the run says so.
 */
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import exifr from "exifr";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameState } from "../../src/lib/game/types";

const BASE = process.env.BRUINGUESSR_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const serverUp = await fetch(`${BASE}/api/dev/login?as=0`, { redirect: "manual" }).then((r) => r.status === 400, () => false);
if (!serverUp) console.warn(`\n  SKIPPED: no development server at ${BASE}. Start "npm run dev" to include the HTTP checks.\n`);

/** Signs in as a development test player and returns the Cookie header to send. */
async function signIn(n: number, { pickUsername = true } = {}): Promise<string> {
  const res = await fetch(`${BASE}/api/dev/login?as=${n}`, { redirect: "manual" });
  expect(res.status).toBe(307);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  // A first sign in goes to the username page; pick one so games can start.
  if (pickUsername && res.headers.get("location")?.includes("/welcome")) {
    const picked = await call(cookie, "POST", "/api/username", { username: `dev_${n}_${Date.now().toString(36)}` });
    expect(picked.status).toBe(200);
  }
  return cookie;
}

const DEV_TEST_ACCOUNTS = /^dev-player-[789]@bruinguessr\.test$/;

const call = (cookie: string | null, method: string, path: string, body?: unknown, origin = BASE, extra: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === "GET" ? {} : { Origin: origin, "Content-Type": "application/json" }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** A made-up network address for guest tests, so the per-network limits start from zero; and its stored hash, for clean-up. */
const guestNetworks: string[] = [];
function testNetwork(): string {
  const ip = `live-test-${randomUUID()}`;
  guestNetworks.push(createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`guest-network:${ip}`).digest("hex"));
  return ip;
}

describe.skipIf(!serverUp)("the game API over HTTP", () => {
  let alice: string;
  let bob: string;
  let game: string;

  beforeAll(async () => {
    alice = await signIn(8);
    bob = await signIn(9);
  });

  afterAll(async () => {
    // Guests made here, with their games.
    if (guestNetworks.length) {
      const made = await admin.from("guests").select("id").in("ip_hash", guestNetworks);
      const ids = (made.data ?? []).map((g) => g.id);
      if (ids.length) await admin.from("profiles").delete().in("id", ids);
      await admin.from("guest_game_starts").delete().in("ip_hash", guestNetworks);
    }
  });

  afterAll(async () => {
    // Undo the report filed below, so no real photo keeps a test report.
    const users = await admin.auth.admin.listUsers({ perPage: 200 });
    const ids = users.data.users.filter((u) => DEV_TEST_ACCOUNTS.test(u.email ?? "")).map((u) => u.id);
    if (!ids.length) return;
    const reports = await admin.from("image_reports").select("image_id").in("user_id", ids);
    await admin.from("image_reports").delete().in("user_id", ids);
    for (const { image_id } of reports.data ?? []) {
      const left = await admin.from("image_reports").select("user_id", { count: "exact", head: true }).eq("image_id", image_id);
      await admin.from("images").update({ report_count: left.count ?? 0 }).eq("id", image_id);
    }
    // Deleting the accounts removes their usernames, games and scores too.
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });

  it("refuses anyone who is not signed in (or a guest) everywhere but starting a solo game", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await call(null, "GET", `/api/games/${id}`)).status).toBe(401);
    expect((await call(null, "POST", `/api/games/${id}/round`)).status).toBe(401);
    expect((await call(null, "PUT", `/api/games/${id}/pin`, { round: 1, lat: 34, lng: -118 })).status).toBe(401);
    expect((await call(null, "POST", `/api/games/${id}/guess`, { round: 1 })).status).toBe(401);
    expect((await call(null, "GET", `/api/games/${id}/rounds/1/photo`)).status).toBe(404);
    // The game page streams, so its redirect to the sign-in page arrives in the page body.
    const page = await (await call(null, "GET", `/game/${id}`)).text();
    expect(page).toContain("/login?next=");
    for (const path of ["/settings", "/profile"]) expect(await (await call(null, "GET", path)).text()).toContain("/login?reason=");
  });

  it("lets a signed-out visitor play solo as a guest, by exactly the same rules", async () => {
    const network = { "x-real-ip": testNetwork() };
    const started = await call(null, "POST", "/api/games", undefined, BASE, network);
    expect(started.status).toBe(200);
    const setCookie = started.headers.getSetCookie().find((c) => c.startsWith("bg_guest="))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    const guest = setCookie.split(";")[0];
    const id = ((await started.json()) as { id: string }).id;

    // The game page plays it as a guest.
    expect(await (await call(guest, "GET", `/game/${id}`)).text()).not.toContain("/login?next=");

    const photoUrl = `/api/games/${id}/rounds/1/photo`;
    expect((await call(guest, "GET", photoUrl)).status).toBe(404);
    expect(((await (await call(guest, "POST", `/api/games/${id}/round`)).json()) as GameState).round?.number).toBe(1);
    expect((await call(guest, "GET", photoUrl)).status).toBe(200);
    expect((await call(null, "GET", photoUrl)).status).toBe(404);
    expect((await call(alice, "GET", photoUrl)).status).toBe(404);
    expect((await call(alice, "GET", `/api/games/${id}`)).status).toBe(404);
    // A made-up guest cookie is nobody.
    expect((await call(`bg_guest=${"A".repeat(43)}`, "GET", `/api/games/${id}`)).status).toBe(401);

    const guessed = (await (await call(guest, "POST", `/api/games/${id}/guess`, { round: 1, lat: 34.0705, lng: -118.4442 })).json()) as GameState;
    expect(guessed.results[0].answer.lat).toBeTypeOf("number");
    expect((await call(guest, "GET", photoUrl)).status).toBe(404);

    // No reports, no versus, no account pages, no standing.
    const report = await call(guest, "POST", `/api/games/${id}/rounds/1/report`, { reason: "unclear" });
    expect(report.status).toBe(403);
    expect(await report.json()).toEqual({ error: "account_required" });
    expect((await call(guest, "POST", "/api/rooms")).status).toBe(401);
    expect((await call(guest, "GET", "/api/me/standing")).status).toBe(401);
    expect((await call(guest, "POST", "/api/account/username", { username: "guest_name" })).status).toBe(401);
    expect((await call(guest, "POST", "/api/account/delete", { confirm: "x" })).status).toBe(401);

    // The same browser keeps its guest: a second game, no new cookie.
    const again = await call(guest, "POST", "/api/games", undefined, BASE, network);
    expect(again.status).toBe(200);
    expect(again.headers.getSetCookie().some((c) => c.startsWith("bg_guest="))).toBe(false);

    // Signing in forgets the guest: nothing from guest play follows the player into the account.
    const signedIn = await fetch(`${BASE}/api/dev/login?as=8`, { redirect: "manual", headers: { Cookie: guest } });
    expect(signedIn.headers.getSetCookie().find((c) => c.startsWith("bg_guest="))).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("stops one network from making guest games without limit", async () => {
    const network = { "x-real-ip": testNetwork() };
    const ipHash = guestNetworks.at(-1)!;
    const { guest_new_per_ip_hour: limit } = (await admin.from("settings").select("guest_new_per_ip_hour").single()).data!;
    // Each request has no cookie, so each one makes a new guest: the per-network guest limit is what holds.
    // Fill the hour up to two short of the limit directly, then make the rest over HTTP.
    const ids = Array.from({ length: limit - 2 }, () => randomUUID());
    expect((await admin.from("profiles").insert(ids.map((id) => ({ id, is_guest: true })))).error).toBeNull();
    const hashes = ids.map(() => createHmac("sha256", "x").update(randomUUID()).digest("hex"));
    expect((await admin.from("guests").insert(ids.map((id, i) => ({ id, token_hash: hashes[i], ip_hash: ipHash })))).error).toBeNull();
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) statuses.push((await call(null, "POST", "/api/games", undefined, BASE, network)).status);
    expect(statuses).toEqual([200, 200]);
    const refused = await call(null, "POST", "/api/games", undefined, BASE, network);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "rate_limited" });
  });

  it("refuses requests sent from another website", async () => {
    expect((await call(alice, "POST", "/api/games", undefined, "https://evil.example")).status).toBe(400);
  });

  it("serves the round's photo only to its player, only while the round is open", async () => {
    const created = await call(alice, "POST", "/api/games");
    expect(created.status).toBe(200);
    game = ((await created.json()) as { id: string }).id;
    const photoUrl = `/api/games/${game}/rounds/1/photo`;

    // Not before the round opens.
    expect((await call(alice, "GET", photoUrl)).status).toBe(404);

    const opened = (await (await call(alice, "POST", `/api/games/${game}/round`)).json()) as GameState;
    expect(opened.round?.number).toBe(1);

    const photo = await call(alice, "GET", photoUrl);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/webp");
    expect(photo.headers.get("cache-control")).toBe("private, no-store");
    const bytes = Buffer.from(await photo.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif ?? meta.xmp ?? meta.iptc ?? meta.icc).toBeUndefined();
    expect(await exifr.parse(bytes, true).catch(() => null)).toBeFalsy();

    // Nothing in the response says where the file is stored.
    const row = await admin.from("game_rounds").select("images(storage_path, source_id)").eq("game_id", game).eq("round_no", 1).single();
    const image = row.data!.images as unknown as { storage_path: string; source_id: string };
    const headers = JSON.stringify([...photo.headers.entries()]);
    expect(headers).not.toContain(image.storage_path);
    expect(headers).not.toContain(image.storage_path.replace(".webp", ""));
    expect(headers).not.toContain("supabase");

    // Not to another signed-in player, not to a visitor, and not for a round that has not opened.
    expect((await call(bob, "GET", photoUrl)).status).toBe(404);
    expect((await call(null, "GET", photoUrl)).status).toBe(404);
    expect((await call(alice, "GET", `/api/games/${game}/rounds/2/photo`)).status).toBe(404);
    expect((await call(bob, "GET", `/api/games/${game}`)).status).toBe(404);

    // Bad input is turned away before it reaches the database.
    expect((await call(alice, "PUT", `/api/games/${game}/pin`, { round: 1, lat: "34", lng: -118 })).status).toBe(400);
    expect((await call(alice, "PUT", `/api/games/${game}/pin`, { round: 1, lat: 34, lng: -1180 })).status).toBe(400);
    expect((await call(alice, "POST", `/api/games/${game}/guess`, { round: 1 })).status).toBe(409);
    expect((await call(alice, "GET", "/api/games/not-a-game")).status).toBe(404);

    expect((await call(alice, "PUT", `/api/games/${game}/pin`, { round: 1, lat: 34.0705, lng: -118.4442 })).status).toBe(200);
    const guessed = (await (await call(alice, "POST", `/api/games/${game}/guess`, { round: 1 })).json()) as GameState;
    expect(guessed.round).toBeNull();
    expect(guessed.results[0].guess).toEqual({ lat: 34.0705, lng: -118.4442 });
    expect(guessed.results[0].answer.lat).toBeTypeOf("number");

    // The same address, a moment later: gone for good.
    expect((await call(alice, "GET", photoUrl)).status).toBe(404);
  });

  it("takes a report from the reveal screen", async () => {
    const res = await call(alice, "POST", `/api/games/${game}/rounds/1/report`, { reason: "unclear" });
    expect(res.status).toBe(200);
    const state = (await (await call(alice, "GET", `/api/games/${game}`)).json()) as GameState;
    expect(state.results[0].reported).toBe(true);
    // Bob never played this round, so he cannot report through it.
    expect((await call(bob, "POST", `/api/games/${game}/rounds/1/report`, { reason: "unclear" })).status).toBe(404);
  });

  it("asks a new player for a username before the first game, and takes it once", async () => {
    const carol = await signIn(7, { pickUsername: false });
    expect((await call(carol, "POST", "/api/games")).status).toBe(403);
    // The game page sends them to the username page.
    expect(await (await call(carol, "GET", "/game/00000000-0000-4000-8000-000000000000")).text()).toContain("/welcome");

    const check = async (name: string) => (await (await call(carol, "GET", `/api/username?name=${encodeURIComponent(name)}`)).json()) as { ok: boolean; problem?: string };
    expect(await check("sh1thead")).toEqual({ ok: false, problem: "not_allowed" });
    expect(await check("Admin_1")).toEqual({ ok: false, problem: "not_allowed" });
    expect(await check("no spaces")).toEqual({ ok: false, problem: "bad_chars" });
    expect((await call(null, "GET", "/api/username?name=anything")).status).toBe(401);

    const name = `dev_7_${Date.now().toString(36)}`;
    expect(await check(name)).toEqual({ ok: true });
    expect((await call(carol, "POST", "/api/username", { username: "f_u_c_k" })).status).toBe(400);
    expect((await call(carol, "POST", "/api/username", { username: name }, "https://evil.example")).status).toBe(400);
    expect((await call(carol, "POST", "/api/username", { username: name })).status).toBe(200);
    expect((await call(carol, "POST", "/api/username", { username: `${name}x` })).status).toBe(409);
    expect((await call(alice, "GET", `/api/username?name=${name.toUpperCase()}`)).status).toBe(200);
    expect(await (await call(alice, "GET", `/api/username?name=${name.toUpperCase()}`)).json()).toEqual({ ok: false, problem: "taken" });

    expect((await call(carol, "POST", "/api/games")).status).toBe(200);
  });

  it("changes a username from settings, at most once per 30 days, and shows the email only to its owner", async () => {
    const before = (await admin.from("profiles").select("username").eq("id", (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === "dev-player-9@bruinguessr.test")!.id).single()).data!.username as string;
    const renamed = `dev_9_${Date.now().toString(36)}`;
    expect((await call(null, "POST", "/api/account/username", { username: renamed })).status).toBe(401);
    expect((await call(bob, "POST", "/api/account/username", { username: renamed }, "https://evil.example")).status).toBe(400);
    expect(await (await call(bob, "POST", "/api/account/username", { username: "sh1thead" })).json()).toMatchObject({ ok: false, problem: "not_allowed" });
    expect(await (await call(bob, "POST", "/api/account/username", { username: "BruinGuessr" })).json()).toMatchObject({ ok: false, problem: "not_allowed" });
    const changed = await call(bob, "POST", "/api/account/username", { username: renamed });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ ok: true, username: renamed, nextChangeAt: expect.any(Number) });
    const again = await call(bob, "POST", "/api/account/username", { username: `${renamed}x` });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ ok: false, problem: "too_soon", nextChangeAt: expect.any(Number) });

    const settings = await (await call(bob, "GET", "/settings")).text();
    expect(settings).toContain("dev-player-9@bruinguessr.test");
    expect(settings).toContain(renamed);
    const asSeenByAlice = await call(alice, "GET", `/profile/${renamed}`);
    expect(asSeenByAlice.status).toBe(200);
    const profileHtml = await asSeenByAlice.text();
    expect(profileHtml).toContain(renamed);
    expect(profileHtml).not.toContain("@bruinguessr.test");
    expect(await (await call(null, "GET", `/profile/${renamed.toUpperCase()}`)).text()).toContain(renamed);
    expect(await (await call(null, "GET", `/profile/${before}`)).text()).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("shows the leaderboard to anyone, without account IDs", async () => {
    const page = await call(null, "GET", "/leaderboard");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Leader");
    const users = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of users.data.users) expect(html).not.toContain(u.id);
    const standing = await call(alice, "GET", "/api/me/standing");
    expect(standing.status).toBe(200);
    expect((await call(null, "GET", "/api/me/standing")).status).toBe(401);
  });

  it("runs a versus room: host, join, start, guess, leave", async () => {
    // Nobody signed out, no other site, and nothing that is not a room code.
    expect((await call(null, "POST", "/api/rooms")).status).toBe(401);
    expect((await call(null, "GET", "/api/rooms/BCDFG")).status).toBe(401);
    expect((await call(null, "POST", "/api/rooms/BCDFG/join")).status).toBe(401);
    expect((await call(alice, "POST", "/api/rooms", undefined, "https://evil.example")).status).toBe(400);
    expect((await call(alice, "GET", "/api/rooms/ABCDE")).status).toBe(404);
    expect((await call(alice, "POST", "/api/rooms/nope/join")).status).toBe(404);

    const created = await call(alice, "POST", "/api/rooms");
    expect(created.status).toBe(200);
    const room = await created.json();
    expect(room.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{5}$/);
    expect(room).toMatchObject({ status: "lobby", isHost: true, seat: 1, canStart: false });

    // Not in the room: nothing about it. Then in, by a code typed in small letters.
    expect((await call(bob, "GET", `/api/rooms/${room.code}`)).status).toBe(403);
    expect((await call(bob, "POST", `/api/rooms/${room.code}/start`)).status).toBe(403);
    const joined = await call(bob, "POST", `/api/rooms/${room.code.toLowerCase()}/join`);
    expect(joined.status).toBe(200);
    expect((await joined.json()).members).toHaveLength(2);
    expect((await call(bob, "POST", `/api/rooms/${room.code}/start`)).status).toBe(403);
    expect((await call(bob, "POST", `/api/rooms/${room.code}/join`, undefined, "https://evil.example")).status).toBe(400);

    const started = await (await call(alice, "POST", `/api/rooms/${room.code}/start`)).json();
    expect(started.status).toBe("playing");
    const id: string = started.gameId;
    expect((await (await call(bob, "GET", `/api/rooms/${room.code}`)).json()).gameId).toBe(id);

    // Locked: a third player cannot get in, see the game, or fetch its photo.
    const carol = await signIn(7);
    expect((await call(carol, "POST", `/api/rooms/${room.code}/join`)).status).toBe(409);
    expect((await call(carol, "GET", `/api/games/${id}`)).status).toBe(404);
    expect((await call(carol, "GET", `/api/games/${id}/rounds/1/photo`)).status).toBe(404);

    // Both players get the same photo through their own per-round address.
    const photos = await Promise.all([alice, bob].map(async (who) => (await call(who, "GET", `/api/games/${id}/rounds/1/photo`)).arrayBuffer()));
    expect(photos[0].byteLength).toBeGreaterThan(10_000);
    expect(Buffer.from(photos[0]).equals(Buffer.from(photos[1]))).toBe(true);

    // One guess in: the round stays open, and the other player learns only that it happened.
    const first = (await (await call(alice, "POST", `/api/games/${id}/guess`, { round: 1, lat: 34.0722, lng: -118.4423 })).json()) as GameState;
    expect(first.round).toMatchObject({ number: 1, locked: true });
    const waiting = await call(bob, "GET", `/api/games/${id}`);
    const seen = await waiting.text();
    expect(seen).not.toContain("34.0722");
    expect(seen).not.toMatch(/answer|photographer/);
    expect((JSON.parse(seen) as GameState).versus?.players.map((p) => p.locked)).toEqual([true, false]);
    // No account ID ever leaves the server.
    const users = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of users.data.users) expect(seen).not.toContain(u.id);

    const second = (await (await call(bob, "POST", `/api/games/${id}/guess`, { round: 1, lat: 34.0712, lng: -118.4441 })).json()) as GameState;
    expect(second.round).toBeNull();
    expect(second.results[0].players).toHaveLength(2);
    expect((await call(bob, "GET", `/api/games/${id}/rounds/1/photo`)).status).toBe(404);

    // The guest cannot skip the reveal; the host can.
    expect(((await (await call(bob, "POST", `/api/games/${id}/round`)).json()) as GameState).round).toBeNull();
    expect(((await (await call(alice, "POST", `/api/games/${id}/round`)).json()) as GameState).round?.number).toBe(2);

    // The host leaves: the other player is the host now.
    expect((await call(alice, "POST", `/api/rooms/${room.code}/leave`)).status).toBe(200);
    expect(((await (await call(bob, "GET", `/api/games/${id}`)).json()) as GameState).versus?.isHost).toBe(true);
    expect((await call(bob, "POST", `/api/rooms/${room.code}/leave`)).status).toBe(200);
    expect((await call(bob, "POST", `/api/rooms/${room.code}/join`)).status).toBe(404);
  });

  it("deletes an account when the username is typed, and the old session stops working", async () => {
    const carol = await signIn(7);
    const id = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === "dev-player-7@bruinguessr.test")!.id;
    const name = (await admin.from("profiles").select("username").eq("id", id).single()).data!.username as string;
    expect((await call(carol, "POST", "/api/games")).status).toBe(200);

    expect((await call(carol, "POST", "/api/account/delete", { confirm: "someone_else" })).status).toBe(400);
    expect((await call(carol, "POST", "/api/account/delete", { confirm: name }, "https://evil.example")).status).toBe(400);
    expect((await admin.auth.admin.getUserById(id)).data.user).not.toBeNull();

    const deleted = await call(carol, "POST", "/api/account/delete", { confirm: name.toUpperCase() });
    expect(deleted.status).toBe(200);
    expect(deleted.headers.getSetCookie().some((c) => c.startsWith("sb-"))).toBe(true);
    expect((await admin.auth.admin.getUserById(id)).data.user).toBeNull();
    expect((await admin.from("profiles").select("id").eq("id", id)).data).toEqual([]);
    expect((await admin.from("games").select("id").eq("created_by", id)).data).toEqual([]);

    // A copy of the old session cookie is treated as signed out on every page.
    expect(await (await call(carol, "GET", "/settings")).text()).toContain("/login?reason=");
    expect(await (await call(null, "GET", `/profile/${name}`)).text()).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
