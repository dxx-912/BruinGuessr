/**
 * Where the photo pool stands, and whether the live setup leaks anything.
 *
 *   npm run photos:report
 *
 * Part 1: counts by source and status, and how photos are spread across campus.
 * Part 2: anti-cheat checks against the real Supabase project, using only what a
 *         player's browser has (the public key): every table must be unreadable,
 *         the bucket unlistable, photos unfetchable by filename, and stored files
 *         free of metadata.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { area as turfArea, bbox as turfBbox, booleanPointInPolygon } from "@turf/turf";
import { createClient } from "@supabase/supabase-js";
import exifr from "exifr";
import sharp from "sharp";
import type { AreaCollection } from "../../src/lib/geo/boundary";
import { STORAGE_BUCKET } from "../../src/lib/pipeline/config";
import { campusShapes } from "../../src/lib/pipeline/geo";
import { adminClient } from "../../src/lib/pipeline/publish";
import { isPublishable, readCatalog } from "../../src/lib/pipeline/store";
import type { CatalogEntry } from "../../src/lib/pipeline/types";

const COLS = 7;
const ROWS = 7;

function spread(live: CatalogEntry[]) {
  const { campus } = campusShapes();
  const [w, s, e, n] = turfBbox(campus);
  const cellW = (e - w) / COLS;
  const cellH = (n - s) / ROWS;
  const empty: string[] = [];
  const lines: string[] = [];
  let campusCells = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    let line = "";
    for (let c = 0; c < COLS; c++) {
      const x0 = w + c * cellW;
      const y0 = s + r * cellH;
      // A cell counts as campus when at least a quarter of sample points fall inside the boundary.
      let hits = 0;
      for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
        if (booleanPointInPolygon([x0 + ((i + 0.5) * cellW) / 4, y0 + ((k + 0.5) * cellH) / 4], campus)) hits++;
      }
      if (hits < 4) { line += "    ·"; continue; }
      campusCells++;
      const count = live.filter((p) => p.lng! >= x0 && p.lng! < x0 + cellW && p.lat! >= y0 && p.lat! < y0 + cellH).length;
      if (count === 0) empty.push(`${String.fromCharCode(65 + c)}${ROWS - r}`);
      line += String(count).padStart(5);
    }
    lines.push(`  ${ROWS - r} ${line}`);
  }
  const header = `    ${Array.from({ length: COLS }, (_, c) => String.fromCharCode(65 + c).padStart(5)).join("")}`;
  const cellMeters = `${Math.round(cellW * 111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180))} × ${Math.round(cellH * 111_320)} m`;
  return { grid: [header, ...lines].join("\n"), empty, campusCells, cellMeters };
}

function byArea(live: CatalogEntry[]) {
  const areas: AreaCollection = JSON.parse(readFileSync(path.join(process.cwd(), "data/campus-areas.geojson"), "utf8"));
  const inner = areas.features.filter((f) => f.properties.kind === "inner");
  // The Hill has no outline in OpenStreetMap; west of De Neve Drive is a fair stand-in.
  const HILL_EAST_EDGE = -118.45;
  const rows: [string, number, number][] = [];
  const claimed = new Set<string>();
  for (const a of inner) {
    const here = live.filter((p) => booleanPointInPolygon([p.lng!, p.lat!], a));
    here.forEach((p) => claimed.add(p.key));
    rows.push([a.properties.name, here.length, turfArea(a) / 10_000]);
  }
  const rest = live.filter((p) => !claimed.has(p.key) && p.zone === "inside");
  const hill = rest.filter((p) => p.lng! < HILL_EAST_EDGE);
  rows.unshift(["The Hill (west of De Neve Dr, approx.)", hill.length, NaN]);
  rows.unshift(["Main campus east of the Hill", rest.length - hill.length, NaN]);
  rows.push(["Buffer ring outside the boundary", live.filter((p) => p.zone === "buffer").length, NaN]);
  return rows;
}

async function securityChecks(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const anon = createClient(url, publicKey, { auth: { persistSession: false } });
  const admin = adminClient();
  let ok = true;
  const check = (pass: boolean, label: string, detail = "") => {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
    if (!pass) ok = false;
  };

  const total = await admin.from("images").select("id", { count: "exact", head: true });
  const inRotation = await admin.from("images").select("id", { count: "exact", head: true }).eq("hidden", false);
  console.log(`  Supabase has ${total.count} photos, ${inRotation.count} in rotation.`);

  // 1. A browser (public key) must get nothing from the images table.
  const read = await anon.from("images").select("*").limit(5);
  check(!!read.error || (read.data ?? []).length === 0, "public key cannot read the images table", read.error?.message ?? "0 rows returned");
  const write = await anon.from("images").update({ hidden: true }).eq("hidden", false).select("id");
  check(!!write.error || (write.data ?? []).length === 0, "public key cannot change the images table", write.error?.message ?? "0 rows changed");

  // 2. A browser must not be able to list the bucket (that would hand over every filename).
  const list = await anon.storage.from(STORAGE_BUCKET).list("", { limit: 5 });
  check(!!list.error || (list.data ?? []).length === 0, "public key cannot list the photo bucket", list.error?.message ?? "0 files listed");
  const upload = await anon.storage.from(STORAGE_BUCKET).upload("probe.webp", new Uint8Array([1, 2, 3]), { contentType: "image/webp" });
  check(!!upload.error, "public key cannot upload to the photo bucket", upload.error?.message ?? "upload was accepted!");
  if (!upload.error) await admin.storage.from(STORAGE_BUCKET).remove(["probe.webp"]);

  // 3. Stored files. The bucket is private: with only the public key, a photo
  //    must not be fetchable even by someone who knows its exact filename.
  //    The server reads the same files with the secret key and checks them for metadata.
  const sample = await admin.from("images").select("id, storage_path, source_id").eq("hidden", false).limit(1000);
  const rows = (sample.data ?? []).sort(() => Math.random() - 0.5).slice(0, 12);
  let clean = 0;
  let leakyName = 0;
  let fetchable = 0;
  for (const row of rows) {
    const direct = await fetch(`${url}/storage/v1/object/public/${STORAGE_BUCKET}/${row.storage_path}`);
    const withKey = await anon.storage.from(STORAGE_BUCKET).download(row.storage_path);
    const signed = await anon.storage.from(STORAGE_BUCKET).createSignedUrl(row.storage_path, 60);
    if (direct.ok || !withKey.error || !signed.error) fetchable++;

    const file = await admin.storage.from(STORAGE_BUCKET).download(row.storage_path);
    if (file.error || !file.data) continue;
    const bytes = Buffer.from(await file.data.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    const exif = await exifr.parse(bytes, true).catch(() => null);
    if (!meta.exif && !meta.xmp && !meta.iptc && !meta.icc && !exif) clean++;
    if (row.storage_path.includes(row.source_id) || row.storage_path.includes(row.id)) leakyName++;
  }
  check(rows.length > 0 && fetchable === 0, "public key cannot fetch a photo by its storage filename", `${rows.length - fetchable}/${rows.length} sampled files refused`);
  check(rows.length > 0 && clean === rows.length, "stored photos carry no metadata", `${clean}/${rows.length} sampled files clean`);
  check(leakyName === 0, "filenames reveal neither our ID nor the source ID", `${rows.length} sampled`);

  // 4. Game tables and functions (Phase 2) are server only as well.
  let readable = 0;
  for (const table of ["settings", "profiles", "games", "game_players", "game_rounds", "guesses", "image_reports"]) {
    const res = await anon.from(table).select("*").limit(1);
    if (!res.error && (res.data ?? []).length > 0) readable++;
  }
  check(readable === 0, "public key cannot read any game table", "7 tables tried");
  const fake = "00000000-0000-4000-8000-000000000000";
  const calls = await Promise.all([
    anon.rpc("start_game", { p_user: fake }),
    anon.rpc("game_state", { p_game: fake, p_user: fake }),
    anon.rpc("round_photo_path", { p_game: fake, p_user: fake, p_round: 1 }),
    anon.rpc("lock_guess", { p_game: fake, p_user: fake, p_round: 1 }),
  ]);
  check(calls.every((c) => c.error), "public key cannot call any game function", `${calls.filter((c) => c.error).length}/${calls.length} calls refused`);

  const reported = await admin.from("images").select("id", { count: "exact", head: true }).gt("report_count", 0);
  if (reported.count) console.log(`  ${reported.count} photo(s) have player reports. See them with: npm run photos:reports`);
  return ok;
}

async function main() {
  const catalog = await readCatalog();
  const live = catalog.filter(isPublishable);

  console.log("PHOTO POOL");
  for (const source of ["mapillary", "wikimedia", "original"] as const) {
    const all = catalog.filter((e) => e.source === source);
    const n = (s: string) => all.filter((e) => e.status === s).length;
    console.log(
      `  ${source.padEnd(10)} ${String(all.filter(isPublishable).length).padStart(4)} playable   (${n("approved")} approved, ${n("pending")} waiting, ${n("rejected")} rejected)`,
    );
  }
  console.log(`  ${"total".padEnd(10)} ${String(live.length).padStart(4)} playable`);

  console.log("\nBY AREA");
  for (const [name, count, ha] of byArea(live)) {
    console.log(`  ${String(count).padStart(4)}  ${name}${Number.isNaN(ha) ? "" : `  (${ha.toFixed(1)} ha)`}`);
  }

  const s = spread(live);
  console.log(`\nSPREAD (north at top, cells about ${s.cellMeters}; · is outside campus)`);
  console.log(s.grid);
  console.log(`\n  ${s.campusCells - s.empty.length} of ${s.campusCells} campus cells have at least one photo.`);
  console.log(`  Empty cells: ${s.empty.join(", ") || "none"}`);

  console.log("\nANTI-CHEAT CHECKS (live Supabase project)");
  const ok = await securityChecks();
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
