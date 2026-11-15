/**
 * Phase 1, source 2: Wikimedia Commons.
 *
 *   npm run photos:wikimedia              fetch, filter, download and process
 *   npm run photos:wikimedia -- --refresh ignore cached metadata and ask Commons again
 *   npm run photos:wikimedia -- --offline download nothing; work with files already fetched
 *
 * Finds geotagged files whose camera location is inside the campus boundary,
 * keeps only CC0 / CC BY / CC BY-SA photos of usable size and shape, thins
 * crowded spots, downloads a 1920 px rendition of each and strips it.
 * Writes .cache/pipeline/catalog/wikimedia.json.
 *
 * Commons throttles anonymous scripts, so requests are paced and a run may only
 * fetch a few new files. Re-run to pick up the rest (see WIKIMEDIA_USER_AGENT below).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bbox as turfBbox } from "@turf/turf";
import { haversineMeters } from "../../src/lib/geo/distance";
import { PIPELINE } from "../../src/lib/pipeline/config";
import { campusShapes, zoneOf } from "../../src/lib/pipeline/geo";
import { processImage } from "../../src/lib/pipeline/image";
import { paths, readJson, writeJson } from "../../src/lib/pipeline/store";
import type { Candidate } from "../../src/lib/pipeline/types";
import { acceptedLicense, captureDate, plainCredit } from "../../src/lib/pipeline/wikimedia";

const REFRESH = process.argv.includes("--refresh");
const OFFLINE = process.argv.includes("--offline");
const P = paths();
const DIR = path.join(P.dir, "wikimedia");
const RAW = path.join(DIR, "raw");
const META_FILE = path.join(DIR, "meta.json");
const API = "https://commons.wikimedia.org/w/api.php";
/**
 * Wikimedia asks scripts to identify themselves with contact details in the
 * User-Agent, and gives anonymous ones a very small allowance for images it has to
 * render (a couple per ten minutes). To lift that, set WIKIMEDIA_USER_AGENT in
 * .env.local, e.g.  WIKIMEDIA_USER_AGENT="BruinGuessrImport/1.0 (you@example.com)".
 * It is sent only to Wikimedia.
 */
const HEADERS = { "User-Agent": process.env.WIKIMEDIA_USER_AGENT || "campus-photo-pipeline/0.1 (one-off import script)" };
/** Commons' standard thumbnail widths that are big enough to be useful, largest first. */
const STANDARD_WIDTHS = [1920, 1280];

type Ext = { value?: string };
type CommonsFile = {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  info?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    timestamp?: string;
    user?: string;
    extmetadata?: Record<string, Ext>;
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paced(url: string | URL): Promise<Response> {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      await sleep(1100);
      return res;
    }
    last = `HTTP ${res.status}`;
    await sleep(5000 * (attempt + 1)); // throttled: back off and try again
  }
  throw new Error(`Wikimedia Commons kept refusing (${last}): ${String(url).slice(0, 90)}`);
}

async function apiJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await paced(url);
    try {
      return JSON.parse(await res.text()) as T;
    } catch {
      await sleep(5000 * (attempt + 1)); // a throttling notice came back as plain text
    }
  }
  throw new Error("Wikimedia Commons did not return JSON");
}

async function geosearch(box: number[], out: Map<number, CommonsFile>, depth = 0): Promise<void> {
  const [w, s, e, n] = box;
  const data = await apiJson<{ query?: { geosearch: { pageid: number; title: string; lat: number; lon: number }[] } }>({
    action: "query",
    list: "geosearch",
    gsnamespace: "6", // File:
    gslimit: "500",
    gsprimary: "primary", // where the camera stood, not where the subject is
    gsbbox: `${n}|${w}|${s}|${e}`,
  });
  const rows = data.query?.geosearch ?? [];
  if (rows.length >= 500 && depth < 5) {
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    for (const q of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) await geosearch(q, out, depth + 1);
    return;
  }
  for (const r of rows) out.set(r.pageid, r);
}

