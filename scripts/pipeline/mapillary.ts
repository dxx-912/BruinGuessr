/**
 * Phase 1, source 1: Mapillary.
 *
 *   npm run photos:mapillary            fetch, filter, download and process
 *   npm run photos:mapillary -- --refresh   ignore cached metadata and ask Mapillary again
 *
 * Steps:
 *   1. Find every image in and around campus, two ways: the vector tiles (most
 *      complete listing) and the API bounding-box search (full metadata). Anything
 *      only the tiles know about is looked up one by one.
 *   2. Keep flat (non-panorama) images inside the boundary or in the buffer ring,
 *      above the quality threshold. Buffer images must also be pointed into campus.
 *   3. Thin near duplicates (same spot, same direction), keeping the best.
 *   4. Download the 2048 px thumbnail of each survivor, strip and resize it.
 *   5. Write .cache/pipeline/catalog/mapillary.json.
 *
 * Review decisions (approve, reject, moved pins) live in decisions.json and are
 * applied on top of this list. A rejected photo stays in the list so that re-running
 * gives the same candidates; its near duplicates are not promoted in its place,
 * because whatever was wrong with it (glare, a car hood) is usually wrong with them too.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { bbox as turfBbox } from "@turf/turf";
import { PbfReader } from "pbf";
import { PIPELINE } from "../../src/lib/pipeline/config";
import { campusShapes, facesCampus, thinNearDuplicates, zoneOf } from "../../src/lib/pipeline/geo";
import { processImage } from "../../src/lib/pipeline/image";
import { paths, readJson, writeJson } from "../../src/lib/pipeline/store";
import type { Candidate, Zone } from "../../src/lib/pipeline/types";

const REFRESH = process.argv.includes("--refresh");
const P = paths();
const DIR = path.join(P.dir, "mapillary");
const RAW = path.join(DIR, "raw");
const META_FILE = path.join(DIR, "meta.json");

const FIELDS = [
  "id", "geometry", "computed_geometry", "captured_at", "quality_score", "is_pano", "on_foot",
  "creator", "compass_angle", "computed_compass_angle", "camera_type", "make", "model",
  "width", "height", "sequence",
].join(",");

type Point = { type: "Point"; coordinates: [number, number] };
type MapillaryImage = {
  id: string;
  geometry?: Point;
  computed_geometry?: Point;
  captured_at?: number;
  quality_score?: number;
  is_pano?: boolean;
  on_foot?: boolean;
  creator?: { username?: string; id?: string };
  compass_angle?: number;
  computed_compass_angle?: number;
  camera_type?: string;
  make?: string;
  model?: string;
  width?: number;
  height?: number;
  sequence?: string;
};

const token = process.env.MAPILLARY_TOKEN;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(url: URL): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
      const body = (await res.json()) as T & { error?: { message: string } };
      if (!body.error) return body;
      lastError = body.error.message;
    } catch (err) {
      lastError = String(err);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`Mapillary API failed: ${lastError}`);
}

/** Step 1a: IDs from the vector tiles. */
async function idsFromTiles(box: number[]): Promise<Set<string>> {
  const [west, south, east, north] = box;
  const Z = 14;
  const n = 2 ** Z;
  const tileX = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const tileY = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const ids = new Set<string>();
  // Original and corrected positions can put an image in different tiles; read both.
  for (const tileset of ["mly1_public", "mly1_computed_public"]) {
    for (let x = tileX(west); x <= tileX(east); x++) {
      for (let y = tileY(north); y <= tileY(south); y++) {
        const res = await fetch(`https://tiles.mapillary.com/maps/vtp/${tileset}/2/${Z}/${x}/${y}?access_token=${token}`);
        if (!res.ok) throw new Error(`Mapillary tile ${tileset} ${Z}/${x}/${y}: HTTP ${res.status}`);
        const layer = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))).layers.image;
        if (!layer) continue;
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          const geo = f.toGeoJSON(x, y, Z).geometry;
          if (geo.type !== "Point") continue;
          const [lng, lat] = geo.coordinates;
          if (lng >= west && lng <= east && lat >= south && lat <= north) ids.add(String(f.properties.id));
        }
      }
    }
  }
  return ids;
}

