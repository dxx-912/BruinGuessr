/**
 * Phase 0 decision aid: where do open photos exist around campus?
 *
 *   npm run campus:probe
 *
 * Reads positions (no image IDs, no downloads) of
 *   - Mapillary photos, from the public vector tiles
 *   - geotagged Wikimedia Commons files
 * around the campus and writes them to .cache/review/photo-dots.json, which the
 * dev-only boundary review page draws as dots.
 *
 * The output is gitignored on purpose: photo locations are the answers to the game.
 * This is not the Phase 1 pipeline, only a quick count to help choose the boundary.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { bbox as turfBbox } from "@turf/turf";
import { PbfReader } from "pbf";
import type { AreaCollection } from "../src/lib/geo/boundary";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".cache/review/photo-dots.json");
const PAD_DEG = 0.0015; // ~150 m of margin around all candidate areas
const UA = { "User-Agent": "campus-coverage-probe/0.1" };

export type PhotoDot = {
  lng: number;
  lat: number;
  /** m = Mapillary, w = Wikimedia Commons */
  src: "m" | "w";
  /** Mapillary only */
  pano?: boolean;
  foot?: boolean;
  quality?: number;
  year?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mapillaryDots(box: number[], token: string): Promise<PhotoDot[]> {
  const [west, south, east, north] = box;
  const Z = 14;
  const n = 2 ** Z;
  const tileX = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const tileY = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const seen = new Map<string, PhotoDot>();
  for (let x = tileX(west); x <= tileX(east); x++) {
    for (let y = tileY(north); y <= tileY(south); y++) {
      // Computed positions: Mapillary's corrected camera locations, the same ones Phase 1 will use.
      const url = `https://tiles.mapillary.com/maps/vtp/mly1_computed_public/2/${Z}/${x}/${y}?access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mapillary tile ${Z}/${x}/${y} returned HTTP ${res.status}`);
      const layer = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))).layers.image;
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        const geo = f.toGeoJSON(x, y, Z).geometry;
        if (geo.type !== "Point") continue;
        const [lng, lat] = geo.coordinates;
        if (lng < west || lng > east || lat < south || lat > north) continue;
        const p = f.properties;
        seen.set(String(p.id), {
          lng: +lng.toFixed(6),
          lat: +lat.toFixed(6),
          src: "m",
          pano: p.is_pano === true,
          foot: p.foot === true || p.on_foot === true,
          quality: typeof p.quality_score === "number" ? +p.quality_score.toFixed(2) : undefined,
          year: typeof p.captured_at === "number" ? new Date(p.captured_at).getUTCFullYear() : undefined,
        });
      }
    }
  }
  return [...seen.values()];
}

async function commonsDots(box: number[]): Promise<PhotoDot[]> {
  const seen = new Map<number, PhotoDot>();
  async function query(w: number, s: number, e: number, n: number, depth = 0): Promise<void> {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      list: "geosearch",
      format: "json",
      gsnamespace: "6", // File:
      gslimit: "500",
      gsprimary: "primary", // camera location, not the location of the subject
      gsbbox: `${n}|${w}|${s}|${e}`,
    }).toString();
    let rows: { pageid: number; title: string; lat: number; lon: number }[] | undefined;
    for (let attempt = 0; attempt < 5 && !rows; attempt++) {
      const res = await fetch(url, { headers: UA });
      try {
        rows = JSON.parse(await res.text()).query.geosearch;
      } catch {
        await sleep(4000 * (attempt + 1)); // rate limited: back off and retry
      }
    }
    if (!rows) throw new Error("Wikimedia Commons kept rate limiting; try again in a minute");
    await sleep(1200);
    if (rows.length >= 500 && depth < 5) {
      const mx = (w + e) / 2;
      const my = (s + n) / 2;
      await query(w, s, mx, my, depth + 1);
      await query(mx, s, e, my, depth + 1);
      await query(w, my, mx, n, depth + 1);
      await query(mx, my, e, n, depth + 1);
      return;
    }
    for (const r of rows) {
      if (!/\.(jpe?g|png|webp|tiff?)$/i.test(r.title)) continue;
      seen.set(r.pageid, { lng: +r.lon.toFixed(6), lat: +r.lat.toFixed(6), src: "w" });
    }
  }
  const [west, south, east, north] = box;
  const COLS = 4;
  const ROWS = 5;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      await query(
        west + ((east - west) * c) / COLS,
        south + ((north - south) * r) / ROWS,
        west + ((east - west) * (c + 1)) / COLS,
        south + ((north - south) * (r + 1)) / ROWS,
      );
    }
  }
  return [...seen.values()];
}

async function main() {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) throw new Error("MAPILLARY_TOKEN is not set (it lives in .env.local)");

  const areas: AreaCollection = JSON.parse(await readFile(path.join(ROOT, "data/campus-areas.geojson"), "utf8"));
  const [w, s, e, n] = turfBbox(areas);
  const box = [w - PAD_DEG, s - PAD_DEG, e + PAD_DEG, n + PAD_DEG];

  console.log("Reading Mapillary vector tiles…");
  const mapillary = await mapillaryDots(box, token);
  console.log(`  ${mapillary.length} photo positions (${mapillary.filter((d) => d.pano).length} panoramas)`);

  console.log("Querying Wikimedia Commons (paced, takes about a minute)…");
  const commons = await commonsDots(box);
  console.log(`  ${commons.length} geotagged photos`);

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), dots: [...mapillary, ...commons] }));
  console.log(`\nWrote ${path.relative(ROOT, OUT)} (gitignored). Open /dev/boundary to see it.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