async function fetchMetadata(): Promise<CommonsFile[]> {
  if (!REFRESH && existsSync(META_FILE)) {
    console.log("Using cached Commons metadata (pass --refresh to fetch again)");
    return readJson<CommonsFile[]>(META_FILE, []);
  }
  const [w, s, e, n] = turfBbox(campusShapes().campus);
  console.log("Searching Commons for geotagged files…");
  const found = new Map<number, CommonsFile>();
  const COLS = 3;
  const ROWS = 3;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      await geosearch(
        [w + ((e - w) * c) / COLS, s + ((n - s) * r) / ROWS, w + ((e - w) * (c + 1)) / COLS, s + ((n - s) * (r + 1)) / ROWS],
        found,
      );
    }
  }
  const inside = [...found.values()].filter((f) => zoneOf(f.lon, f.lat) === "inside");
  console.log(`  ${found.size} in the bounding box, ${inside.length} inside the boundary`);

  console.log("Fetching license and size details…");
  for (let i = 0; i < inside.length; i += 50) {
    const batch = inside.slice(i, i + 50);
    const data = await apiJson<{ query?: { pages: { pageid: number; imageinfo?: CommonsFile["info"][] }[] } }>({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|size|mime|timestamp|user|extmetadata",
      iiurlwidth: "1920",
      pageids: batch.map((f) => f.pageid).join("|"),
    });
    for (const page of data.query?.pages ?? []) {
      const file = batch.find((f) => f.pageid === page.pageid);
      if (file) file.info = page.imageinfo?.[0];
    }
  }
  await writeJson(META_FILE, inside);
  return inside;
}

/**
 * Commons blocks a refused file (every size of it) for ten minutes, and each new
 * request restarts that clock. So refusals are remembered between runs and a
 * refused file is left alone for a while; other files are unaffected.
 */
const REFUSED_FILE = path.join(DIR, "refused.json");
const COOL_DOWN_MS = 20 * 60 * 1000;
const refused: Record<string, string> = {};
let refusedThisRun = 0;
let throttled = false;

