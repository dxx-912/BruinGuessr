import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PIPELINE } from "./config";
import { fileStem, paths } from "./store";

export type ProcessedImage = {
  /** Relative to .cache/pipeline/. */
  file: string;
  thumb: string;
  width: number;
  height: number;
  sharpness: number;
};

/**
 * Turns any source image into the file players receive.
 *
 * sharp re-encodes from pixels and writes no metadata unless asked to, so the
 * output carries no EXIF, GPS, XMP, IPTC or embedded thumbnail (SPEC.md, anti cheat).
 * `.rotate()` first bakes the EXIF orientation into the pixels so nothing depends on it.
 */
export async function processImage(input: string | Buffer, key: string, root = process.cwd()): Promise<ProcessedImage> {
  const p = paths(root);
  await mkdir(p.processed, { recursive: true });
  const stem = fileStem(key);
  const file = path.join("processed", `${stem}.webp`);
  const thumb = path.join("processed", `${stem}.thumb.webp`);
  const { maxEdgePx, webpQuality, thumbEdgePx } = PIPELINE.output;

  const upright = sharp(input, { failOn: "error" }).rotate();
  const info = await upright
    .clone()
    .resize({ width: maxEdgePx, height: maxEdgePx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: webpQuality, effort: 5 })
    .toFile(path.join(p.dir, file));
  await upright
    .clone()
    .resize({ width: thumbEdgePx, height: thumbEdgePx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(path.join(p.dir, thumb));

  return { file, thumb, width: info.width, height: info.height, sharpness: await sharpnessOf(input) };
}

/**
 * Variance of the Laplacian on a 512 px greyscale copy: a standard blur measure.
 * Sharp photos have strong edges and score in the hundreds; blurry ones score low.
 */
export async function sharpnessOf(input: string | Buffer): Promise<number> {
  const { data, info } = await sharp(input)
    .rotate()
    .greyscale()
    .resize({ width: 512, height: 512, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.round((sumSq / n - mean * mean) * 10) / 10;
}

/** True when a processed file still contains any metadata block. Used by the publish safety check. */
export async function hasMetadata(file: string): Promise<boolean> {
  const m = await sharp(file).metadata();
  return Boolean(m.exif || m.xmp || m.iptc || m.icc || m.tifftagPhotoshop);
}
