/**
 * Photo contributions (Phase 7a), against the real database and, with
 * `npm run dev` running, over HTTP.
 *
 *   npm run test:live
 *
 * The database checks use throwaway accounts. The HTTP checks sign in as the
 * development test players 7 (the contributor) and 8 (made an admin for the
 * test, then deleted with 7 afterwards, as the other HTTP checks do).
 *
 * Approving a photo publishes it at once, to a pool real players draw from.
 * So the photo approved here is a copy of a photo already in the game, sent
 * with that photo's true position: if anyone got it in the seconds it is live,
 * it would be a fair round. It leaves the pool when the test deletes the
 * contributor's account, which is also how account deletion is tested.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import exifr from "exifr";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
const BASE = process.env.BRUINGUESSR_URL ?? "http://localhost:3000";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const hex = () => randomUUID().replaceAll("-", "");
const ROYCE = { lat: 34.07283, lng: -118.44222 };

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
describe("contributions in the database", () => {
  const users: string[] = [];
  async function account(username: string | null): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({ email: `live-test-${randomUUID()}@bruinguessr.test`, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await admin.from("profiles").update({ is_test: true, ...(username ? { username: `${username}_${hex().slice(0, 6)}`, username_set_at: new Date().toISOString() } : {}) }).eq("id", data.user.id);
    return data.user.id;
  }
  const submit = (user: string, over: Record<string, unknown> = {}) =>
    rpc<{ ok?: true; id?: string; error?: string }>("submit_contribution", {
      p_user: user,
      p_storage_path: `${hex()}.jpg`,
      p_gps_lat: ROYCE.lat,
      p_gps_lng: ROYCE.lng,
      p_accuracy_m: 12,
      p_heading: 90,
      p_position_at: new Date().toISOString(),
      p_captured_at: new Date().toISOString(),
      p_capture_width: 4032,
      p_capture_height: 3024,
      p_width: 2048,
      p_height: 1536,
      p_sharpness: 300,
      p_people: false,
      p_suggested_blur: [],
      ...over,
    });

  afterAll(async () => {
    // Deleting the account deletes its submissions (none of these have files).
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  it("keeps everything away from the public and signed-in keys", async () => {
    for (const table of ["contributions", "admin_audit"]) {
      const r = await anon.from(table).select("*").limit(1);
      expect(r.error?.message).toMatch(/permission denied/);
    }
    for (const fn of ["submit_contribution", "contribution_queue", "approve_contribution", "withdraw_contributions", "is_admin"]) {
      const r = await anon.rpc(fn, {});
      expect(r.error, fn).toBeTruthy();
    }
    const role = await anon.from("profiles").select("role").limit(1);
    expect(role.error).toBeTruthy();
    const listed = await anon.storage.from("contributions").list();
    expect(listed.data ?? []).toEqual([]);
    const bucket = await admin.storage.getBucket("contributions");
    expect(bucket.data?.public).toBe(false);
  });

  it("has no per-account limit: 40 at once are all accepted", async () => {
    const user = await account("burst");
    const results = await Promise.all(Array.from({ length: 40 }, () => submit(user)));
    expect(results.filter((r) => r.ok)).toHaveLength(40);
    const waiting = await admin.from("contributions").select("id", { count: "exact", head: true }).eq("contributor_id", user).eq("status", "waiting");
    expect(waiting.count).toBe(40);
  });

  it("refuses accounts without a username, and accuracy worse than 40 m", async () => {
    expect((await submit(await account(null))).error).toBe("no_username");
    const user = await account("acc");
    expect((await submit(user, { p_accuracy_m: 41 })).error).toBe("bad_accuracy");
    expect((await submit(user, { p_suggested_blur: Array.from({ length: 101 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 })) })).error).toBe("bad_request");
    expect((await submit(user, { p_suggested_blur: { x: 0 } })).error).toBe("bad_request");
    const box = { x: 0.1, y: 0.2, w: 0.05, h: 0.06 };
    const flagged = await submit(user, { p_accuracy_m: 26, p_suggested_blur: [box] });
    const row = await admin
      .from("contributions")
      .select("flag_pin_check, flag_people, faces_detected, suggested_blur, license, license_accepted_at")
      .eq("id", flagged.id!)
      .single();
    expect(row.data).toMatchObject({ flag_pin_check: true, flag_people: true, faces_detected: 1, suggested_blur: [box], license: "CC BY-SA 4.0" });
    expect(row.data?.license_accepted_at).toBeTruthy();
  });

  it("answers 'not found' to a player who calls the review functions", async () => {
    const player = await account("plain");
    const waiting = await submit(player);
    expect(await rpc("contribution_queue", { p_admin: player })).toEqual({ error: "not_found" });
    expect(await rpc("contribution_file", { p_admin: player, p_id: waiting.id })).toBeNull();
    expect(await rpc("reject_contribution", { p_admin: player, p_id: waiting.id, p_reason: "no" })).toEqual({ error: "not_found" });
    expect(await rpc("is_admin", { p_user: player })).toBe(false);
  });

  it("never gives a player their own photo, nor anyone in a game with them", async () => {
    const owner = await account("owner");
    const other = await account("other");
    // Borrow a photo in the pool and mark it as the owner's for a moment, without touching who else can get it.
    const pool = await admin.from("images").select("id").eq("hidden", false).is("contributor_id", null).limit(1).single();
    const id = pool.data!.id as string;
    await admin.from("images").update({ contributor_id: owner }).eq("id", id);
    try {
      const pick = (players: string[]) => rpc<string[]>("_pick_images", { p_users: players, p_count: 100_000, p_exclude_game: randomUUID() });
      expect(await pick([owner])).not.toContain(id);
      expect(await pick([other, owner])).not.toContain(id);
      expect(await pick([other])).toContain(id);
    } finally {
      await admin.from("images").update({ contributor_id: null }).eq("id", id);
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const serverUp = await fetch(`${BASE}/api/dev/login?as=0`, { redirect: "manual" }).then((r) => r.status === 400, () => false);
if (!serverUp) console.warn(`\n  SKIPPED: no development server at ${BASE}. Start "npm run dev" to include the contribution HTTP checks.\n`);

async function signIn(n: number): Promise<{ cookie: string; username: string }> {
  const res = await fetch(`${BASE}/api/dev/login?as=${n}`, { redirect: "manual" });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  let username: string | undefined;
  if (res.headers.get("location")?.includes("/welcome")) {
    username = `dev_${n}_${Date.now().toString(36)}`;
    const picked = await fetch(`${BASE}/api/username`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE, "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    expect(picked.status).toBe(200);
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = data.users.find((u) => u.email === `dev-player-${n}@bruinguessr.test`)!;
  const p = await admin.from("profiles").select("username").eq("id", user.id).single();
  return { cookie, username: username ?? p.data!.username };
}

/** A suggested blur box from the "phone", in the middle of the photo. */
const SUGGESTED = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

