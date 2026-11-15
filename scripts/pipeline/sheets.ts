/**
 * Contact sheets for reviewing candidates by eye.
 *
 *   npm run photos:sheets -- --source mapillary --zone inside
 *   npm run photos:sheets -- --source wikimedia --status approved
 *   npm run photos:sheets -- --zone buffer --sample 40        random sample of 40
 *
 * Writes numbered grids to .cache/pipeline/sheets/<name>-NN.jpg plus
 * <name>.json, which maps each number back to a photo. Use the numbers with
 * `npm run photos:decide`.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { paths, readCatalog, writeJson } from "../../src/lib/pipeline/store";
import type { CatalogEntry } from "../../src/lib/pipeline/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const COLS = 6;
const ROWS = 4;
const CELL_W = 300;
const CELL_H = 225;
const GAP = 4;

async function main() {
  const source = arg("source");
  const zone = arg("zone");
  const status = arg("status");
  const sample = arg("sample") ? Number(arg("sample")) : undefined;
  const name = arg("name") ?? [source ?? "all", zone, status, sample ? `sample${sample}` : undefined].filter(Boolean).join("-");

  let entries = (await readCatalog()).filter(
    (e) => (!source || e.source === source) && (!zone || e.zone === zone) && (!status || e.status === status),
  );
  // Stable order: west to east in bands from north to south, so neighbours on a sheet are neighbours on campus.
  entries.sort((a, b) => Math.round(((b.lat ?? 0) - (a.lat ?? 0)) * 800) || (a.lng ?? 0) - (b.lng ?? 0));
  if (sample && sample < entries.length) {
    // Deterministic shuffle so the same command always shows the same sample.
    let seed = 20261115;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    entries = entries
      .map((e) => ({ e, r: rand() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, sample)
      .map((x) => x.e);
  }
  if (!entries.length) {
    console.log("No photos match.");
    return;
  }

  const P = paths();
  await mkdir(P.sheets, { recursive: true });
  const perSheet = COLS * ROWS;
  const index: Record<string, string> = {};
  const sheetCount = Math.ceil(entries.length / perSheet);

  for (let s = 0; s < sheetCount; s++) {
    const chunk = entries.slice(s * perSheet, (s + 1) * perSheet);
    const rows = Math.ceil(chunk.length / COLS);
    const width = COLS * CELL_W + (COLS + 1) * GAP;
    const height = rows * CELL_H + (rows + 1) * GAP;
    const layers: OverlayOptions[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const n = s * perSheet + i + 1;
      index[String(n)] = chunk[i].key;
      const left = GAP + (i % COLS) * (CELL_W + GAP);
      const top = GAP + Math.floor(i / COLS) * (CELL_H + GAP);
      const cell = await sharp(path.join(P.dir, chunk[i].thumb))
        .resize({ width: CELL_W, height: CELL_H, fit: "contain", background: "#111827" })
        .toBuffer();
      layers.push({ input: cell, left, top }, { input: label(n, chunk[i]), left, top });
    }
    const file = path.join(P.sheets, `${name}-${String(s + 1).padStart(2, "0")}.jpg`);
    await sharp({ create: { width, height, channels: 3, background: "#111827" } })
      .composite(layers)
      .jpeg({ quality: 82 })
      .toFile(file);
    console.log(path.relative(process.cwd(), file), `(#${s * perSheet + 1} to #${s * perSheet + chunk.length})`);
  }
  // Drop sheets left over from an earlier, longer run of the same name.
  for (let s = sheetCount; s < sheetCount + 40; s++) {
    await rm(path.join(P.sheets, `${name}-${String(s + 1).padStart(2, "0")}.jpg`), { force: true });
  }
  await writeJson(path.join(P.sheets, `${name}.json`), index);
  console.log(`${entries.length} photos on ${sheetCount} sheet(s). Numbers map to photos in sheets/${name}.json`);
}

function label(n: number, e: CatalogEntry): Buffer {
  const tag = e.source === "mapillary" ? (e.onFoot ? "foot" : "car") : e.source === "wikimedia" ? "wiki" : "own";
  const text = `${n} · ${tag}${e.zone === "buffer" ? " · buf" : ""}`;
  const w = 16 + text.length * 9;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24">
      <rect width="${w}" height="24" rx="3" fill="#FFD100"/>
      <text x="8" y="17" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#0b1f33">${text}</text>
    </svg>`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