/** Step 1b: full metadata from the bounding-box search, splitting any box that hits the 2000 limit. */
async function searchBox(box: number[], out: Map<string, MapillaryImage>, depth = 0): Promise<void> {
  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("bbox", box.map((v) => v.toFixed(6)).join(","));
  url.searchParams.set("limit", "2000");
  const { data } = await api<{ data: MapillaryImage[] }>(url);
  if (data.length >= 2000 && depth < 8) {
    const [w, s, e, n] = box;
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    for (const q of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) await searchBox(q, out, depth + 1);
    return;
  }
  for (const img of data) out.set(String(img.id), { ...img, id: String(img.id) });
}

async function fetchMetadata(): Promise<MapillaryImage[]> {
  if (!REFRESH && existsSync(META_FILE)) {
    console.log("Using cached Mapillary metadata (pass --refresh to fetch again)");
    return readJson<MapillaryImage[]>(META_FILE, []);
  }
  const [w, s, e, n] = turfBbox(campusShapes().ring);
  const pad = 0.0003;
  const box = [w - pad, s - pad, e + pad, n + pad];

  console.log("Listing images from vector tiles…");
  const tileIds = await idsFromTiles(box);
  console.log(`  ${tileIds.size} images in the tiles`);

  console.log("Fetching metadata by bounding box…");
  const found = new Map<string, MapillaryImage>();
  const STEP = 0.004;
  for (let x = box[0]; x < box[2]; x += STEP) {
    for (let y = box[1]; y < box[3]; y += STEP) {
      await searchBox([x, y, Math.min(x + STEP, box[2]), Math.min(y + STEP, box[3])], found);
    }
  }
  console.log(`  ${found.size} images from the search`);

  const missing = [...tileIds].filter((id) => !found.has(id));
  if (missing.length) console.log(`Looking up ${missing.length} images only the tiles listed…`);
  for (const id of missing) {
    const url = new URL(`https://graph.mapillary.com/${id}`);
    url.searchParams.set("fields", FIELDS);
    try {
      const img = await api<MapillaryImage>(url);
      found.set(id, { ...img, id });
    } catch {
      // Deleted or private since the tile was built. Nothing to keep.
    }
  }

  const all = [...found.values()];
  await writeJson(META_FILE, all);
  return all;
}