/** Mean difference (0..255, greyscale) between two same-size photos inside a box given as fractions. */
async function meanDiff(a: Buffer, b: Buffer, box: { x: number; y: number; w: number; h: number }): Promise<number> {
  const crop = async (img: Buffer) => {
    const { width = 0, height = 0 } = await sharp(img).metadata();
    const region = { left: Math.round(box.x * width), top: Math.round(box.y * height), width: Math.round(box.w * width), height: Math.round(box.h * height) };
    return sharp(img).extract(region).resize(200, 150, { fit: "fill" }).greyscale().raw().toBuffer();
  };
  const [p, q] = await Promise.all([crop(a), crop(b)]);
  let sum = 0;
  for (let i = 0; i < p.length; i++) sum += Math.abs(p[i] - q[i]);
  return sum / p.length;
}

const userId = async (n: number) => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return data.users.find((u) => u.email === `dev-player-${n}@bruinguessr.test`)?.id ?? null;
};

describe.skipIf(!serverUp)("contributions over HTTP", () => {
  let contributor: { cookie: string; username: string };
  let reviewer: { cookie: string; username: string };
  let photo: Buffer; // a copy of a photo in the pool, with GPS written into its EXIF
  let spot: { lat: number; lng: number };
  let magnetic: number | null; // the source photo's heading, as a phone compass would read it
  let trueHeading: number | null;
  let submitted: string;
  let approvedImage: string | null = null;

  beforeAll(async () => {
    contributor = await signIn(7);
    reviewer = await signIn(8);
    const pick = await admin.from("images").select("storage_path, lat, lng, width, height, heading").eq("hidden", false).eq("zone", "inside").gt("width", 1500).order("id").limit(30);
    const row = pick.data!.find((r) => r.width > r.height)!;
    spot = { lat: row.lat, lng: row.lng };
    trueHeading = row.heading;
    magnetic = row.heading === null ? null : (row.heading - 11.5 + 360) % 360;
    const file = await admin.storage.from("photos").download(row.storage_path);
    const bytes = Buffer.from(await file.data!.arrayBuffer());
    // As a phone would send it, plus EXIF with a GPS position, which the server must strip.
    photo = await sharp(bytes)
      .resize(2048)
      .withExif({ IFD0: { Make: "LiveTestPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "34/1 4/1 22/1", GPSLongitudeRef: "W", GPSLongitude: "118/1 26/1 32/1" } })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  afterAll(async () => {
    const reviewerId = await userId(8);
    if (reviewerId) await admin.from("profiles").update({ role: "player" }).eq("id", reviewerId);
    for (const n of [7, 8]) {
      const id = await userId(n);
      if (!id) continue;
      // The same clean-up the account deletion does, then the account.
      const files = await rpc<{ live: string[]; waiting: string[] }>("withdraw_contributions", { p_user: id });
      if (files.live.length) await admin.storage.from("photos").remove(files.live);
      if (files.waiting.length) await admin.storage.from("contributions").remove(files.waiting);
      await admin.auth.admin.deleteUser(id);
    }
    if (approvedImage) {
      // A withdrawn test photo that no round used can go entirely.
      const used = await admin.from("game_rounds").select("game_id", { count: "exact", head: true }).eq("image_id", approvedImage);
      if (!used.count) await admin.from("images").delete().eq("id", approvedImage);
    }
  });

  const meta = (over: Record<string, unknown> = {}) => ({
    lat: spot.lat,
    lng: spot.lng,
    accuracy: 30,
    positionAt: Date.now() - 3000,
    capturedAt: Date.now() - 1000,
    heading: magnetic,
    captureWidth: 4032,
    captureHeight: 3024,
    people: false,
    boxes: [],
    license: true,
    ...over,
  });
  const send = (cookie: string | null, file: Buffer, m: Record<string, unknown>, { origin = BASE, type = "image/jpeg" } = {}) => {
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array(file)], { type }), "photo.jpg");
    form.append("meta", JSON.stringify(m));
    return fetch(`${BASE}/api/contributions`, { method: "POST", body: form, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin } });
  };
  const get = (cookie: string | null, path: string) => fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
  const post = (cookie: string | null, path: string, body: unknown, origin = BASE) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("takes photos only from signed-in players, from our own pages", async () => {
    expect((await send(null, photo, meta())).status).toBe(401);
    expect((await send(null, photo, meta(), { origin: "https://evil.example" })).status).toBe(400);
    expect((await send(contributor.cookie, photo, meta(), { origin: "https://evil.example" })).status).toBe(400);
    // A guest cookie is not an account.
    expect((await send("bg_guest=made-up", photo, meta())).status).toBe(401);
  });

  it("checks every rule again on the server", async () => {
    const problem = async (file: Buffer, m: Record<string, unknown>, type?: string) => {
      const res = await send(contributor.cookie, file, m, type ? { type } : {});
      return [res.status, ((await res.json()) as { problem?: string }).problem];
    };
    expect(await problem(photo, meta({ accuracy: 45 }))).toEqual([400, "too_inaccurate"]);
    expect(await problem(photo, meta({ lat: 34.0604, lng: -118.4466 }))).toEqual([400, "outside_campus"]);
    expect(await problem(photo, meta({ positionAt: Date.now() - 20_000 }))).toEqual([400, "stale_position"]);
    expect(await problem(photo, meta({ license: false }))).toEqual([400, "license"]);
    expect(await problem(photo, meta({ people: null }))).toEqual([400, "people_answer"]);
    const png = await sharp(photo).png().toBuffer();
    expect(await problem(png.subarray(0, 3_900_000), meta(), "image/jpeg")).toEqual([415, "file_type"]);
    const small = await sharp(photo).resize(800).jpeg().toBuffer();
    expect(await problem(small, meta())).toEqual([400, "dimensions"]);
    const huge = await sharp(photo).resize(3000).jpeg({ quality: 95 }).toBuffer();
    expect((await problem(huge, meta()))[1]).toMatch(/dimensions|file_size/);
    const blurry = await sharp(photo).blur(12).jpeg().toBuffer();
    expect(await problem(blurry, meta())).toEqual([400, "blurry"]);
    // None of these left anything behind.
    const id = await userId(7);
    const count = await admin.from("contributions").select("id", { count: "exact", head: true }).eq("contributor_id", id!);
    expect(count.count).toBe(0);
  });

  it("stores a good photo re-encoded, with no metadata, not blurred, waiting for review", async () => {
    expect(await exifr.gps(photo)).toBeTruthy(); // the upload really carried a position
    const res = await send(contributor.cookie, photo, meta({ boxes: [SUGGESTED] }));
    expect(res.status).toBe(200);
    submitted = ((await res.json()) as { id: string }).id;
    const row = await admin.from("contributions").select("*").eq("id", submitted).single();
    // The detector's box is stored as a suggestion, and flags the photo for people.
    expect(row.data).toMatchObject({ status: "waiting", accuracy_m: 30, capture_width: 4032, flag_pin_check: true, flag_people: true, faces_detected: 1, suggested_blur: [SUGGESTED] });
    // The magnetic heading sent comes back as true north.
    if (trueHeading === null) expect(row.data.heading).toBeNull();
    else expect(row.data.heading).toBeCloseTo(trueHeading, 0);
    expect(row.data.storage_path).toMatch(/^[0-9a-f]{32}\.jpg$/);
    const stored = await admin.storage.from("contributions").download(row.data.storage_path);
    const bytes = Buffer.from(await stored.data!.arrayBuffer());
    expect(await exifr.parse(bytes).catch(() => undefined)).toBeUndefined();
    const m = await sharp(bytes).metadata();
    expect(m.exif ?? m.xmp ?? m.iptc ?? m.icc).toBeUndefined();
    expect(m.width).toBe(2048);
    // Kept as sent: nothing is blurred before review, not even the suggested box.
    expect(await meanDiff(bytes, photo, SUGGESTED)).toBeLessThan(6);
  });

  it("lists the photo only for its contributor", async () => {
    const mine = (await (await get(contributor.cookie, "/api/contributions")).json()) as { items: { id: string; status: string }[] };
    expect(mine.items.find((i) => i.id === submitted)?.status).toBe("waiting");
    expect(JSON.stringify(mine)).not.toContain(String(spot.lat).slice(0, 7));
    const thumb = await get(contributor.cookie, `/api/contributions/${submitted}/thumb`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("cache-control")).toContain("no-store");
    expect((await get(reviewer.cookie, `/api/contributions/${submitted}/thumb`)).status).toBe(404);
    expect((await get(null, `/api/contributions/${submitted}/thumb`)).status).toBe(404);
  });

  it("hides the review API from everyone who is not an admin", async () => {
    for (const cookie of [null, contributor.cookie, reviewer.cookie]) {
      expect((await get(cookie, "/api/admin/contributions")).status).toBe(404);
      expect((await get(cookie, `/api/admin/contributions/${submitted}/photo`)).status).toBe(404);
      expect((await post(cookie, `/api/admin/contributions/${submitted}/approve`, { ...spot, pinConfirmed: true })).status).toBe(404);
      expect((await post(cookie, `/api/admin/contributions/${submitted}/reject`, { reason: "x" })).status).toBe(404);
      expect((await get(cookie, "/admin/contributions")).status).toBe(404);
    }
  });

  it("reviews as an admin: the role is read on every request", async () => {
    const id = await userId(8);
    await admin.from("profiles").update({ role: "admin" }).eq("id", id!);
    const page = await get(reviewer.cookie, "/admin/contributions");
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toMatch(/no-store/);
    const queue = (await (await get(reviewer.cookie, "/api/admin/contributions")).json()) as {
      queue: { id: string; contributor: string; captureWidth: number; flagPinCheck: boolean; suggestedBlur: unknown }[];
    };
    expect(queue.queue.find((q) => q.id === submitted)).toMatchObject({ contributor: contributor.username, captureWidth: 4032, flagPinCheck: true, suggestedBlur: [SUGGESTED] });
    const original = await get(reviewer.cookie, `/api/admin/contributions/${submitted}/photo`);
    expect(original.status).toBe(200);
    expect(original.headers.get("cache-control")).toContain("no-store");
    const near = (await (await get(reviewer.cookie, `/api/admin/contributions/${submitted}/nearby?lat=${spot.lat}&lng=${spot.lng}&heading=${trueHeading ?? ""}`)).json()) as { near: { distanceM: number }[] };
    expect(near.near.length).toBeGreaterThan(0); // the photo it was copied from is right there
    expect(near.near.every((n) => n.distanceM <= 22)).toBe(true);

    // Writes from another site are refused even for an admin.
    expect((await post(reviewer.cookie, `/api/admin/contributions/${submitted}/approve`, { ...spot, pinConfirmed: true }, "https://evil.example")).status).toBe(400);
    // A rough fix needs the pin confirmed (or moved); the pin must be on campus.
    // Flagged for people (the detector's box): "Faces checked" first, then the pin.
    const faces = await post(reviewer.cookie, `/api/admin/contributions/${submitted}/approve`, { ...spot, pinConfirmed: true, facesChecked: false, blur: [] });
    expect([faces.status, ((await faces.json()) as { problem: string }).problem]).toEqual([409, "faces_unchecked"]);
    const unchecked = await post(reviewer.cookie, `/api/admin/contributions/${submitted}/approve`, { ...spot, pinConfirmed: false, facesChecked: true, blur: [] });
    expect([unchecked.status, ((await unchecked.json()) as { problem: string }).problem]).toEqual([409, "pin_unchecked"]);
    const off = await post(reviewer.cookie, `/api/admin/contributions/${submitted}/approve`, { lat: 34.0604, lng: -118.4466, pinConfirmed: true, blur: [] });
    expect(off.status).toBe(400);
    // No photo was left behind by those refusals.
    const before = await admin.from("images").select("id", { count: "exact", head: true }).eq("source", "community");

    const ok = await post(reviewer.cookie, `/api/admin/contributions/${submitted}/approve`, {
      ...spot,
      pinConfirmed: true,
      facesChecked: true,
      blur: [{ x: 0.02, y: 0.02, w: 0.08, h: 0.08 }],
    });
    expect(ok.status).toBe(200);
    approvedImage = ((await ok.json()) as { imageId: string }).imageId;
    const after = await admin.from("images").select("id", { count: "exact", head: true }).eq("source", "community");
    expect(after.count).toBe((before.count ?? 0) + 1);

    const image = await admin.from("images").select("*").eq("id", approvedImage).single();
    expect(image.data).toMatchObject({ source: "community", photographer: contributor.username, license: "CC BY-SA 4.0", hidden: false, contributor_id: await userId(7) });
    const served = await admin.storage.from("photos").download(image.data.storage_path);
    const webp = Buffer.from(await served.data!.arrayBuffer());
    const m = await sharp(webp).metadata();
    expect(m.format).toBe("webp");
    expect(Math.max(m.width!, m.height!)).toBe(1600);
    expect(m.exif ?? m.xmp ?? m.icc).toBeUndefined();
    // The blurred corner is smooth: almost no edges left in it.
    const corner = await sharp(webp).extract({ left: 40, top: 30, width: 60, height: 50 }).greyscale().raw().toBuffer();
    const spread = Math.max(...corner) - Math.min(...corner);
    expect(spread).toBeLessThan(90);
    // The suggestion the reviewer removed (it was not sent with Approve) is not blurred.
    expect(await meanDiff(webp, await sharp(photo).resize(1600).toBuffer(), SUGGESTED)).toBeLessThan(8);

    const row = await admin.from("contributions").select("status, storage_path, reviewed_by").eq("id", submitted).single();
    expect(row.data).toMatchObject({ status: "approved", storage_path: null, reviewed_by: id });
    const audit = await admin.from("admin_audit").select("action, admin_username").eq("contribution_id", submitted);
    expect(audit.data!.map((a) => a.action).sort()).toEqual(["approve", "blur", "confirm_pin", "faces_checked"]);
    expect(audit.data!.every((a) => a.admin_username === reviewer.username)).toBe(true);

    // The contributor sees it live, and never gets it in a game.
    const mine = (await (await get(contributor.cookie, "/api/contributions")).json()) as { items: { id: string; status: string }[] };
    expect(mine.items.find((i) => i.id === submitted)?.status).toBe("live");
    const picks = await rpc<string[]>("_pick_images", { p_users: [await userId(7)], p_count: 100_000, p_exclude_game: randomUUID() });
    expect(picks).not.toContain(approvedImage);

    // Revoking takes effect on the next request.
    await admin.from("profiles").update({ role: "player" }).eq("id", id!);
    expect((await get(reviewer.cookie, "/api/admin/contributions")).status).toBe(404);
    expect((await get(reviewer.cookie, "/admin/contributions")).status).toBe(404);
    await admin.from("profiles").update({ role: "admin" }).eq("id", id!);
  });

  it("rejects with a reason and deletes the file at once", async () => {
    const res = await send(contributor.cookie, photo, meta({ accuracy: 10, people: true }));
    const second = ((await res.json()) as { id: string }).id;
    const path = (await admin.from("contributions").select("storage_path").eq("id", second).single()).data!.storage_path;
    expect((await post(reviewer.cookie, `/api/admin/contributions/${second}/reject`, { reason: "  " })).status).toBe(400);
    expect((await post(reviewer.cookie, `/api/admin/contributions/${second}/reject`, { reason: "Too much like a photo we already have" })).status).toBe(200);
    const gone = await admin.storage.from("contributions").download(path);
    expect(gone.error).toBeTruthy();
    const mine = (await (await get(contributor.cookie, "/api/contributions")).json()) as { items: { id: string; status: string; reason: string }[] };
    expect(mine.items.find((i) => i.id === second)).toMatchObject({ status: "rejected", reason: "Too much like a photo we already have" });
    expect((await post(reviewer.cookie, `/api/admin/contributions/${second}/approve`, { ...spot, pinConfirmed: true, facesChecked: true })).status).toBe(404);
  });

  it("credits the new username after a change", async () => {
    const renamed = `dev_7r_${Date.now().toString(36)}`;
    const res = await post(contributor.cookie, "/api/account/username", { username: renamed });
    expect(res.status).toBe(200);
    const image = await admin.from("images").select("photographer").eq("id", approvedImage!).single();
    expect(image.data?.photographer).toBe(renamed);
    contributor.username = renamed;
  });

  it("deletes the contributor's photos, live and waiting, with the account", async () => {
    const image = await admin.from("images").select("storage_path").eq("id", approvedImage!).single();
    // A waiting one too.
    const waiting = await send(contributor.cookie, photo, meta({ accuracy: 8 }));
    const waitingId = ((await waiting.json()) as { id: string }).id;
    const waitingPath = (await admin.from("contributions").select("storage_path").eq("id", waitingId).single()).data!.storage_path;

    const res = await post(contributor.cookie, "/api/account/delete", { confirm: contributor.username });
    expect(res.status).toBe(200);

    const after = await admin.from("images").select("hidden, photographer, contributor_id").eq("id", approvedImage!).single();
    expect(after.data).toEqual({ hidden: true, photographer: "", contributor_id: null });
    expect((await admin.storage.from("photos").download(image.data!.storage_path)).error).toBeTruthy();
    expect((await admin.storage.from("contributions").download(waitingPath)).error).toBeTruthy();
    expect((await admin.from("contributions").select("id", { count: "exact", head: true }).eq("id", waitingId)).count).toBe(0);
  });
});