async function download(file: CommonsFile): Promise<string> {
  const target = path.join(RAW, `${file.pageid}.img`);
  if (existsSync(target)) return target;
  if (throttled) throw new Error("skipped: Commons is throttling downloads");
  const last = refused[file.pageid];
  if (last && Date.now() - new Date(last).getTime() < COOL_DOWN_MS) {
    throw new Error("Commons refused this file recently; leaving it alone for 20 minutes");
  }
  if (OFFLINE) throw new Error("not downloaded yet");
  const info = file.info!;
  await mkdir(RAW, { recursive: true });

  // Commons asks scripts to use its standard thumbnail widths (https://w.wiki/GHai).
  // Those are served freely; originals and odd sizes such as 2048 px get
  // "429 Too many requests" after a handful of downloads. 1920 px is plenty for a
  // 1600 px output. Only a photo smaller than every standard size is fetched whole.
  const sizes = info.thumburl ? STANDARD_WIDTHS.filter((w) => w < info.width) : [];
  for (const width of sizes) {
    const res = await fetch(info.thumburl!.replace(/\/\d+px-/, `/${width}px-`), { headers: HEADERS });
    await sleep(2500);
    if (res.ok) {
      delete refused[file.pageid];
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      return target;
    }
    if (res.status === 429) {
      // A refusal covers every size of this file for about ten minutes, and asking again
      // only extends it. Leave this file for the next run and move on.
      refused[file.pageid] = new Date().toISOString();
      if (++refusedThisRun >= 3) throttled = true; // the allowance is used up: stop asking for this run
      throw new Error("Commons refused this file for now; run again in 20 minutes to pick it up");
    }
  }
  if (sizes.length) throw new Error("no standard size available");
  const res = await paced(info.url);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

async function main() {
  const cfg = PIPELINE.wikimedia;
  const all = await fetchMetadata();

  const drop: Record<string, number> = {};
  const count = (why: string) => void (drop[why] = (drop[why] ?? 0) + 1);

  type Kept = { file: CommonsFile; license: { name: string; url: string | null }; capturedAt: string | null; score: number };
  const pool: Kept[] = [];
  for (const file of all) {
    const info = file.info;
    if (!info) { count("no file details"); continue; }
    if (!/^image\/(jpeg|png|webp|tiff)$/.test(info.mime)) { count("not a photo format"); continue; }
    const meta = info.extmetadata ?? {};
    const license = acceptedLicense(meta.License?.value, meta.LicenseShortName?.value, meta.LicenseUrl?.value);
    if (!license) { count(`license not accepted (${meta.LicenseShortName?.value ?? meta.License?.value ?? "unknown"})`); continue; }
    if (Math.max(info.width, info.height) < cfg.minLongEdgePx) { count("too small"); continue; }
    const aspect = info.width / info.height;
    if (aspect < cfg.minAspect || aspect > cfg.maxAspect) { count("panorama or sliver shape"); continue; }
    const capturedAt = captureDate(meta.DateTimeOriginal?.value, info.timestamp);
    const year = capturedAt ? new Date(capturedAt).getUTCFullYear() : null;
    if (year !== null && year < cfg.minYear) { count(`taken before ${cfg.minYear}`); continue; }
    pool.push({
      file,
      license,
      capturedAt,
      score: Math.min(info.width * info.height, 12e6) / 12e6 + (year ? (year - cfg.minYear) / 40 : 0),
    });
  }

  // Thin crowded spots: Commons has no camera heading, so allow a couple per spot.
  const kept: Kept[] = [];
  for (const item of pool.sort((a, b) => b.score - a.score)) {
    const near = kept.filter(
      (k) => haversineMeters({ lat: k.file.lat, lng: k.file.lon }, { lat: item.file.lat, lng: item.file.lon }) <= cfg.spotRadiusM,
    );
    if (near.length >= cfg.maxPerSpot) { count(`more than ${cfg.maxPerSpot} at one spot`); continue; }
    kept.push(item);
  }

  console.log(`\n${all.length} geotagged files inside the boundary`);
  for (const [why, n] of Object.entries(drop).sort((a, b) => b[1] - a[1])) console.log(`  −${String(n).padStart(4)}  ${why}`);
  console.log(`  =${String(kept.length).padStart(4)}  to download`);

  Object.assign(refused, await readJson<Record<string, string>>(REFUSED_FILE, {}));
  const previous = new Map((await readJson<Candidate[]>(P.candidates("wikimedia"), [])).map((c) => [c.key, c]));
  const candidates: Candidate[] = [];
  let blurry = 0;
  let failed = 0;
  let done = 0;
  for (const k of kept) {
    const key = `wikimedia:${k.file.pageid}`;
    const info = k.file.info!;
    done++;
    if (done % 20 === 0) console.log(`  processed ${done}/${kept.length}`);
    try {
      const prev = previous.get(key);
      const processed =
        prev && existsSync(path.join(P.dir, prev.file))
          ? { file: prev.file, thumb: prev.thumb, width: prev.width, height: prev.height, sharpness: prev.sharpness }
          : await processImage(await readFile(await download(k.file)), key);
      if (processed.sharpness < PIPELINE.minSharpness) { blurry++; continue; }
      candidates.push({
        key,
        source: "wikimedia",
        sourceId: String(k.file.pageid),
        lat: k.file.lat,
        lng: k.file.lon,
        heading: null,
        capturedAt: k.capturedAt,
        photographer: plainCredit(info.extmetadata?.Artist?.value, info.user ?? "Wikimedia Commons contributor"),
        photographerUrl: null,
        license: k.license.name,
        licenseUrl: k.license.url,
        sourceUrl: info.descriptionurl,
        ...processed,
        quality: null,
        onFoot: null,
        // Commons has plenty of portraits, interiors and event shots: nothing goes live without a look.
        defaultStatus: "pending",
        notes: [k.file.title.replace(/^File:/, "")],
      });
    } catch (err) {
      failed++;
      if (!OFFLINE && !throttled) console.warn(`  ! ${k.file.title}: ${err instanceof Error ? err.message : err}`);
    }
  }

  await writeJson(P.candidates("wikimedia"), candidates);
  await writeJson(REFUSED_FILE, refused);
  console.log(`\nKept ${candidates.length} candidates (${blurry} dropped as blurry, ${failed} not downloaded${failed && !OFFLINE ? ": run again in 20 minutes to pick them up" : ""}).`);
  console.log("Wrote .cache/pipeline/catalog/wikimedia.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
