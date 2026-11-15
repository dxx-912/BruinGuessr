/**
 * Phase 1, source 3: your own phone photos.
 *
 *   1. Drop photos (JPEG, HEIC, PNG) into /photos-inbox. Subfolders are fine.
 *   2. npm run photos:import -- --credit "Your Name"
 *   3. Open http://localhost:3000/dev/photos, fix any pins, approve, publish.
 *
 * For each new photo this reads GPS position, compass heading and capture time
 * from EXIF, then writes a stripped, resized copy (no metadata at all) into
 * .cache/pipeline/. Imported photos start as "pending": nothing goes live until
 * it is approved on the review page. Photos without GPS are imported too and
 * wait for a pin to be placed by hand.
 *
 * The inbox is never modified. A photo is recognised by its contents, so
 * re-running skips ones already imported even if they were renamed.
 * The credit and license are remembered for next time.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import exifr from "exifr";
import { haversineMeters } from "../../src/lib/geo/distance";
import { PIPELINE } from "../../src/lib/pipeline/config";
import { headingDiff, zoneOf } from "../../src/lib/pipeline/geo";
import { processImage } from "../../src/lib/pipeline/image";
import { paths, readJson, writeJson } from "../../src/lib/pipeline/store";
import type { Candidate } from "../../src/lib/pipeline/types";

const run = promisify(execFile);
const ROOT = process.cwd();
const INBOX = path.join(ROOT, "photos-inbox");
const P = paths();
const SETTINGS = path.join(P.dir, "original", "settings.json");
const PHOTO = /\.(jpe?g|png|heic|heif|webp)$/i;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function listPhotos(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listPhotos(full)));
    else if (PHOTO.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/** sharp cannot decode iPhone HEIC, so macOS's built-in `sips` converts it first. */
async function decodable(file: string, bytes: Buffer): Promise<Buffer> {
  if (!/\.(heic|heif)$/i.test(file)) return bytes;
  const dir = await mkdtemp(path.join(tmpdir(), "bruinguessr-heic-"));
  try {
    const out = path.join(dir, "converted.jpg");
    await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "95", file, "--out", out]);
    return await readFile(out);
  } catch {
    throw new Error("could not convert HEIC (needs macOS `sips`); export it as JPEG and try again");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Exif = {
  latitude?: number;
  longitude?: number;
  GPSImgDirection?: number;
  GPSHPositioningError?: number;
  DateTimeOriginal?: Date | string;
};

async function main() {
  if (!existsSync(INBOX)) {
    console.log("There is no /photos-inbox folder yet. Create it, drop photos in, and run this again.");
    return;
  }
  const saved = await readJson<{ credit?: string; license?: string }>(SETTINGS, {});
  const credit = arg("credit") ?? saved.credit;
  const license = arg("license") ?? saved.license ?? "© the photographer, used with permission";
  if (!credit) {
    console.error('Tell me whose name goes on the photo credit, e.g.  npm run photos:import -- --credit "Daniel X."');
    process.exit(1);
  }
  await writeJson(SETTINGS, { credit, license });

  const files = await listPhotos(INBOX);
  const existing = await readJson<Candidate[]>(P.candidates("original"), []);
  const byKey = new Map(existing.map((c) => [c.key, c]));
  console.log(`${files.length} photo(s) in /photos-inbox, ${existing.length} imported earlier. Credit: ${credit}`);

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const problems = { noGps: 0, offCampus: 0, lowAccuracy: 0, blurry: 0, duplicate: 0 };

  for (const file of files) {
    const name = path.relative(INBOX, file);
    try {
      const bytes = await readFile(file);
      const sourceId = createHash("sha1").update(bytes).digest("hex").slice(0, 16);
      const key = `original:${sourceId}`;
      const prev = byKey.get(key);
      if (prev && existsSync(path.join(P.dir, prev.file))) {
        skipped++;
        continue;
      }

      const exif = ((await exifr.parse(bytes, { gps: true, exif: true, tiff: true }).catch(() => null)) ?? {}) as Exif;
      const hasGps = Number.isFinite(exif.latitude) && Number.isFinite(exif.longitude);
      const lat = hasGps ? exif.latitude! : null;
      const lng = hasGps ? exif.longitude! : null;
      const heading = Number.isFinite(exif.GPSImgDirection) ? ((exif.GPSImgDirection! % 360) + 360) % 360 : null;
      const taken = exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : null;

      const processed = await processImage(await decodable(file, bytes), key);

      const notes: string[] = [name];
      if (lat === null || lng === null) {
        notes.push("No GPS in this photo: click the map to place it");
        problems.noGps++;
      } else {
        if (zoneOf(lng, lat) === "outside") {
          notes.push("GPS puts this outside campus: check the pin");
          problems.offCampus++;
        }
        if (Number.isFinite(exif.GPSHPositioningError) && exif.GPSHPositioningError! > 15) {
          notes.push(`Phone reported GPS accuracy of ±${Math.round(exif.GPSHPositioningError!)} m: check the pin`);
          problems.lowAccuracy++;
        }
        const twin = [...byKey.values()].find(
          (o) =>
            o.lat !== null && o.lng !== null &&
            haversineMeters({ lat, lng }, { lat: o.lat, lng: o.lng }) <= 8 &&
            (heading === null || o.heading === null || headingDiff(heading, o.heading) < PIPELINE.mapillary.dupHeadingDeg),
        );
        if (twin) {
          notes.push(`Possible duplicate of ${twin.notes[0] ?? "another import"} (same spot, same direction)`);
          problems.duplicate++;
        }
      }
      if (processed.sharpness < PIPELINE.minSharpness) {
        notes.push("Looks blurry");
        problems.blurry++;
      }

      byKey.set(key, {
        key,
        source: "original",
        sourceId,
        lat,
        lng,
        heading,
        capturedAt: taken && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null,
        photographer: credit,
        photographerUrl: null,
        license,
        licenseUrl: null,
        sourceUrl: null,
        ...processed,
        quality: null,
        onFoot: true,
        defaultStatus: "pending",
        notes,
      });
      added++;
      if (added % 20 === 0) console.log(`  imported ${added}…`);
    } catch (err) {
      failed++;
      console.warn(`  ! ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  await writeJson(P.candidates("original"), [...byKey.values()]);
  console.log(`\nImported ${added} new photo(s), skipped ${skipped} already imported, ${failed} failed.`);
  if (added) {
    const flagged = Object.entries({
      "without GPS (place by hand)": problems.noGps,
      "with GPS outside campus": problems.offCampus,
      "with poor GPS accuracy": problems.lowAccuracy,
      "that look blurry": problems.blurry,
      "that may be duplicates": problems.duplicate,
    }).filter(([, n]) => n > 0);
    for (const [what, n] of flagged) console.log(`  ${n} ${what}`);
    console.log("Nothing is live yet. Review them at http://localhost:3000/dev/photos (run `npm run dev` first).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
