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
async function signIn(n: number): Promise<string> {
  const res = await fetch(`${BASE}/api/dev/login?as=${n}`, { redirect: "manual" });
  expect(res.status).toBe(307);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const call = (cookie: string | null, method: string, path: string, body?: unknown, origin = BASE) =>
  fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === "GET" ? {} : { Origin: origin, "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe.skipIf(!serverUp)("the game API over HTTP", () => {
  let alice: string;
  let bob: string;
  let game: string;

  beforeAll(async () => {
    alice = await signIn(8);
    bob = await signIn(9);
  });

  afterAll(async () => {
    // Undo the report filed below, so no real photo keeps a test report.
    const users = await admin.auth.admin.listUsers({ perPage: 200 });
    const ids = users.data.users.filter((u) => /^dev-player-[89]@bruinguessr\.test$/.test(u.email ?? "")).map((u) => u.id);
    if (!ids.length) return;
    const reports = await admin.from("image_reports").select("image_id").in("user_id", ids);
    await admin.from("image_reports").delete().in("user_id", ids);
    for (const { image_id } of reports.data ?? []) {
      const left = await admin.from("image_reports").select("user_id", { count: "exact", head: true }).eq("image_id", image_id);
      await admin.from("images").update({ report_count: left.count ?? 0 }).eq("id", image_id);
    }
    await admin.from("games").delete().in("created_by", ids);
  });

  it("refuses anyone who is not signed in", async () => {
    expect((await call(null, "POST", "/api/games")).status).toBe(401);
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await call(null, "GET", `/api/games/${id}`)).status).toBe(401);
    expect((await call(null, "POST", `/api/games/${id}/round`)).status).toBe(401);
    expect((await call(null, "PUT", `/api/games/${id}/pin`, { round: 1, lat: 34, lng: -118 })).status).toBe(401);
    expect((await call(null, "POST", `/api/games/${id}/guess`, { round: 1 })).status).toBe(401);
    expect((await call(null, "GET", `/api/games/${id}/rounds/1/photo`)).status).toBe(404);
    // The game page streams, so its redirect to the sign-in prompt arrives in the page body.
    const page = await (await call(null, "GET", `/game/${id}`)).text();
    expect(page).toContain("signin=required");
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
});