async function download(id: string): Promise<string> {
  const file = path.join(RAW, `${id}.jpg`);
  if (existsSync(file)) return file;
  // Thumbnail URLs are signed and expire, so ask for a fresh one right before downloading.
  const url = new URL(`https://graph.mapillary.com/${id}`);
  url.searchParams.set("fields", "thumb_2048_url");
  const { thumb_2048_url } = await api<{ thumb_2048_url?: string }>(url);
  if (!thumb_2048_url) throw new Error("no 2048 px thumbnail");
  const res = await fetch(thumb_2048_url);
  if (!res.ok) throw new Error(`thumbnail HTTP ${res.status}`);
  await mkdir(RAW, { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

type Scored = {
  img: MapillaryImage;
  lat: number;
  lng: number;
  heading: number | null;
  zone: Zone;
  score: number;
};

async function main() {
  if (!token) throw new Error("MAPILLARY_TOKEN is not set (it lives in .env.local)");
  const cfg = PIPELINE.mapillary;
  const all = await fetchMetadata();

  const drop: Record<string, number> = {};
  const count = (why: string) => void (drop[why] = (drop[why] ?? 0) + 1);

  const pool: Scored[] = [];
  for (const img of all) {
    const pos = (img.computed_geometry ?? img.geometry)?.coordinates;
    if (!pos) { count("no position"); continue; }
    const [lng, lat] = pos;
    const zone = zoneOf(lng, lat);
    if (zone === "outside") { count("outside boundary and buffer"); continue; }
    if (img.is_pano) { count("panorama"); continue; }
    if (img.camera_type && img.camera_type !== "perspective") { count(`camera type ${img.camera_type}`); continue; }
    if (typeof img.quality_score === "number" && img.quality_score < cfg.minQuality) { count(`quality below ${cfg.minQuality}`); continue; }
    const heading = img.computed_compass_angle ?? img.compass_angle ?? null;
    if (zone === "buffer" && (heading === null || !facesCampus(lng, lat, heading))) { count("buffer photo not facing campus"); continue; }

    const year = img.captured_at ? new Date(img.captured_at).getUTCFullYear() : 2015;
    const score =
      (img.quality_score ?? 0.5) +
      (img.on_foot ? 0.15 : 0) +
      Math.max(0, Math.min(10, year - 2015)) * 0.02 +
      (zone === "inside" ? 0.5 : 0); // a photo taken on campus beats one taken from the street
    pool.push({ img, lat, lng, heading, zone, score });
  }

  const kept = thinNearDuplicates(pool, cfg.dupRadiusM, cfg.dupHeadingDeg);
  drop["near duplicate of a better photo"] = pool.length - kept.length;

  console.log(`\n${all.length} images around campus`);
  for (const [why, n] of Object.entries(drop).sort((a, b) => b[1] - a[1])) console.log(`  −${String(n).padStart(5)}  ${why}`);
  console.log(`  =${String(kept.length).padStart(5)}  to download (${kept.filter((k) => k.zone === "inside").length} inside, ${kept.filter((k) => k.zone === "buffer").length} buffer)`);

  const previous = new Map((await readJson<Candidate[]>(P.candidates("mapillary"), [])).map((c) => [c.key, c]));
  const candidates: Candidate[] = [];
  let blurry = 0;
  let failed = 0;
  let done = 0;
  for (const k of kept) {
    const key = `mapillary:${k.img.id}`;
    done++;
    if (done % 50 === 0) console.log(`  processed ${done}/${kept.length}`);
    try {
      const prev = previous.get(key);
      const processed =
        prev && existsSync(path.join(P.dir, prev.file))
          ? { file: prev.file, thumb: prev.thumb, width: prev.width, height: prev.height, sharpness: prev.sharpness }
          : await processImage(await readFile(await download(k.img.id)), key);
      if (processed.sharpness < PIPELINE.minSharpness) { blurry++; continue; }
      candidates.push({
        key,
        source: "mapillary",
        sourceId: k.img.id,
        lat: k.lat,
        lng: k.lng,
        heading: k.heading === null ? null : ((k.heading % 360) + 360) % 360,
        capturedAt: k.img.captured_at ? new Date(k.img.captured_at).toISOString() : null,
        photographer: k.img.creator?.username ?? "Mapillary contributor",
        photographerUrl: k.img.creator?.username ? `https://www.mapillary.com/app/user/${k.img.creator.username}` : null,
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        sourceUrl: `https://www.mapillary.com/app/?pKey=${k.img.id}`,
        ...processed,
        quality: k.img.quality_score ?? null,
        onFoot: k.img.on_foot ?? null,
        // Nothing goes live without a look: every candidate waits for an explicit decision.
        defaultStatus: "pending",
        notes: k.zone === "buffer" ? ["taken from just outside campus"] : [],
      });
    } catch (err) {
      failed++;
      console.warn(`  ! ${k.img.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  await writeJson(P.candidates("mapillary"), candidates);
  console.log(`\nKept ${candidates.length} candidates (${blurry} dropped as blurry, ${failed} failed to download).`);
  console.log("Wrote .cache/pipeline/catalog/mapillary.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
